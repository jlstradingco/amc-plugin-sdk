export type KeyEventType = 'keydown' | 'keyup'

export interface KeyListenerTarget {
  addEventListener(type: string, listener: (event: Event) => void, options?: boolean | AddEventListenerOptions): void
  removeEventListener(type: string, listener: (event: Event) => void, options?: boolean | EventListenerOptions): void
}

export interface KeyListenerOptions {
  target?: KeyListenerTarget
  eventType?: KeyEventType
  capture?: boolean
  enabled?: boolean
}

const EDITABLE_TAGS: ReadonlySet<string> = new Set(['INPUT', 'TEXTAREA'])
const EDITOR_HOST_SELECTOR = '.monaco-editor'
const IME_PROCESS_KEY_CODE = 229

function defaultTarget(): KeyListenerTarget {
  const candidate = (globalThis as { window?: KeyListenerTarget }).window
  if (!candidate) {
    throw new Error('onKey needs a target: this environment has no window')
  }
  return candidate
}

export function onKey(handler: (event: KeyboardEvent) => void, options: KeyListenerOptions = {}): () => void {
  const { eventType = 'keydown', capture = false, enabled = true } = options
  if (!enabled) return () => {}

  const target = options.target ?? defaultTarget()
  const listenerOptions: AddEventListenerOptions = { capture }
  const listener = (event: Event): void => {
    handler(event as KeyboardEvent)
  }

  target.addEventListener(eventType, listener, listenerOptions)
  return () => target.removeEventListener(eventType, listener, listenerOptions)
}

export function isEditableTarget(target: EventTarget | null): boolean {
  const element = target as (Element & { isContentEditable?: boolean }) | null
  if (!element || typeof element.tagName !== 'string') return false
  if (EDITABLE_TAGS.has(element.tagName)) return true
  if (element.isContentEditable === true) return true
  return element.closest?.(EDITOR_HOST_SELECTOR) != null
}

export function isComposingKey(event: Pick<KeyboardEvent, 'isComposing' | 'keyCode'>): boolean {
  return event.isComposing === true || event.keyCode === IME_PROCESS_KEY_CODE
}
