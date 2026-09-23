import { EXTENSION_ROOT_ID } from '../core/constants'

/**
 * Create or reuse the isolated host element that contains the section rail.
 * @returns Open shadow root owned by this plugin.
 */
export function getOrCreateExtensionRoot(): ShadowRoot {
  const existingHost = document.getElementById(EXTENSION_ROOT_ID)

  if (existingHost instanceof HTMLElement) {
    applyHostShell(existingHost)
    return existingHost.shadowRoot ?? existingHost.attachShadow({ mode: 'open' })
  }

  const host = document.createElement('div')
  host.id = EXTENSION_ROOT_ID
  host.dataset.extension = 'dsh-section-nav'
  applyHostShell(host)
  document.body.append(host)

  return host.attachShadow({ mode: 'open' })
}

/**
 * Keep the host outside document layout and let only the rail/drawer receive
 * pointer input. A body-level block host could otherwise change body layout
 * while a fixed overlay with the whole viewport would intercept every click.
 * @param host - plugin host element.
 */
function applyHostShell(host: HTMLElement): void {
  host.style.position = 'fixed'
  host.style.inset = '0'
  host.style.pointerEvents = 'none'
  host.style.zIndex = '2147483000'
}
