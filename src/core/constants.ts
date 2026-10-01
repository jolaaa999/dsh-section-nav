/** Identity used to ignore mutations produced by this plugin's own UI. */
export const EXTENSION_ROOT_ID = 'dsh-section-nav-root'

/**
 * Characters kept from a turn's answer in the rail hover card.
 *
 * The card reserves two lines for the excerpt and CSS clamps whatever
 * overflows; trimming here first keeps a long reply from putting its whole
 * text into the DOM on every hover.
 */
export const TOOLTIP_ANSWER_MAX_LENGTH = 120

/**
 * Turns the rail renders before any older history is paged in.
 *
 * Paging the whole session up front made the rail slow to settle and made it
 * compete with the transcript for the scroll position, so the rail starts at
 * the newest turns and grows upward on demand instead.
 */
export const INITIAL_RAIL_TURNS = 8

/** Older turns added per load request at the top of the rail list. */
export const HISTORY_PAGE_TURNS = 8
