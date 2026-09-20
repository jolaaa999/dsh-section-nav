import type { Bookmark, Section } from "../../core/types";
import { bookmarkMatchesSection } from "../../core/bookmarkResolver";
import type { RailPosition } from "../../core/positionManager";
import type { Translate } from "../locales";
import { BookmarkDrawer } from "./BookmarkDrawer";
import { SectionRail } from "./SectionRail";

interface AppProps {
  activeSectionId: string | null;
  bookmarks: Bookmark[];
  drawerOpen: boolean;
  onBookmarkDelete(bookmark: Bookmark): void;
  onBookmarkSelect(bookmark: Bookmark): void;
  onDrawerClose(): void;
  onDrawerToggle(): void;
  onSectionSelect(section: Section): void;
  onToggleBookmark(section: Section): void;
  position: RailPosition;
  resolvingBookmarkIds: ReadonlySet<string>;
  sections: Section[];
  t: Translate;
  unresolvedBookmarkIds: ReadonlySet<string>;
}

export function App({
  activeSectionId,
  bookmarks,
  drawerOpen,
  onBookmarkDelete,
  onBookmarkSelect,
  onDrawerClose,
  onDrawerToggle,
  onSectionSelect,
  onToggleBookmark,
  position,
  resolvingBookmarkIds,
  sections,
  t,
  unresolvedBookmarkIds,
}: AppProps) {
  const bookmarkedSectionKeys = new Set(
    sections
      .filter((section) =>
        bookmarks.some((bookmark) => bookmarkMatchesSection(bookmark, section)),
      )
      .map((section) => section.key),
  );
  const drawerLeft = Math.max(12, position.left - 312);

  return (
    <>
      <SectionRail
        activeSectionId={activeSectionId}
        bookmarkedSectionKeys={bookmarkedSectionKeys}
        bookmarkCount={bookmarks.length}
        drawerOpen={drawerOpen}
        onSectionSelect={onSectionSelect}
        onToggleBookmark={onToggleBookmark}
        onToggleDrawer={onDrawerToggle}
        position={position}
        sections={sections}
        t={t}
      />
      {drawerOpen && position.mode !== "hidden" ? (
        <BookmarkDrawer
          bookmarks={bookmarks}
          left={drawerLeft}
          onClose={onDrawerClose}
          onDelete={onBookmarkDelete}
          onSelect={onBookmarkSelect}
          resolvingBookmarkIds={resolvingBookmarkIds}
          t={t}
          unresolvedBookmarkIds={unresolvedBookmarkIds}
        />
      ) : null}
    </>
  );
}
