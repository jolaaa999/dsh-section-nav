import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

import type { Bookmark, Section } from "../core/types";
import { createDshAdapter } from "../core/adapter";
import { EXTENSION_ROOT_ID } from "../core/constants";
import { AnswerTracker, type ActiveAnswer } from "../core/answerTracker";
import { recoverBookmarkTarget } from "../core/bookmarkRecovery";
import { bookmarkMatchesSection, resolveBookmark } from "../core/bookmarkResolver";
import { bookmarkService } from "../core/bookmarkService";
import { ConversationRouteWatcher } from "../core/conversationRouteWatcher";
import { ConversationWatcher } from "../core/conversationWatcher";
import { initialRailPosition, PositionManager, type RailPosition } from "../core/positionManager";
import { navigateToSection, resolveSectionElement } from "../core/sectionNavigation";
import { parseTurnSections } from "../core/turnParser";
import { normalizeText } from "../core/text";
import { SectionTracker } from "../core/sectionTracker";
import { App } from "./components/App";
import { getOrCreateExtensionRoot } from "./extensionRoot";
import { en, fallbackTranslate, NS, type Translate, zh } from "./locales";
import type { LocaleService, PluginContext } from "./pluginTypes";
import { extensionCss } from "./styles";
import { ThemeManager } from "./themeManager";

const INITIAL_REFRESH_DELAYS = [100, 400, 1000, 2000, 3500] as const;
const MAX_HISTORY_PAGES = 100;
const LOAD_EARLIER_LABELS = new Set([
  "加载更早",
  "加载更多",
  "加载更早的记录",
  "加载历史消息",
  "Load earlier",
  "Load more",
  "Load older",
]);
const DIRECTORY_CACHE_LIMIT = 24;

interface DirectoryCacheEntry {
  readonly sections: Section[];
  readonly historyExhausted: boolean;
  readonly updatedAt: number;
}

const directoryCache = new Map<string, DirectoryCacheEntry>();

function sectionsEqual(first: Section[], second: Section[]): boolean {
  return (
    first.length === second.length &&
    first.every((section, index) => {
      const other = second[index];
      return (
        section.key === other?.key &&
        section.index === other?.index &&
        section.textHash === other?.textHash
      );
    })
  );
}

function currentSessionId(ctx: PluginContext): string | undefined {
  try {
    // DSH 0.1.2 / Oh-DSH releases expose the selected Session directly on the
    // session list snapshot.
    const sessions = ctx.get("sessions") as
      | { list?: { getSnapshot?: () => { current?: unknown } } }
      | undefined;
    const current = sessions?.list?.getSnapshot?.().current;
    if (typeof current === "string" && current.length > 0) return current;

    // Current DSH releases keep selection in the ui-session adapter; its
    // materialized binding key is the selected Session identity.
    const uiSession = ctx.get("uiSession") as
      | {
          adapter?: {
            current?: {
              getSnapshot?: () => { key?: unknown; props?: { sessionId?: unknown } };
            };
          };
        }
      | undefined;
    const binding = uiSession?.adapter?.current?.getSnapshot?.();
    const key = binding?.key ?? binding?.props?.sessionId;
    return typeof key === "string" && key.length > 0 ? key : undefined;
  } catch {
    return undefined;
  }
}

/**
 * Mount the section navigation rail for the current DSH client context.
 * @param ctx - Cordis client context.
 * @returns idempotent disposer that unmounts the rail and releases every listener.
 */
