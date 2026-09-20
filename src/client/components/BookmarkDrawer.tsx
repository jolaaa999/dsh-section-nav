import type { Bookmark } from "../../core/types";
import type { Translate } from "../locales";

interface BookmarkDrawerProps {
  bookmarks: Bookmark[];
  left: number;
  onClose(): void;
  onDelete(bookmark: Bookmark): void;
  onSelect(bookmark: Bookmark): void;
  resolvingBookmarkIds: ReadonlySet<string>;
  t: Translate;
  unresolvedBookmarkIds: ReadonlySet<string>;
}

export function BookmarkDrawer({
  bookmarks,
  left,
  onClose,
  onDelete,
  onSelect,
  resolvingBookmarkIds,
  t,
  unresolvedBookmarkIds,
}: BookmarkDrawerProps) {
  return (
    <section
      aria-labelledby="section-nav-bookmark-drawer-title"
      className="bookmark-drawer"
      id="section-nav-bookmark-drawer"
      role="dialog"
      style={{ left: `${left}px` }}
    >
      <header className="bookmark-drawer-header">
        <div>
          <div className="bookmark-drawer-title" id="section-nav-bookmark-drawer-title">
            {t("bookmarks")}
          </div>
          <div className="bookmark-drawer-subtitle">
            {t("currentConversation", { count: bookmarks.length })}
          </div>
        </div>
        <button
          aria-label={t("closeBookmarks")}
          autoFocus
          className="bookmark-drawer-close"
          onClick={onClose}
          type="button"
        >
          ×
        </button>
      </header>

      {bookmarks.length === 0 ? (
        <div className="bookmark-drawer-empty">{t("noBookmarks")}</div>
      ) : (
        <ul className="bookmark-list">
          {bookmarks.map((bookmark) => {
            const resolving = resolvingBookmarkIds.has(bookmark.id);
            const unresolved = unresolvedBookmarkIds.has(bookmark.id);

            return (
              <li className="bookmark-list-item" key={bookmark.id}>
                <button
                  className="bookmark-jump"
                  onClick={() => onSelect(bookmark)}
                  title={bookmark.sectionText}
                  type="button"
                >
                  <span aria-hidden="true" className="bookmark-star">
                    ★
                  </span>
                  <span className="bookmark-copy">
                    <span className="bookmark-title">{bookmark.sectionText}</span>
                    <span className={`bookmark-meta${unresolved ? " is-unresolved" : ""}`}>
                      {resolving
                        ? t("locating")
                        : unresolved
                        ? t("unavailable")
                        : t("sectionMeta", {
                            level: bookmark.sectionLevel,
                            index: bookmark.sectionIndex + 1,
                          })}
                    </span>
                  </span>
                </button>
                <button
                  aria-label={t("deleteBookmark", { text: bookmark.sectionText })}
                  className="bookmark-delete"
                  onClick={(event) => {
                    event.stopPropagation();
                    onDelete(bookmark);
                  }}
                  title={t("delete")}
                  type="button"
                >
                  ×
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
