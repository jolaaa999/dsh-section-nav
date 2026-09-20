import { useEffect, useRef, type CSSProperties } from "react";

import type { Section } from "../../core/types";
import type { Translate } from "../locales";

interface SectionRailItemProps {
  active: boolean;
  bookmarked: boolean;
  onSelect(section: Section): void;
  onToggleBookmark(section: Section): void;
  section: Section;
  t: Translate;
}

export function SectionRailItem({
  active,
  bookmarked,
  onSelect,
  onToggleBookmark,
  section,
  t,
}: SectionRailItemProps) {
  const buttonRef = useRef<HTMLButtonElement>(null);
  const label = section.text.length > 0
    ? section.text
    : t("messageMeta", { index: section.index + 1 });
  const depthStyle = {
    "--section-depth": section.depth,
  } as CSSProperties;

  useEffect(() => {
    if (active) {
      buttonRef.current?.scrollIntoView({ block: "nearest", inline: "nearest" });
    }
  }, [active]);

  return (
    <li className="section-rail-list-item" style={depthStyle}>
      <button
        aria-current={active ? "location" : undefined}
        aria-label={t("jumpToSection", { text: label })}
        className={`section-rail-item${active ? " is-active" : ""}`}
        onClick={() => onSelect(section)}
        ref={buttonRef}
        title={label}
        type="button"
      >
        <span aria-hidden="true" className="section-rail-marker" />
        <span className="section-rail-text">{label}</span>
      </button>
      <button
        aria-label={t(bookmarked ? "unbookmarkSection" : "bookmarkSection", {
          text: label,
        })}
        aria-pressed={bookmarked}
        className={`section-bookmark-toggle${bookmarked ? " is-bookmarked" : ""}`}
        onClick={(event) => {
          event.stopPropagation();
          onToggleBookmark(section);
        }}
        title={t(bookmarked ? "unbookmark" : "bookmark")}
        type="button"
      >
        <span aria-hidden="true">{bookmarked ? "★" : "☆"}</span>
      </button>
    </li>
  );
}
