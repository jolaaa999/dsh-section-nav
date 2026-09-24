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
