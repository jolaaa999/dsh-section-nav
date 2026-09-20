/** Locale namespace and copy for the section navigation rail. */

/** Namespace registered with `ctx.locale`. */
export const NS = 'dshSectionNav'

/** Bound translator shape used by this plugin's plain React components. */
export type Translate = (key: string, params?: Record<string, string | number>) => string

/** Chinese copy, matching the original Section Nav wording. */
export const zh: Record<string, string> = {
  sections: '目录',
  currentAnswer: '当前回答',
  historyAnswer: '历史回答 {index}',
  bookmarkOpen: '打开书签列表，共 {count} 项',
  bookmarkTitle: '书签（{count}）',
  emptySections: '当前会话还没有可导航的消息',
  jumpToSection: '跳转到消息：{text}',
  bookmarkSection: '收藏消息：{text}',
  unbookmarkSection: '取消收藏消息：{text}',
  bookmark: '收藏消息',
  unbookmark: '取消收藏',
  bookmarks: '书签',
  currentConversation: '当前对话 · {count}',
  closeBookmarks: '关闭书签列表',
  noBookmarks: '尚未收藏消息',
  locating: '正在定位…',
  unavailable: '目标暂不可用',
  deleteBookmark: '删除书签：{text}',
  delete: '删除书签',
  messageMeta: '第 {index} 条消息',
  sectionMeta: 'H{level} · Section {index}',
}

/** English copy, matching the original Section Nav wording. */
export const en: Record<string, string> = {
  sections: 'Sections',
  currentAnswer: 'Current answer',
  historyAnswer: 'History answer {index}',
  bookmarkOpen: 'Open bookmarks, {count} total',
  bookmarkTitle: 'Bookmarks ({count})',
  emptySections: 'No navigable messages in this conversation yet',
  jumpToSection: 'Jump to message: {text}',
  bookmarkSection: 'Bookmark message: {text}',
  unbookmarkSection: 'Remove bookmark from message: {text}',
  bookmark: 'Bookmark message',
  unbookmark: 'Remove bookmark',
  bookmarks: 'Bookmarks',
  currentConversation: 'Current conversation · {count}',
  closeBookmarks: 'Close bookmark list',
  noBookmarks: 'No bookmarked messages yet',
  locating: 'Locating…',
  unavailable: 'Target unavailable',
  deleteBookmark: 'Delete bookmark: {text}',
  delete: 'Delete bookmark',
  messageMeta: 'Message {index}',
  sectionMeta: 'H{level} · Section {index}',
}

/** Minimal fallback used when the locale service is unavailable. */
export function fallbackTranslate(key: string, params?: Record<string, string | number>): string {
  const text = en[key] ?? key
  if (params === undefined) return text
  return text.replace(/\{(\w+)\}/g, (_, name: string) => String(params[name] ?? `{${name}}`))
}
