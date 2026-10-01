import { useEffect, useRef, type CSSProperties } from "react";

import { HISTORY_PAGE_TURNS } from "../../core/constants";
import type { Section } from "../../core/types";
import type { RailPosition } from "../../core/positionManager";
import type { Translate } from "../locales";
import { SectionRailItem } from "./SectionRailItem";

interface SectionRailProps {
  activeSectionId: string | null;
  bookmarkedSectionKeys: ReadonlySet<string>;
  bookmarkCount: number;
  /** Whether the reader collapsed the rail into its edge button. */
  collapsed: boolean;
  drawerOpen: boolean;
  /** Every older turn has been paged in; the load control can no longer help. */
  historyComplete: boolean;
  /** A history page is being fetched right now. */
  historyLoading: boolean;
  /** The reader asked for turns older than the rendered window. */
  onReachTop(): void;
  onSectionSelect(section: Section): void;
  onToggleBookmark(section: Section): void;
  onToggleCollapsed(): void;
  onToggleDrawer(): void;
  position: RailPosition;
  sections: Section[];
  t: Translate;
}

interface SectionGroup {
  key: string;
  sections: Section[];
}

export function SectionRail({
  activeSectionId,
  bookmarkedSectionKeys,
  bookmarkCount,
  collapsed,
  drawerOpen,
  historyComplete,
  historyLoading,
  onReachTop,
  onSectionSelect,
  onToggleBookmark,
  onToggleCollapsed,
  onToggleDrawer,
  position,
  sections,
  t,
}: SectionRailProps) {
  const listRef = useRef<HTMLOListElement>(null);
  // Whether the list should keep following its newest entry. Starts true so a
  // freshly opened session shows the latest turn, and turns false only once
  // the reader scrolls up to read older ones.
  const followTailRef = useRef(true);
  // The callback changes on every render, so read it through a ref to keep the
  // scroll listener mounted once for the lifetime of the list.
  const reachTopRef = useRef(onReachTop);
  reachTopRef.current = onReachTop;

  // Directory entries run oldest to newest, so a list too tall for the rail
  // pushes the newest turn below the fold — the one entry the reader is most
  // likely to want.
  const lastSectionId = sections.at(-1)?.id ?? null;
  useEffect(() => {
    const list = listRef.current;
    if (list === null) return;

    // Re-engage following when the reader returns to the tail.
    const handleScroll = (): void => {
      followTailRef.current = list.scrollHeight - list.scrollTop - list.clientHeight <= 24;
    };
    // Scrolling up at the very top asks for older turns. A wheel event is
    // required on top of the position check: once the list is already at
    // scrollTop 0 it stops emitting scroll events, so position alone would
    // fire once and then never again.
    const handleWheel = (event: WheelEvent): void => {
      if (event.deltaY < 0 && list.scrollTop <= 0) {
        reachTopRef.current();
      }
    };
    list.addEventListener("scroll", handleScroll, { passive: true });
    list.addEventListener("wheel", handleWheel, { passive: true });
    return () => {
      list.removeEventListener("scroll", handleScroll);
      list.removeEventListener("wheel", handleWheel);
    };
  }, []);

  useEffect(() => {
    const list = listRef.current;
    if (list === null || !followTailRef.current) return;
    list.scrollTop = list.scrollHeight;
  }, [lastSectionId, position.mode, position.width, position.left]);

  // A load request prepends entries above the list, which pushes the entry the
  // reader was reading downward. Re-anchor on the turn that used to sit at the
  // top so the visible content stays put.
  const previousHeadId = useRef(sections[0]?.id ?? null);
  const previousHeadOffset = useRef(0);
  useEffect(() => {
    const list = listRef.current;
    const head = sections[0]?.id ?? null;

    if (list !== null && head !== previousHeadId.current) {
      const anchor = previousHeadId.current === null
        ? null
        : list.querySelector<HTMLElement>(`[data-section-id="${previousHeadId.current}"]`);

      if (anchor !== null) {
        const offset = anchor.getBoundingClientRect().top - list.getBoundingClientRect().top;
        list.scrollTop += offset - previousHeadOffset.current;
      }

      const nextAnchor = head === null
        ? null
        : list.querySelector<HTMLElement>(`[data-section-id="${head}"]`);
      previousHeadOffset.current = nextAnchor === null
        ? 0
        : nextAnchor.getBoundingClientRect().top - list.getBoundingClientRect().top;
    }

    previousHeadId.current = head;
  }, [sections]);

  if (position.mode === "hidden") {
    return null;
  }

  const turnMode = sections.length > 0 && sections.every((section) => section.kind === "turn");
  const groups: SectionGroup[] = [];

  if (!turnMode) {
    for (const section of sections) {
      const last = groups.at(-1);
      if (last !== undefined && last.key === section.answerKey) {
        last.sections.push(section);
      } else {
        groups.push({ key: section.answerKey, sections: [section] });
      }
    }
  }

  const currentGroupKey = activeSectionId !== null
    ? sections.find((section) => section.id === activeSectionId)?.answerKey ?? groups.at(-1)?.key
    : groups.at(-1)?.key;
  let historyIndex = 0;

  const renderItem = (section: Section) => (
    <SectionRailItem
      active={section.id === activeSectionId}
      bookmarked={bookmarkedSectionKeys.has(section.key)}
      key={section.id}
      onSelect={onSectionSelect}
      onToggleBookmark={onToggleBookmark}
      section={section}
      t={t}
    />
  );

  // Lives inside the list as its first row so it only appears once the reader
  // scrolls to the top, which is where asking for older turns makes sense.
  const loadEarlierItem = (
    <li className="section-rail-load-earlier-item">
      <button
        aria-label={
          historyComplete
            ? t("loadEarlierDone")
            : t("loadEarlier", { count: HISTORY_PAGE_TURNS })
        }
        className="section-rail-load-earlier"
        disabled={historyComplete || historyLoading}
        onClick={onReachTop}
        type="button"
      >
        {historyComplete
          ? t("loadEarlierDone")
          : historyLoading
            ? t("loadEarlierPending")
            : `↑ ${t("loadEarlier", { count: HISTORY_PAGE_TURNS })}`}
      </button>
    </li>
  );

  // Collapsed: the rail keeps a single edge button as its only affordance, so
  // the reader can always bring it back. Anchored to the rail's own right edge
  // so it stays where the rail was rather than jumping to the viewport edge.
  if (collapsed) {
    return (
      <button
        aria-expanded="false"
        aria-label={t("expandRail")}
        className="section-rail-expand"
        onClick={onToggleCollapsed}
        style={{ left: `${position.left + position.width}px` }}
        title={t("expandRail")}
        type="button"
      >
        <span aria-hidden="true">‹</span>
      </button>
    );
  }

  return (
    <nav
      aria-label={t("sections")}
      className={`section-rail is-${position.mode}`}
      data-mode={position.mode}
      style={
        {
          "--section-rail-left": `${position.left}px`,
          left: `${position.left}px`,
          width: `${position.width}px`,
        } as CSSProperties
      }
    >
      <div className="section-rail-heading">
        <span className="section-rail-heading-text">{t("sections")}</span>
        <button
          aria-controls="section-nav-bookmark-drawer"
          aria-expanded={drawerOpen}
          aria-label={t("bookmarkOpen", { count: bookmarkCount })}
          className="bookmark-drawer-trigger"
          onClick={onToggleDrawer}
          title={t("bookmarkTitle", { count: bookmarkCount })}
          type="button"
        >
          <span aria-hidden="true">{bookmarkCount > 0 ? "★" : "☆"}</span>
          {bookmarkCount > 0 ? <span>{bookmarkCount}</span> : null}
        </button>
        <button
          aria-label={t("collapseRail")}
          className="section-rail-collapse"
          onClick={onToggleCollapsed}
          title={t("collapseRail")}
          type="button"
        >
          <span aria-hidden="true">›</span>
        </button>
      </div>
      {sections.length === 0 ? (
        <div className="section-rail-empty">{t("emptySections")}</div>
      ) : turnMode ? (
        <ol className="section-rail-list" ref={listRef}>
          {loadEarlierItem}
          {sections.map(renderItem)}
        </ol>
      ) : (
        <ol className="section-rail-list" ref={listRef}>
          {loadEarlierItem}
          {groups.map((group) => {
            const isCurrent = group.key === currentGroupKey;
            if (!isCurrent) historyIndex += 1;

            return (
              <li className="section-rail-group" key={group.key}>
                <div className="section-rail-group-label">
                  {isCurrent ? t("currentAnswer") : t("historyAnswer", { index: historyIndex })}
                </div>
                <ol className="section-rail-group-list">
                  {group.sections.map(renderItem)}
                </ol>
              </li>
            );
          })}
        </ol>
      )}
    </nav>
  );
}
