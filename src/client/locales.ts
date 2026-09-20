/** Locale namespace and copy for the section navigation rail. */

/** Namespace registered with `ctx.locale`. */
export const NS = 'dshSectionNav'

/** Bound translator shape used by this plugin's plain React components. */
export type Translate = (key: string, params?: Record<string, string | number>) => string

/** Chinese copy, matching the original Section Nav wording. */
export const zh: Record<string, string> = {
  sections: 'Sections',
  bookmarkOpen: '打开书签列表，共 {count} 项',
  bookmarkTitle: '书签（{count}）',
  emptySections: '当前回答无章节',
  jumpToSection: '跳转到章节：{text}',
  bookmarkSection: '收藏章节：{text}',
  unbookmarkSection: '取消收藏章节：{text}',
  bookmark: '收藏章节',
  unbookmark: '取消收藏',
  bookmarks: '书签',
  currentConversation: '当前对话 · {count}',
  closeBookmarks: '关闭书签列表',
  noBookmarks: '尚未收藏章节',
  locating: '正在定位…',
  unavailable: '目标暂不可用',
  deleteBookmark: '删除书签：{text}',
  delete: '删除书签',
  sectionMeta: 'H{level} · Section {index}',
}

/** English copy, matching the original Section Nav wording. */
export const en: Record<string, string> = {
  sections: 'Sections',
  bookmarkOpen: 'Open bookmarks, {count} total',
  bookmarkTitle: 'Bookmarks ({count})',
  emptySections: 'No sections in the current answer',
  jumpToSection: 'Jump to section: {text}',
  bookmarkSection: 'Bookmark section: {text}',
  unbookmarkSection: 'Remove bookmark: {text}',
  bookmark: 'Bookmark section',
  unbookmark: 'Remove bookmark',
  bookmarks: 'Bookmarks',
  currentConversation: 'Current conversation · {count}',
  closeBookmarks: 'Close bookmark list',
  noBookmarks: 'No bookmarked sections yet',
  locating: 'Locating…',
  unavailable: 'Target unavailable',
  deleteBookmark: 'Delete bookmark: {text}',
  delete: 'Delete bookmark',
  sectionMeta: 'H{level} · Section {index}',
}

/** Minimal fallback used when the locale service is unavailable. */
export function fallbackTranslate(key: string, params?: Record<string, string | number>): string {
  const text = en[key] ?? key
  if (params === undefined) return text
  return text.replace(/\{(\w+)\}/g, (_, name: string) => String(params[name] ?? `{${name}}`))
}
