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
import { HIDDEN_RAIL_POSITION, PositionManager, type RailPosition } from "../core/positionManager";
import { navigateToSection } from "../core/sectionNavigation";
import { parseSections } from "../core/sectionParser";
import { SectionTracker } from "../core/sectionTracker";
import { App } from "./components/App";
import { getOrCreateExtensionRoot } from "./extensionRoot";
import { en, fallbackTranslate, NS, type Translate, zh } from "./locales";
import type { LocaleService, PluginContext } from "./pluginTypes";
import { extensionCss } from "./styles";
import { ThemeManager } from "./themeManager";

const INITIAL_REFRESH_DELAYS = [100, 400, 1000, 2000, 3500] as const;

function sectionsEqual(first: Section[], second: Section[]): boolean {
  return (
    first.length === second.length &&
    first.every(
      (section, index) =>
        section.id === second[index]?.id &&
        section.element === second[index]?.element &&
        section.text === second[index]?.text,
    )
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
  let railPosition: RailPosition = HIDDEN_RAIL_POSITION;
  let resolvingBookmarkIds = new Set<string>();
  let sections: Section[] = [];
  let t: Translate = fallbackTranslate;
  let unsubscribeLocale: () => void = () => {};
  let disposeLocale: () => void = () => {};
  let unresolvedBookmarkIds = new Set<string>();
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

            drawerOpen = false;
            activeSectionId = section.id;
            render();
            navigateToSection(section);
          }}
          onToggleBookmark={(section) => {
            if (!ensureCurrentConversation()) {
              return;
            }

            const operationKey = conversationKey;
            const operationVersion = conversationVersion;

            void bookmarkService
              .toggle(operationKey, section)
              .then((nextBookmarks) => {
                const savedBookmark = nextBookmarks.find(
                  (bookmark) => bookmark.sectionKey === section.key,
                );

                if (savedBookmark) {
                  bookmarkTargetCache.set(savedBookmark.id, section);
                } else {
                  for (const [bookmarkId, target] of bookmarkTargetCache) {
                    if (target.key === section.key) {
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
    navigateToSection(targetSection);
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

  const sectionTracker = new SectionTracker({
    onActiveSectionChange(sectionId) {
      activeSectionId = sectionId;
      render();
    },
  });

  const updateActiveSections = () => {
    if (!activeAnswer?.element.isConnected) {
      return;
    }

    const nextSections = parseSections(activeAnswer.element, adapter, activeAnswer.index);

    if (sectionsEqual(sections, nextSections)) {
      return;
    }

    sections = nextSections;
    cacheBookmarkTargets(sections);
    positionManager.setTarget(
      adapter.getMessageContent(activeAnswer.element) ?? activeAnswer.element,
    );
    sectionTracker.setSections(sections);
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
      sections = activeAnswer
        ? parseSections(activeAnswer.element, adapter, activeAnswer.index)
        : [];
      cacheBookmarkTargets(sections);
      positionManager.setTarget(
        activeAnswer
          ? (adapter.getMessageContent(activeAnswer.element) ?? activeAnswer.element)
          : null,
      );
      sectionTracker.setSections(sections);
      render();
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
    conversationVersion += 1;
    conversationKey = nextConversationKey;
    activeAnswer = null;
    activeSectionId = null;
    bookmarks = [];
    bookmarkNavigationVersion += 1;
    bookmarkTargetCache.clear();
    bookmarkUpgradeIds.clear();
    drawerOpen = false;
    railPosition = HIDDEN_RAIL_POSITION;
    resolvingBookmarkIds = new Set();
    sections = [];
    unresolvedBookmarkIds = new Set();
    conversationWatcher.setActiveAnswer(null);
    answerTracker.reset();
    positionManager.setTarget(null);
    sectionTracker.setSections([]);
    render();
    void loadBookmarks(conversationKey, conversationVersion);
    scheduleMessageRefreshes();
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
  watchdogTimerId = window.setInterval(() => {
    if (destroyed || routeWatcher.sync()) {
      return;
    }

    conversationWatcher.refreshContainer();
    answerTracker.refreshMessages();
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

    destroyed = true;
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
