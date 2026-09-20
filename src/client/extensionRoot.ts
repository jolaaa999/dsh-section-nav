import { EXTENSION_ROOT_ID } from '../core/constants'

/**
 * Create or reuse the isolated host element that contains the section rail.
 * @returns Open shadow root owned by this plugin.
 */
export function getOrCreateExtensionRoot(): ShadowRoot {
  const existingHost = document.getElementById(EXTENSION_ROOT_ID)

  if (existingHost instanceof HTMLElement) {
    return existingHost.shadowRoot ?? existingHost.attachShadow({ mode: 'open' })
  }

  const host = document.createElement('div')
  host.id = EXTENSION_ROOT_ID
  host.dataset.extension = 'dsh-section-nav'
  document.body.append(host)

  return host.attachShadow({ mode: 'open' })
}
