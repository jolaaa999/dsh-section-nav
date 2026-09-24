import { useEffect, useRef, useState, type CSSProperties } from "react";

import { TOOLTIP_ANSWER_MAX_LENGTH } from "../../core/constants";
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
  const answerText = (section.answerText ?? "").slice(0, TOOLTIP_ANSWER_MAX_LENGTH);
  const depthStyle = {
    "--section-depth": section.depth,
  } as CSSProperties;

  // The card is fixed-positioned and carries its own top coordinate. The rail
  // list scrolls, so an absolutely positioned card anchored to the row would
  // be clipped by that scrollport instead of floating over the transcript.
  const [cardTop, setCardTop] = useState<number | null>(null);

  const showCard = (): void => {
    const rect = buttonRef.current?.getBoundingClientRect();
    if (rect === undefined) return;
    setCardTop(rect.top + rect.height / 2);
  };
  const hideCard = (): void => {
    setCardTop(null);
  };

  useEffect(() => {
    if (active) {
      buttonRef.current?.scrollIntoView({ block: "nearest", inline: "nearest" });
    }
  }, [active]);

  return (
    <li
      className="section-rail-list-item"
      onMouseEnter={showCard}
      onMouseLeave={hideCard}
      style={depthStyle}
    >
      <button
        aria-current={active ? "location" : undefined}
        aria-label={t("jumpToSection", { text: label })}
        className={`section-rail-item${active ? " is-active" : ""}`}
        onBlur={hideCard}
        onClick={() => onSelect(section)}
        onFocus={showCard}
        ref={buttonRef}
        type="button"
      >
        <span aria-hidden="true" className="section-rail-marker" />
        <span className="section-rail-text">{label}</span>
      </button>
      {cardTop === null ? null : (
        <span
          aria-hidden="true"
          className="section-tooltip"
          style={{ top: `${cardTop}px` }}
        >
          <span className="section-tooltip-prompt">{label}</span>
          {answerText.length > 0 && (
            <span className="section-tooltip-response">{answerText}</span>
          )}
        </span>
      )}
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