export function startSectionNav(ctx: PluginContext): () => void {
  const adapter = createDshAdapter({ getSessionId: () => currentSessionId(ctx) });

  document.getElementById(EXTENSION_ROOT_ID)?.remove();
  const shadowRoot = getOrCreateExtensionRoot();
  const style = document.createElement("style");
  style.dataset.plugin = "dsh-section-nav";
  style.textContent = extensionCss;
  shadowRoot.append(style);

  const reactMount = document.createElement("div");
  reactMount.id = "dsh-section-nav-react-root";
  shadowRoot.append(reactMount);
  const reactRoot = createRoot(reactMount);

  const bookmarkTargetCache = new Map<string, Section>();
  const bookmarkUpgradeIds = new Set<string>();
  const refreshTimerIds = new Set<number>();
  let watchdogTimerId: number | null = null;
  let activeAnswer: ActiveAnswer | null = null;
  let activeSectionId: string | null = null;
  let bookmarks: Bookmark[] = [];
  let bookmarkNavigationVersion = 0;
  let conversationKey = adapter.getConversationKey();
  let conversationVersion = 0;
  let destroyed = false;
  let drawerOpen = false;
  let railPosition: RailPosition = initialRailPosition(
    document.documentElement.clientWidth || window.innerWidth,
  );
  let resolvingBookmarkIds = new Set<string>();
  const initialCachedDirectory = directoryCache.get(conversationKey);
  let baseSections: Section[] = initialCachedDirectory?.sections ?? [];
  let sections: Section[] = baseSections;
  let historyExhausted = initialCachedDirectory?.historyExhausted ?? false;
  let historyNoProgressAttempts = 0;
  let historyLoadGeneration = 0;
  let historyLoadInFlight = false;
  let historyLoadPausedUntil = 0;
  /**
   * Turn the reader last navigated to, restored after history paging.
   *
   * Paging older history must scroll to the top to reach the "load earlier"
   * control, which drags the viewport away from a jump the reader just made.
   * A pause window cannot cover a long page-out, so the target is remembered
   * and re-applied once paging settles.
   */
  let pendingScrollTargetTurn: number | null = null;
  let pendingScrollTargetUntil = 0;
  let t: Translate = fallbackTranslate;
  let unsubscribeLocale: () => void = () => {};
  let disposeLocale: () => void = () => {};
  let unresolvedBookmarkIds = new Set<string>();
  let pendingNavigationSection: Section | null = null;
  let pendingDomSignature: string | null = null;
  let pendingDomSignatureTimerId: number | null = null;
  let answerTracker: AnswerTracker;
  let conversationWatcher: ConversationWatcher;
  let routeWatcher: ConversationRouteWatcher;


  function render(): void {
    if (destroyed) {
      return;
    }

    reactRoot.render(
      <StrictMode>
        <App
          activeSectionId={activeSectionId}
          bookmarks={bookmarks}
          drawerOpen={drawerOpen}
          onBookmarkDelete={(bookmark) => {
            if (!ensureCurrentConversation()) {
              return;
            }

            const operationKey = conversationKey;
            const operationVersion = conversationVersion;

            void bookmarkService
              .remove(operationKey, bookmark.id)
              .then((nextBookmarks) => {
                updateBookmarksForContext(nextBookmarks, operationKey, operationVersion);
              })
              .catch(handleBookmarkError);
          }}
          onBookmarkSelect={(bookmark) => {
            void navigateToBookmark(bookmark);
          }}
          onDrawerClose={() => {
            drawerOpen = false;
            render();
          }}
          onDrawerToggle={() => {
            if (!ensureCurrentConversation()) {
              return;
            }

            drawerOpen = !drawerOpen;
            render();
          }}
          onSectionSelect={(section) => {
            if (!ensureCurrentConversation()) {
              return;
            }

            // A cached directory can contain entries from pages the current
            // mounted window has not loaded yet. If the target row is absent,
            // resume history paging and wait for it instead of doing nothing.
            if (resolveSectionElement(section, adapter) === null) {
              pendingNavigationSection = section;
              historyExhausted = false;
              historyNoProgressAttempts = 0;
              historyLoadPausedUntil = 0;
              historyLoadGeneration += 1;
              void loadAllHistory();
              return;
            }

            pendingNavigationSection = null;

            // The background history pager prepends rows; pause it while the
            // rail scrolls to the clicked item so the two cannot fight over
            // the transcript scroll position. The pause is only a head start:
            // rememberScrollTarget is what actually keeps the viewport put
            // when paging outlasts it.
            historyLoadPausedUntil = performance.now() + 8000;
            rememberScrollTarget(section);
            historyLoadGeneration += 1;
            drawerOpen = false;
            activeSectionId = section.id;
            render();
            navigateToSection(section, adapter);
          }}
          onToggleBookmark={(section) => {
            if (!ensureCurrentConversation()) {
              return;
            }

            const operationKey = conversationKey;
            const operationVersion = conversationVersion;
            const currentElement = resolveSectionElement(section, adapter);
            const bookmarkSection = currentElement === null
              ? section
              : { ...section, element: currentElement };

            void bookmarkService
              .toggle(operationKey, bookmarkSection)
              .then((nextBookmarks) => {
                const savedBookmark = nextBookmarks.find(
                  (bookmark) => bookmark.sectionKey === bookmarkSection.key,
                );

                if (savedBookmark) {
                  bookmarkTargetCache.set(savedBookmark.id, bookmarkSection);
                } else {
                  for (const [bookmarkId, target] of bookmarkTargetCache) {
                    if (target.key === bookmarkSection.key) {
                      bookmarkTargetCache.delete(bookmarkId);
                    }
                  }
                }

                updateBookmarksForContext(nextBookmarks, operationKey, operationVersion);
              })
              .catch(handleBookmarkError);
          }}
          position={railPosition}
          resolvingBookmarkIds={resolvingBookmarkIds}
          sections={sections}
          t={t}
          unresolvedBookmarkIds={unresolvedBookmarkIds}
        />
      </StrictMode>,
    );
  }

  const updateBookmarks = (nextBookmarks: Bookmark[]) => {
    if (destroyed) {
      return;
    }

    bookmarks = nextBookmarks;
    const bookmarkIds = new Set(bookmarks.map((bookmark) => bookmark.id));

    for (const bookmarkId of bookmarkTargetCache.keys()) {
      if (!bookmarkIds.has(bookmarkId)) {
        bookmarkTargetCache.delete(bookmarkId);
      }
    }

    resolvingBookmarkIds = new Set(
      [...resolvingBookmarkIds].filter((bookmarkId) => bookmarkIds.has(bookmarkId)),
    );
    unresolvedBookmarkIds = new Set(
      [...unresolvedBookmarkIds].filter((bookmarkId) =>
        bookmarks.some((bookmark) => bookmark.id === bookmarkId),
      ),
    );
    cacheBookmarkTargets(sections);
    cacheResolvedBookmarkTargets();
    render();
  };

  const cacheBookmarkTargets = (nextSections: Section[]) => {
    for (const bookmark of bookmarks) {
      const section = nextSections.find((candidate) =>
        bookmarkMatchesSection(bookmark, candidate),
      );

      if (!section) {
        continue;
      }

      bookmarkTargetCache.set(bookmark.id, section);
      scheduleBookmarkUpgrade(bookmark, section);
    }
  };

  const getCachedBookmarkTarget = (bookmark: Bookmark): Section | null => {
    const target = bookmarkTargetCache.get(bookmark.id);

    if (!target) {
      return null;
    }

    if (!target.element.isConnected) {
      bookmarkTargetCache.delete(bookmark.id);
      return null;
    }

    return target;
  };

  const cacheResolvedBookmarkTargets = () => {
    for (const bookmark of bookmarks) {
      if (getCachedBookmarkTarget(bookmark)) {
        continue;
      }

      const target = resolveBookmark(bookmark, adapter);

      if (target) {
        bookmarkTargetCache.set(bookmark.id, target);
        scheduleBookmarkUpgrade(bookmark, target);
      }
    }
  };

  const scheduleBookmarkUpgrade = (bookmark: Bookmark, section: Section) => {
    if (bookmark.locatorVersion === 2 || bookmarkUpgradeIds.has(bookmark.id)) {
      return;
    }

    const operationKey = conversationKey;
    const operationVersion = conversationVersion;
    bookmarkUpgradeIds.add(bookmark.id);
    void bookmarkService
      .updateLocator(operationKey, bookmark.id, section)
      .then((nextBookmarks) => {
        updateBookmarksForContext(nextBookmarks, operationKey, operationVersion);
      })
      .catch(handleBookmarkError)
      .finally(() => {
        bookmarkUpgradeIds.delete(bookmark.id);
      });
  };

  const navigateToBookmark = async (bookmark: Bookmark) => {
    if (!ensureCurrentConversation()) {
      return;
    }

    const operationKey = conversationKey;
    const operationVersion = conversationVersion;
    const navigationVersion = ++bookmarkNavigationVersion;
    resolvingBookmarkIds = new Set([bookmark.id]);
    unresolvedBookmarkIds = new Set(
      [...unresolvedBookmarkIds].filter((bookmarkId) => bookmarkId !== bookmark.id),
    );
    render();

    const isNavigationCanceled = () =>
      destroyed ||
      operationKey !== conversationKey ||
      operationVersion !== conversationVersion ||
      navigationVersion !== bookmarkNavigationVersion;
    const targetSection =
      getCachedBookmarkTarget(bookmark) ??
      (await recoverBookmarkTarget(bookmark, adapter, {
        isCanceled: isNavigationCanceled,
      }));

    if (isNavigationCanceled()) {
      return;
    }

    resolvingBookmarkIds = new Set(
      [...resolvingBookmarkIds].filter((bookmarkId) => bookmarkId !== bookmark.id),
    );

    if (!targetSection) {
      unresolvedBookmarkIds = new Set(unresolvedBookmarkIds).add(bookmark.id);
      render();
      return;
    }

    bookmarkTargetCache.set(bookmark.id, targetSection);
    unresolvedBookmarkIds = new Set(
      [...unresolvedBookmarkIds].filter((bookmarkId) => bookmarkId !== bookmark.id),
    );
    drawerOpen = false;
    activeSectionId = targetSection.id;
    render();
    historyLoadPausedUntil = performance.now() + 8000;
    rememberScrollTarget(targetSection);
    historyLoadGeneration += 1;
    navigateToSection(targetSection, adapter);
    void bookmarkService
      .updateLocator(operationKey, bookmark.id, targetSection)
      .then((nextBookmarks) => {
        updateBookmarksForContext(nextBookmarks, operationKey, operationVersion);
      })
      .catch(handleBookmarkError);
  };

  const handleBookmarkError = (_error?: unknown) => {
    // Storage errors are non-fatal for the rail. The next successful operation
    // rebuilds the list from storage.
  };

  const updateBookmarksForContext = (
    nextBookmarks: Bookmark[],
    key: string,
    version: number,
  ) => {
    if (key === conversationKey && version === conversationVersion) {
      updateBookmarks(nextBookmarks);
    }
  };

  const loadBookmarks = async (key: string, version: number) => {
    try {
      const storedBookmarks = await bookmarkService.list(key);

      updateBookmarksForContext(storedBookmarks, key, version);
    } catch (error) {
      handleBookmarkError(error);
    }
  };

  const positionManager = new PositionManager({
    onPositionChange(position) {
      railPosition = position;
      render();
    },
  });

  /**
   * Re-read the layout target and re-evaluate the rail anchor.
   *
   * The target can be an answer row whose size does not change while the
   * conversation column moves, so this is called on mutations and by the
   * watchdog rather than relying only on the target's ResizeObserver.
   */
  const refreshPosition = () => {
    if (destroyed) {
      return;
    }

    const targetElement = activeAnswer
      ? (adapter.getMessageContent(activeAnswer.element) ?? activeAnswer.element)
      : adapter.getConversationContainer();
    positionManager.setLayoutTarget(adapter.getLayoutContainer());
    positionManager.setTarget(targetElement);
  };

  const sectionTracker = new SectionTracker({
    onActiveSectionChange(sectionId) {
      activeSectionId = sectionId;
      render();
    },
  });

  const parseAllSections = (): Section[] =>
    parseTurnSections(conversationKey, adapter);

  const sectionIdentity = (section: Section): string =>
    section.messageId !== null ? `id:${section.messageId}` : `key:${section.key}`;

  /**
   * Merge the current DOM window with the cached directory for this Session.
   * DOM entries win because their element is live; cached entries remain for
   * older pages that are not mounted yet.
   */
  const mergeSections = (
    cached: readonly Section[],
    dom: readonly Section[],
  ): Section[] => {
    if (cached.length === 0) return [...dom];

    const map = new Map<string, Section>();
    for (const section of cached) map.set(sectionIdentity(section), section);
    for (const section of dom) map.set(sectionIdentity(section), section);

    const merged = [...map.values()].sort((first, second) => {
      const firstTurn = first.turnIndex ?? Number.MAX_SAFE_INTEGER;
      const secondTurn = second.turnIndex ?? Number.MAX_SAFE_INTEGER;
      if (firstTurn !== secondTurn) return firstTurn - secondTurn;
      return first.index - second.index;
    });

    return merged.map((section, index) => ({
      ...section,
      index,
      nextHeadingHash: merged[index + 1]?.textHash ?? null,
      previousHeadingHash: merged[index - 1]?.textHash ?? null,
    }));
  };

  const saveCurrentDirectory = (): void => {
    if (conversationKey.length === 0 || sections.length === 0) {
      return;
    }

    directoryCache.set(conversationKey, {
      sections: sections.slice(),
      historyExhausted,
      updatedAt: Date.now(),
    });

    if (directoryCache.size <= DIRECTORY_CACHE_LIMIT) {
      return;
    }

    let oldestKey: string | undefined;
    let oldestAt = Number.POSITIVE_INFINITY;
    for (const [key, entry] of directoryCache) {
      if (entry.updatedAt < oldestAt) {
        oldestAt = entry.updatedAt;
        oldestKey = key;
      }
    }
    if (oldestKey !== undefined) {
      directoryCache.delete(oldestKey);
    }
  };

  const delay = (ms: number): Promise<void> =>
    new Promise((resolve) => {
      window.setTimeout(resolve, ms);
    });

  const getConversationScroller = (): HTMLElement | null =>
    document.querySelector<HTMLElement>("[data-conversation-scroll]");

  const elementIdentity = (element: HTMLElement | undefined): string =>
    element?.getAttribute("data-chat-anchor-key")
    ?? element?.getAttribute("data-chat-flow-key")
    ?? "";

  const historyProgressSnapshot = (): string => {
    const rows = document.querySelectorAll<HTMLElement>("[data-chat-flow-kind]");
    const first = rows[0];
    const identity = elementIdentity(first);
    return identity.length > 0 ? identity : `count:${rows.length}`;
  };

  const scrollConversationToTop = (): void => {
    const scroller = getConversationScroller();
    if (scroller !== null) {
      scroller.scrollTop = 0;
    }
  };

  const findLoadEarlierControl = (): HTMLElement | null => {
    const candidates = document.querySelectorAll<HTMLElement>(
      "button, [role=\"button\"], a, [data-testid*=\"older\"], [data-testid*=\"earlier\"], [class*=\"loadOlder\"], [class*=\"load-older\"]",
    );
    const labels = [...LOAD_EARLIER_LABELS];
    let partial: HTMLElement | null = null;

    for (const element of candidates) {
      const text = normalizeText(element.textContent ?? "");
      const aria = normalizeText(element.getAttribute("aria-label") ?? "");
      const accessible = `${text} ${aria}`.trim();
      if (accessible.length === 0) {
        continue;
      }
      if (labels.includes(text) || labels.includes(aria)) {
        return element;
      }
      if (partial === null && labels.some((label) => accessible.includes(label))) {
        partial = element;
      }
    }

    return partial;
  };

  const isHistoryLoading = (): boolean => {
    for (const element of document.querySelectorAll<HTMLElement>("button, [role=\"button\"]")) {
      const text = normalizeText(element.textContent ?? "");
      if (/loading|加载中/i.test(text) && element.hasAttribute("disabled")) {
        return true;
      }
    }
    return false;
  };

  const waitForHistoryProgress = (before: string, timeoutMs: number): Promise<boolean> =>
    new Promise((resolve) => {
      const startedAt = performance.now();
      const tick = () => {
        if (destroyed) {
          resolve(false);
          return;
        }

        if (historyProgressSnapshot() !== before) {
          resolve(true);
          return;
        }

        if (performance.now() - startedAt > timeoutMs) {
          resolve(false);
          return;
        }

        window.setTimeout(tick, 120);
      };

      tick();
    });

  const waitForEnabledControl = async (timeoutMs: number): Promise<HTMLElement | null> => {
    const startedAt = performance.now();
    while (!destroyed && performance.now() - startedAt < timeoutMs) {
      const control = findLoadEarlierControl();
      if (control !== null && !control.hasAttribute("disabled")) {
        return control;
      }
      await delay(120);
    }
    return null;
  };

  /**
   * Pull one older history page through the session controller rather than the
   * chat button. This is the fallback for embedded / virtualized transcripts
   * that render no paging control in the DOM.
   */
  const loadOlderViaSession = async (): Promise<boolean> => {
    const sessionId = currentSessionId(ctx);
    if (sessionId === undefined) {
      return false;
    }

    try {
      const sessions = ctx.get("sessions") as
        | {
            binding?: (id: string) =>
              | {
                  session?: {
                    loadOlder?: () => Promise<void>;
                  };
                }
              | undefined;
            scope?: (id: string) =>
              | {
                  conversation?: {
                    loadOlder?: () => Promise<void>;
                  };
                }
              | undefined;
          }
        | undefined;

      const session = sessions?.binding?.(sessionId)?.session;
      const conversation = sessions?.scope?.(sessionId)?.conversation;
      const loadOlder = session?.loadOlder ?? conversation?.loadOlder;
      if (loadOlder === undefined) {
        return false;
      }

      const scroller = getConversationScroller();
      const beforeTop = scroller?.scrollTop ?? 0;
      const beforeHeight = scroller?.scrollHeight ?? 0;
      const before = historyProgressSnapshot();
      await loadOlder.call(session ?? conversation);
      const progressed = await waitForHistoryProgress(before, 5000);

      if (progressed && scroller !== null && scroller.scrollHeight > beforeHeight) {
        const atBottom = beforeHeight - beforeTop - scroller.clientHeight < 60;
        if (!atBottom) {
          scroller.scrollTop = beforeTop + (scroller.scrollHeight - beforeHeight);
        }
      }

      return progressed;
    } catch {
      return false;
    }
  };

  const historyLoadAllowed = (generation: number): boolean =>
    !destroyed &&
    generation === historyLoadGeneration &&
    performance.now() >= historyLoadPausedUntil;

  /** Remember a navigation so history paging can put the viewport back. */
  const rememberScrollTarget = (section: Section): void => {
    if (section.turnIndex === null) {
      return;
    }

    pendingScrollTargetTurn = section.turnIndex;
    pendingScrollTargetUntil = performance.now() + 60_000;
  };

  /**
   * Return the viewport to the remembered navigation target.
   *
   * Paging inserts older content above the viewport, so writing scrollTop
   * would be undone by the next insertion; re-resolving the row and scrolling
   * to it is stable across those inserts.
   * @returns Whether a target row was found and restored.
   */
  const restoreScrollTarget = (): boolean => {
    const turnIndex = pendingScrollTargetTurn;

    if (turnIndex === null) {
      return false;
    }

    if (performance.now() > pendingScrollTargetUntil) {
      pendingScrollTargetTurn = null;
      return false;
    }

    const row = adapter.getUserMessageByTurnIndex(turnIndex);
    const scroller = getConversationScroller();

    if (row === null || !row.isConnected || scroller === null) {
      return false;
    }

    const offset = row.getBoundingClientRect().top - scroller.getBoundingClientRect().top;

    // Already aligned: leave the viewport alone so the reader's own scrolling
    // is never fought.
    if (Math.abs(offset) < 8) {
      pendingScrollTargetTurn = null;
      return true;
    }

    scroller.scrollTop += offset;
    pendingScrollTargetTurn = null;
    return true;
  };

  const loadAllHistory = async (): Promise<void> => {
    if (
      destroyed ||
      historyExhausted ||
      historyLoadInFlight ||
      performance.now() < historyLoadPausedUntil
    ) {
      return;
    }

    historyLoadInFlight = true;
    const generation = ++historyLoadGeneration;

    try {
      for (let page = 0; page < MAX_HISTORY_PAGES; page += 1) {
        if (
          destroyed ||
          generation !== historyLoadGeneration ||
          performance.now() < historyLoadPausedUntil
        ) {
          return;
        }

        let control = findLoadEarlierControl();
        if (control === null) {
          // The paging control may only mount once the transcript is at the
          // top; nudge it there and wait briefly before falling back.
          if (!historyLoadAllowed(generation)) {
            return;
          }
          scrollConversationToTop();
          control = await waitForEnabledControl(1200);
        }

        if (control === null) {
          if (isHistoryLoading()) {
            return;
          }
          const advanced = await loadOlderViaSession();
          if (!advanced) {
            historyNoProgressAttempts += 1;
            if (historyNoProgressAttempts >= 5) historyExhausted = true;
            return;
          }
          historyNoProgressAttempts = 0;
          updateActiveSections();
          continue;
        }

        if (control.hasAttribute("disabled")) {
          control = await waitForEnabledControl(4000);
          if (control === null) {
            return;
          }
        }

        if (!historyLoadAllowed(generation)) {
          return;
        }

        const before = historyProgressSnapshot();
        control.click();

        if (await waitForHistoryProgress(before, 10000)) {
          historyNoProgressAttempts = 0;
        } else {
          if (isHistoryLoading()) {
            return;
          }
          const advanced = await loadOlderViaSession();
          if (!advanced) {
            historyNoProgressAttempts += 1;
            if (historyNoProgressAttempts >= 5) historyExhausted = true;
            return;
          }
          historyNoProgressAttempts = 0;
        }

        updateActiveSections();
        await delay(80);
        // Put the viewport back after every page: older rows were just
        // inserted above it, which is what displaces the reader's target.
        restoreScrollTarget();
      }
    } finally {
      historyLoadInFlight = false;
      // Any exit path (page cap, failure, superseded generation) still owes
      // the reader a final restore.
      restoreScrollTarget();
    }
  };

  const updateActiveSections = () => {
    if (pendingDomSignature !== null) {
      if (historyProgressSnapshot() === pendingDomSignature) {
        return;
      }
      pendingDomSignature = null;
      if (pendingDomSignatureTimerId !== null) {
        window.clearTimeout(pendingDomSignatureTimerId);
        pendingDomSignatureTimerId = null;
      }
    }

    const domSections = parseAllSections();
    const nextSections = mergeSections(baseSections, domSections);

    // Track active sections only from live DOM rows. Cached rows have no
    // connected element and would otherwise poison the reading-line math.
    sectionTracker.setSections(domSections);

    // Refresh even when the section list is unchanged: a width drag or a
    // sidebar resize can move the target without changing its width.
    refreshPosition();

    // A cached-rail click may wait for an older page. Resolve it before the
    // section-equality early return: the cached text and DOM text can compare
    // equal even though the live element only just mounted.
    if (pendingNavigationSection !== null) {
      const pending = pendingNavigationSection;
      if (resolveSectionElement(pending, adapter) !== null) {
        pendingNavigationSection = null;
        historyLoadPausedUntil = performance.now() + 8000;
        rememberScrollTarget(pending);
        historyLoadGeneration += 1;
        activeSectionId = pending.id;
        render();
        navigateToSection(pending, adapter);
      }
    }

    if (sectionsEqual(sections, nextSections)) {
      return;
    }

    sections = nextSections;
    cacheBookmarkTargets(sections);
    render();
  };

  conversationWatcher = new ConversationWatcher(adapter, {
    onPotentialRouteChange() {
      return routeWatcher.sync();
    },
    onMutation(mutation) {
      if (routeWatcher.sync()) {
        return;
      }

      conversationWatcher.refreshContainer();

      if (mutation.messagesChanged) {
        answerTracker.refreshMessages();
        updateActiveSections();
        refreshPosition();
        void loadAllHistory();

        if (unresolvedBookmarkIds.size > 0) {
          unresolvedBookmarkIds = new Set();
          render();
        }
      }

      if (mutation.activeAnswerChanged) {
        updateActiveSections();
      }
    },
  });

  answerTracker = new AnswerTracker(adapter, {
    onActiveAnswerChange(nextActiveAnswer) {
      activeAnswer = nextActiveAnswer;
      conversationWatcher.setActiveAnswer(activeAnswer?.element ?? null);
      updateActiveSections();
    },
  });

  const clearRefreshTimers = () => {
    for (const timerId of refreshTimerIds) {
      window.clearTimeout(timerId);
    }

    refreshTimerIds.clear();
  };

  const scheduleMessageRefreshes = () => {
    clearRefreshTimers();

    for (const delay of INITIAL_REFRESH_DELAYS) {
      const timerId = window.setTimeout(() => {
        refreshTimerIds.delete(timerId);

        if (routeWatcher.sync()) {
          return;
        }

        conversationWatcher.refreshContainer();
        answerTracker.refreshMessages();
      }, delay);

      refreshTimerIds.add(timerId);
    }
  };

  const resetForConversation = (nextConversationKey: string) => {
    saveCurrentDirectory();
    pendingDomSignature = historyProgressSnapshot();
    historyLoadGeneration += 1;
    conversationVersion += 1;
    conversationKey = nextConversationKey;

    const cachedDirectory = directoryCache.get(nextConversationKey);
    baseSections = cachedDirectory?.sections ?? [];
    historyExhausted = cachedDirectory?.historyExhausted ?? false;
    historyNoProgressAttempts = 0;
    sections = baseSections;

    activeAnswer = null;
    activeSectionId = null;
    bookmarks = [];
    bookmarkNavigationVersion += 1;
    bookmarkTargetCache.clear();
    bookmarkUpgradeIds.clear();
    drawerOpen = false;
    railPosition = initialRailPosition(
      document.documentElement.clientWidth || window.innerWidth,
    );
    resolvingBookmarkIds = new Set();
    unresolvedBookmarkIds = new Set();
    pendingNavigationSection = null;
    conversationWatcher.setActiveAnswer(null);
    answerTracker.reset();
    refreshPosition();
    sectionTracker.setSections([]);
    render();
    void loadBookmarks(conversationKey, conversationVersion);
    scheduleMessageRefreshes();
    if (!historyExhausted) {
      window.setTimeout(() => { void loadAllHistory(); }, 800);
    }

    if (pendingDomSignatureTimerId !== null) {
      window.clearTimeout(pendingDomSignatureTimerId);
    }
    pendingDomSignatureTimerId = window.setTimeout(() => {
      pendingDomSignatureTimerId = null;
      pendingDomSignature = null;
      updateActiveSections();
    }, 3000);
  };

  routeWatcher = new ConversationRouteWatcher(adapter, {
    onRouteChange({ currentKey }) {
      resetForConversation(currentKey);
    },
  });

  const ensureCurrentConversation = () => !routeWatcher.sync();

  const handleDocumentPointerDown = (event: PointerEvent) => {
    const interactionInsideExtension = event.composedPath().includes(shadowRoot.host);

    if (interactionInsideExtension && !ensureCurrentConversation()) {
      event.preventDefault();
      event.stopPropagation();
      return;
    }

    if (drawerOpen && !interactionInsideExtension) {
      drawerOpen = false;
      render();
    }
  };

  const handleDocumentKeyDown = (event: KeyboardEvent) => {
    if (event.composedPath().includes(shadowRoot.host) && !ensureCurrentConversation()) {
      event.preventDefault();
      event.stopPropagation();
      return;
    }

    if (drawerOpen && event.key === "Escape") {
      drawerOpen = false;
      render();
    }
  };

  const handleDocumentClick = () => {
    routeWatcher.sync();
  };

  const locale = ctx.get("locale") as LocaleService | undefined;
  if (
    locale !== undefined &&
    typeof locale.register === "function" &&
    typeof locale.bind === "function"
  ) {
    try {
      disposeLocale = locale.register(NS, { en, zh });
    } catch {
      // HMR can race a previous namespace registration. The bound translator
      // still resolves the new dictionary after the old fiber disposes.
    }
    t = locale.bind(NS);
  }
  if (locale !== undefined && typeof locale.subscribe === "function") {
    unsubscribeLocale = locale.subscribe(() => {
      render();
    });
  }

  positionManager.start();
  const themeManager = new ThemeManager(shadowRoot.host as HTMLElement);
  themeManager.start();
  sectionTracker.start();
  conversationWatcher.start();
  answerTracker.start();
  routeWatcher.start();
  refreshPosition();
  updateActiveSections();
  if (!historyExhausted) {
    window.setTimeout(() => { void loadAllHistory(); }, 800);
  }
  watchdogTimerId = window.setInterval(() => {
    if (destroyed || routeWatcher.sync()) {
      return;
    }

    conversationWatcher.refreshContainer();
    answerTracker.refreshMessages();
    updateActiveSections();
    refreshPosition();
    void loadAllHistory();
  }, 1000);
  document.addEventListener("click", handleDocumentClick);
  document.addEventListener("pointerdown", handleDocumentPointerDown, true);
  document.addEventListener("keydown", handleDocumentKeyDown);
  void loadBookmarks(conversationKey, conversationVersion);
  scheduleMessageRefreshes();

  const handlePageHide = (event: PageTransitionEvent) => {
    if (event.persisted || destroyed) {
      return;
    }

    dispose();
  };

  const dispose = () => {
    if (destroyed) {
      return;
    }

    saveCurrentDirectory();
    if (pendingDomSignatureTimerId !== null) {
      window.clearTimeout(pendingDomSignatureTimerId);
      pendingDomSignatureTimerId = null;
    }
    destroyed = true;
    historyLoadGeneration += 1;
    clearRefreshTimers();
    if (watchdogTimerId !== null) {
      window.clearInterval(watchdogTimerId);
      watchdogTimerId = null;
    }
    document.removeEventListener("click", handleDocumentClick);
    document.removeEventListener("pointerdown", handleDocumentPointerDown, true);
    document.removeEventListener("keydown", handleDocumentKeyDown);
    window.removeEventListener("pagehide", handlePageHide);
    routeWatcher.destroy();
    conversationWatcher.destroy();
    answerTracker.destroy();
    positionManager.destroy();
    sectionTracker.destroy();
    themeManager.destroy();
    unsubscribeLocale();
    disposeLocale();
    reactRoot.unmount();
    shadowRoot.host.remove();
  };

  window.addEventListener("pagehide", handlePageHide);

  return dispose;
}
