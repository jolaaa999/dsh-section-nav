/** Local contracts for the tiny slice of the DSH client runtime this plugin uses. */
import type { Translate } from './locales'

/** Locale service surface used by the plugin. */
export interface LocaleService {
  register(namespace: string, dictionaries: { zh: Record<string, string>; en: Record<string, string> }): () => void
  bind(namespace: string): Translate
  subscribe(listener: () => void): () => void
}

/** Cordis client context surface the plugin needs. */
export interface PluginContext {
  effect(setup: () => (() => void) | void, label?: string): void
  get(service: string): unknown
}
