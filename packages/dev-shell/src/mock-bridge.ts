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
}

export type MockBridgeMethod = (...args: unknown[]) => unknown
export type MockBridge = Record<string, Record<string, MockBridgeMethod>>

type Handler = (args: unknown[]) => unknown

function createHandlers(options: MockBridgeOptions): Record<string, Record<string, Handler>> {
  const storage = new Map<string, unknown>()
  const settings = new Map<string, unknown>(Object.entries(options.settings ?? {}))
  return {
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
    return Promise.resolve(Object.hasOwn(handlers, method) ? handlers[method](args) : undefined)
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
 * `toast`, `theme`, `storage` and `settings` behave like the real thing for a dev session.
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
