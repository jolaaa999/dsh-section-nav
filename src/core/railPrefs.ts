/**
 * Rail display preferences that survive a reload.
 *
 * Kept separate from the bookmark store: bookmarks are user content tied to a
 * Session, while these are UI state that applies across every Session. Storage
 * failures are ignored because a browser with localStorage disabled should
 * still get a working rail, just without the remembered choice.
 */

/** localStorage key holding rail display preferences. */
const STORAGE_KEY = 'dshSectionNav.railPrefs.v1'

/** Display preferences for the rail. */
export interface RailPrefs {
  /** Whether the reader collapsed the rail into its edge button. */
  collapsed: boolean
}

const DEFAULT_PREFS: RailPrefs = { collapsed: false }

/**
 * Read the stored rail preferences.
 * @returns Stored preferences, or defaults when nothing valid is stored.
 */
export function readRailPrefs(): RailPrefs {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)

    if (raw === null) {
      return { ...DEFAULT_PREFS }
    }

    const parsed: unknown = JSON.parse(raw)

    if (typeof parsed !== 'object' || parsed === null) {
      return { ...DEFAULT_PREFS }
    }

    const collapsed = (parsed as { collapsed?: unknown }).collapsed
    return { collapsed: collapsed === true }
  } catch {
    // Private mode and storage quota both throw here; defaults are correct.
    return { ...DEFAULT_PREFS }
  }
}

/**
 * Persist the rail preferences.
 * @param prefs - Preferences to store.
 */
export function writeRailPrefs(prefs: RailPrefs): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(prefs))
  } catch {
    // Losing the remembered choice is acceptable; breaking the rail is not.
  }
}
