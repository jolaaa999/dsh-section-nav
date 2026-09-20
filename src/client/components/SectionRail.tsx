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
  if (position.mode === "hidden") {
    return null;
  }

  return (
    <nav
      aria-label={t("sections")}
      className={`section-rail is-${position.mode}`}
      data-mode={position.mode}
      style={{ left: `${position.left}px`, width: `${position.width}px` }}
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
      ) : (
        <ol className="section-rail-list">
          {sections.map((section) => (
            <SectionRailItem
              active={section.id === activeSectionId}
              bookmarked={bookmarkedSectionKeys.has(section.key)}
              key={section.id}
              onSelect={onSectionSelect}
              onToggleBookmark={onToggleBookmark}
              section={section}
              t={t}
            />
          ))}
        </ol>
      )}
    </nav>
  );
}
