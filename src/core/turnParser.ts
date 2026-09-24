/** Builds directory entries from the conversation's user messages. */
import type { DshAdapter } from './adapter'
import { hashText } from './hash'
import { normalizeText } from './text'
import type { Section } from './types'

const MESSAGE_FINGERPRINT_LENGTH = 280

function messageIdentity(adapter: DshAdapter, message: HTMLElement, index: number): string {
  const messageId = adapter.getMessageId(message)
  return messageId ?? `index:${index}`
}

function userMessageText(message: HTMLElement): string {
  const bubble = message.querySelector<HTMLElement>('[class*="bubble"]')

  if (bubble !== null) {
    return normalizeText(bubble.textContent ?? '')
  }

  const clone = message.cloneNode(true) as HTMLElement
  for (const node of clone.querySelectorAll('[class*="actions"], [class*="time"]')) {
    node.remove()
  }

  return normalizeText(clone.textContent ?? '')
}

/**
 * Read the turn's final model answer.
 *
 * One turn holds several assistant-step rows because a reply streams in as
 * separate steps, so the last row with body text is what the reader saw.
 * Reasoning disclosures are dropped: without that, the excerpt would open on
 * the thinking preamble instead of the answer itself.
 * @param adapter - DSH DOM adapter.
 * @param turnIndex - turn owning the user message, or null when unnumbered.
 * @returns normalized answer text, or an empty string before the turn replies.
 */
function finalAnswerText(adapter: DshAdapter, turnIndex: number | null): string {
  if (turnIndex === null) {
    return ''
  }

  const rows = adapter.getAssistantMessagesByTurnIndex(turnIndex)

  for (let index = rows.length - 1; index >= 0; index -= 1) {
    const row = rows[index]

    if (row === undefined || row.hasAttribute('hidden')) {
      continue
    }

    const source = row.querySelector<HTMLElement>('[class*="markdown"]') ?? row
    const clone = source.cloneNode(true) as HTMLElement

    for (const thought of adapter.getReasoningElements(clone)) {
      thought.remove()
    }

    const answer = normalizeText(clone.textContent ?? '')

    if (answer.length > 0) {
      return answer
    }
  }

  return ''
}

/**
 * Build one directory entry for a user message.
 * @param conversationKey - stable session conversation key.
 * @param message - user message row.
 * @param index - position among user messages.
 * @param adapter - DSH DOM adapter.
 * @returns section-shaped directory entry.
 */
export function sectionFromUserMessage(
  conversationKey: string,
  message: HTMLElement,
  index: number,
  adapter: DshAdapter,
): Section {
  const text = userMessageText(message)
  const messageId = adapter.getMessageId(message)
  const turnIndex = adapter.getTurnIndex(message)
  const identity = messageIdentity(adapter, message, index)
  const key = `${conversationKey}:turn:${identity}`
  const textHash = hashText(text.toLocaleLowerCase())

  return {
    answerFingerprint: hashText(text.slice(0, MESSAGE_FINGERPRINT_LENGTH)),
    answerIndex: index,
    answerKey: messageId === null ? `index:${index}` : `message:${messageId}`,
    answerText: finalAnswerText(adapter, turnIndex),
    depth: 0,
    element: message,
    headingPath: `turn:${index}`,
    id: `section-${hashText(key)}`,
    index,
    key,
    kind: 'turn',
    level: 1,
    messageId,
    nextHeadingHash: null,
    previousHeadingHash: null,
    text,
    textHash,
    turnIndex,
  }
}

/**
 * Build the directory from every loaded user message in transcript order.
 * @param conversationKey - stable session conversation key.
 * @param adapter - DSH DOM adapter.
 * @returns one section per user message.
 */
export function parseTurnSections(conversationKey: string, adapter: DshAdapter): Section[] {
  const messages = adapter.getUserMessages()
  const sections = messages.map((message, index) =>
    sectionFromUserMessage(conversationKey, message, index, adapter),
  )

  return sections.map((section, index) => ({
    ...section,
    nextHeadingHash: sections[index + 1]?.textHash ?? null,
    previousHeadingHash: sections[index - 1]?.textHash ?? null,
  }))
}
