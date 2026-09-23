/**
 * DSH chat DOM adapter.
 *
 * Every DSH-specific selector and DOM traversal lives here, mirroring the
 * original ChatGPT extension's adapter boundary. The rest of the plugin works
 * with assistant answer elements, headings, turn indexes, and stable node keys.
 */

/** Selectors and attributes owned by the DSH chat renderer. */
const SELECTORS = {
  chatFlow: '[data-chat-flow]',
  assistantRow: '[data-chat-flow-kind="assistant-step"]',
  heading: 'h1, h2, h3',
  userRow: '[data-chat-flow-kind="user"], [data-chat-flow-kind="steering"]',
  thought: '[data-variant="think"]',
} as const

/** Stable DOM attributes written by the DSH chat renderer. */
const ATTRIBUTES = {
  anchorKey: 'data-chat-anchor-key',
  flowKey: 'data-chat-flow-key',
  flowKind: 'data-chat-flow-kind',
  turn: 'data-chat-turn',
} as const

/** One assistant answer and the two DOM facts bookmarks use to relocate it. */
export interface DshAdapter {
  /** Stable key for the conversation currently displayed in the main chat. */
  getConversationKey(): string
  /** Scrollable chat flow container, or a document fallback. */
  getConversationContainer(): HTMLElement | null
  /** Wider conversation scrollport whose size/position follows layout changes. */
  getLayoutContainer(): HTMLElement | null
  /** Visible assistant answer rows that contain section headings, in transcript order. */
  getAssistantMessages(): HTMLElement[]
  /** Visible user messages, in transcript order. */
  getUserMessages(): HTMLElement[]
  /** Find an assistant answer by the stable key stored in a bookmark. */
  getMessageById(messageId: string): HTMLElement | null
  /** Find an assistant answer by its numeric turn index. */
  getMessageByTurnIndex(turnIndex: number): HTMLElement | null
  /** Stable identity of one assistant answer. */
  getMessageId(message: HTMLElement): string | null
  /** The element whose bounds anchor the rail. */
  getMessageContent(message: HTMLElement): HTMLElement | null
  /** Rendered headings inside one answer, excluding reasoning disclosures. */
  getHeadings(message: HTMLElement): HTMLHeadingElement[]
  /** Numeric turn index of one answer, when its row carries one. */
  getTurnIndex(message: HTMLElement): number | null
}

/** What the adapter reads from the host when it needs the selected Session. */
export interface DshAdapterOptions {
  /** Current DSH Session id, used for bookmark scoping and route changes. */
  readonly getSessionId?: (() => string | undefined) | undefined
}

function normalizePathname(pathname: string): string {
  const normalized = pathname
    .split('/')
    .filter(Boolean)
    .map((segment) => {
      try {
        return decodeURIComponent(segment)
      } catch {
        return segment
      }
    })
    .join('/')

  return normalized ? `/${normalized}` : '/'
}

function uniqueElements(elements: readonly HTMLElement[]): HTMLElement[] {
  return [...new Set(elements)]
}

function queryAttribute(attribute: string, value: string): HTMLElement | null {
  return document.querySelector<HTMLElement>(`[${attribute}="${CSS.escape(value)}"]`)
}

function headingsOf(message: HTMLElement): HTMLHeadingElement[] {
  return Array.from(message.querySelectorAll<HTMLHeadingElement>(SELECTORS.heading))
    .filter((heading) => heading.closest(SELECTORS.thought) === null)
}

function hasSectionHeadings(message: HTMLElement): boolean {
  return headingsOf(message).length > 0
}

/**
 * Create the adapter used by the trackers, parser, and bookmark recovery.
 * @param options - selected Session reader supplied by the plugin entry.
 * @returns DSH chat DOM adapter.
 */
export function createDshAdapter(options: DshAdapterOptions = {}): DshAdapter {
  return {
    getConversationKey() {
      const sessionId = options.getSessionId?.()
      if (sessionId !== undefined && sessionId.length > 0) return `session:${sessionId}`

      const path = normalizePathname(window.location.pathname)
      return path === '/' ? 'session:unknown' : `path:${path}`
    },

    getConversationContainer() {
      const candidates = Array.from(document.querySelectorAll<HTMLElement>(SELECTORS.chatFlow))
      return candidates.find((candidate) => candidate.querySelector(SELECTORS.assistantRow) !== null)
        ?? candidates[0]
        ?? null
    },

    getLayoutContainer() {
      return document.querySelector<HTMLElement>("[data-conversation-scroll]")
        ?? this.getConversationContainer()
    },

    getAssistantMessages() {
      const container = this.getConversationContainer() ?? document
      return uniqueElements(
        Array.from(container.querySelectorAll<HTMLElement>(SELECTORS.assistantRow))
          .filter((element) => !element.hasAttribute('hidden') && hasSectionHeadings(element)),
      )
    },

    getUserMessages() {
      const container = this.getConversationContainer() ?? document
      return uniqueElements(
        Array.from(container.querySelectorAll<HTMLElement>(SELECTORS.userRow))
          .filter((element) => !element.hasAttribute('hidden')),
      )
    },

    getMessageById(messageId) {
      const anchor = queryAttribute(ATTRIBUTES.anchorKey, messageId)
      if (anchor !== null) return anchor
      return queryAttribute(ATTRIBUTES.flowKey, messageId)
    },

    getMessageByTurnIndex(turnIndex) {
      const rows = Array.from(
        document.querySelectorAll<HTMLElement>(`[${ATTRIBUTES.turn}="${String(turnIndex)}"]`),
      ).filter((row) => row.getAttribute(ATTRIBUTES.flowKind) === 'assistant-step')
      return rows.filter(hasSectionHeadings).at(-1) ?? rows.at(-1) ?? null
    },

    getMessageId(message) {
      return message.getAttribute(ATTRIBUTES.anchorKey)
        ?? message.getAttribute(ATTRIBUTES.flowKey)
        ?? null
    },

    getMessageContent(message) {
      return message
    },

    getHeadings(message) {
      return headingsOf(message)
    },

    getTurnIndex(message) {
      const raw = message.getAttribute(ATTRIBUTES.turn)
      if (raw === null || raw.length === 0) return null
      const value = Number(raw)
      return Number.isInteger(value) && value >= 0 ? value : null
    },
  }
}
