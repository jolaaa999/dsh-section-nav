export type SectionLevel = 1 | 2 | 3;

export interface Section {
  answerFingerprint: string;
  answerIndex: number;
  answerKey: string;
  /** 该轮用户消息对应的模型最终回答片段，供 rail 悬浮卡片的小字使用。 */
  answerText?: string;
  depth: number;
  element: HTMLElement;
  kind?: "heading" | "turn";
  headingPath: string;
  id: string;
  index: number;
  key: string;
  level: SectionLevel;
  messageId: string | null;
  nextHeadingHash: string | null;
  previousHeadingHash: string | null;
  text: string;
  textHash: string;
  turnIndex: number | null;
}

export interface Bookmark {
  answerFingerprint?: string;
  answerIndex?: number;
  answerKey: string;
  conversationKey: string;
  createdAt: number;
  headingPath?: string;
  id: string;
  kind?: "heading" | "turn";
  locatorVersion?: 2 | 3;
  messageId?: string;
  nextHeadingHash?: string;
  note?: string;
  previousHeadingHash?: string;
  scrollOffset?: number;
  scrollRange?: number;
  scrollRatio?: number;
  sectionIndex: number;
  sectionKey: string;
  sectionLevel: SectionLevel;
  sectionText: string;
  sectionTextHash?: string;
  turnIndex?: number;
}
