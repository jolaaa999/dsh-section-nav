import { useEffect, useRef, type CSSProperties } from "react";

import type { Section } from "../../core/types";
import type { RailPosition } from "../../core/positionManager";
import type { Translate } from "../locales";
import { SectionRailItem } from "./SectionRailItem";

interface SectionRailProps {
  activeSectionId: string | null;
  bookmarkedSectionKeys: ReadonlySet<string>;
  bookmarkCount: number;
  drawerOpen: boolean;
  onSectionSelect(section: Section): void;
  onToggleBookmark(section: Section): void;
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
  drawerOpen,
  onSectionSelect,
  onToggleBookmark,
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
    list.addEventListener("scroll", handleScroll, { passive: true });
    return () => list.removeEventListener("scroll", handleScroll);
  }, []);

  useEffect(() => {
    const list = listRef.current;
    if (list === null || !followTailRef.current) return;
    list.scrollTop = list.scrollHeight;
  }, [lastSectionId, sections.length, position.mode, position.width, position.left]);

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
      </div>
      {sections.length === 0 ? (
        <div className="section-rail-empty">{t("emptySections")}</div>
      ) : turnMode ? (
        <ol className="section-rail-list" ref={listRef}>
          {sections.map(renderItem)}
        </ol>
      ) : (
        <ol className="section-rail-list" ref={listRef}>
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
