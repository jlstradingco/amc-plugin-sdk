import { WIDGET_ACTION_IDS } from '@omniscio/plugin-sdk'
import type { PreviewState } from './preview-state.js'

export const BRIDGE_GLOBALS = ['Omniscio', 'AgentMC'] as const

/** Method names that subscribe (`on`, `onChange`, `onMessage`...) and so return an unsubscribe function. */
export const SUBSCRIBE_METHOD_PATTERN = /^on([A-Z]|$)/

/** The host's own static placeholder for `theme.get()`. */
export const THEME_PLACEHOLDER = Object.freeze({
  mode: 'dark',
  accent: '139,92,246',
})

export interface MockToastOptions {
  message: string
  type?: 'info' | 'success' | 'warning' | 'error'
  durationMs?: number
}

export interface MockBridgeOptions {
  /** Called for every `toast.show(...)` so the shell can draw it. */
  showToast(opts: MockToastOptions): void
  /** Seeds `settings.get` / `settings.getAll`. */
  settings?: Record<string, unknown>
  /** Defaults to `console.log`. */
  log?(line: string, args: unknown[]): void
  /** When set, `widget.*` and `sidebar.*` calls feed the shell's sidebar preview. */
  preview?: PreviewState
}

export type MockBridgeMethod = (...args: unknown[]) => unknown
export type MockBridge = Record<string, Record<string, MockBridgeMethod>>

type Handler = (args: unknown[]) => unknown

const OPEN_PLACE_ACTION = 'open-place'

function answerWidgetAction(request: unknown): unknown {
  const { action, target } = (request ?? {}) as { action?: unknown; target?: unknown }
  if (typeof action !== 'string' || !(WIDGET_ACTION_IDS as readonly string[]).includes(action)) {
    throw new Error(`unknown widget action "${String(action)}"`)
  }
  if (typeof target !== 'string' || target.length === 0) {
    throw new Error(`widget action "${action}" needs a target`)
  }
  if (action === OPEN_PLACE_ACTION) return { status: 'ran', action, summary: `Opened ${target}` }
  return { status: 'needs-confirmation', confirmation: { action, target, canRemember: true } }
}

function previewHandlers(preview: PreviewState): Record<string, Record<string, Handler>> {
  return {
    widget: {
      set: ([spec, selector]) => preview.setWidget(spec, selector as { widgetId?: unknown } | undefined),
      clear: ([selector]) => preview.clearWidget(selector as { widgetId?: unknown } | undefined),
      action: ([request]) => answerWidgetAction(request),
    },
    sidebar: {
      setItems: ([items]) => preview.setRows(items),
      setBadge: ([count]) => preview.setBadge(count),
    },
  }
}

function createHandlers(options: MockBridgeOptions): Record<string, Record<string, Handler>> {
  const storage = new Map<string, unknown>()
  const settings = new Map<string, unknown>(Object.entries(options.settings ?? {}))
  return {
    ...(options.preview ? previewHandlers(options.preview) : {}),
    toast: {
      show: ([opts]) => options.showToast(opts as MockToastOptions),
    },
    theme: {
      get: () => ({ ...THEME_PLACEHOLDER, surfaces: {} }),
    },
    storage: {
      get: ([key]) => storage.get(key as string),
      set: ([key, value]) => void storage.set(key as string, value),
      delete: ([key]) => void storage.delete(key as string),
      list: ([prefix]) =>
        [...storage.entries()]
          .filter(([key]) => key.startsWith((prefix as string | undefined) ?? ''))
          .map(([key, value]) => ({ key, value })),
    },
    settings: {
      get: ([key]) => settings.get(key as string),
      getAll: () => Object.fromEntries(settings),
    },
  }
}

function createNamespace(
  name: string,
  handlers: Record<string, Handler>,
  log: NonNullable<MockBridgeOptions['log']>,
): Record<string, MockBridgeMethod> {
  const call = (method: string, args: unknown[]): unknown => {
    log(`[dev-shell] ${name}.${method}`, args)
    if (SUBSCRIBE_METHOD_PATTERN.test(method)) return () => undefined
    return new Promise((resolve) =>
      resolve(Object.hasOwn(handlers, method) ? handlers[method](args) : undefined),
    )
  }
  return new Proxy({} as Record<string, MockBridgeMethod>, {
    get: (_target, method) =>
      typeof method === 'string' && method !== 'then'
        ? (...args: unknown[]) => call(method, args)
        : undefined,
  })
}

/**
 * Builds the object the dev shell installs as `window.Omniscio` (and `window.AgentMC`).
 * Any `bridge.<namespace>.<method>(...)` logs and resolves `undefined`, so no call throws;
 * `toast`, `theme`, `storage` and `settings` behave like the real thing for a dev session. With a
 * `preview`, `widget` and `sidebar` calls answer like the app, rejecting what the app would reject.
 */
export function createMockBridge(options: MockBridgeOptions): MockBridge {
  const log = options.log ?? ((line, args) => console.log(line, ...args))
  const handlers = createHandlers(options)
  const namespaces = new Map<string, Record<string, MockBridgeMethod>>()
  return new Proxy({} as MockBridge, {
    get: (_target, name) => {
      if (typeof name !== 'string' || name === 'then') return undefined
      if (!namespaces.has(name)) {
        namespaces.set(name, createNamespace(name, handlers[name] ?? {}, log))
      }
      return namespaces.get(name)
    },
  })
}

/**
 * Dispatches one `namespace.method(...args)` call, as the shell's IPC handler does. A subscribe
 * method's unsubscribe function cannot cross IPC, so it answers `undefined` there instead.
 */
export function callMockBridge(
  bridge: MockBridge,
  namespace: string,
  method: string,
  args: unknown[],
): unknown {
  const result = bridge[namespace][method](...args)
  return typeof result === 'function' ? undefined : result
}
