import { BRIDGE_GLOBALS, SUBSCRIBE_METHOD_PATTERN, type MockToastOptions } from './mock-bridge.js'

export const BRIDGE_CHANNEL = 'dev-shell:bridge-call'
export const INVOKE_GLOBAL = '__amcDevShellInvoke'
export const DEFAULT_TOAST_MS = 3000
export const MAX_TOAST_MS = 60000

export type GuestInvoke = (namespace: string, method: string, args: unknown[]) => Promise<unknown>

export interface GuestBridgeConfig {
  globals: readonly string[]
  subscribePattern: string
}

export const GUEST_BRIDGE_CONFIG: GuestBridgeConfig = {
  globals: BRIDGE_GLOBALS,
  subscribePattern: SUBSCRIBE_METHOD_PATTERN.source,
}

/**
 * Runs inside the plugin page's own JavaScript world and installs the Proxy bridge under every
 * name in `config.globals`. It must stay self-contained: it is serialised with `toString()` and
 * evaluated in the page, because `contextBridge` cannot expose a Proxy whose namespaces and
 * methods are not known up front.
 */
export function installMainWorldBridge(
  invoke: GuestInvoke,
  config: GuestBridgeConfig,
  target: object,
): void {
  const subscribe = new RegExp(config.subscribePattern)
  const namespaces = new Map<string, object>()
  const makeNamespace = (name: string): object =>
    new Proxy({}, {
      get: (_target, method) => {
        if (typeof method !== 'string' || method === 'then') return undefined
        return (...args: unknown[]) => {
          const plain = args.map((arg) => (typeof arg === 'function' ? '[function]' : arg))
          const pending = invoke(name, method, plain)
          if (!subscribe.test(method)) return pending
          pending.catch(() => undefined)
          return () => undefined
        }
      },
    })
  const bridge = new Proxy({}, {
    get: (_target, name) => {
      if (typeof name !== 'string' || name === 'then') return undefined
      if (!namespaces.has(name)) namespaces.set(name, makeNamespace(name))
      return namespaces.get(name)
    },
  })
  for (const global of config.globals) {
    Object.defineProperty(target, global, { value: bridge, configurable: true })
  }
}

/** Draws a toast as a small fixed banner. Serialised with `toString()` and run inside the plugin page. */
export function drawToastBanner(doc: Document, opts: MockToastOptions & { durationMs: number }): void {
  const colours: Record<string, string> = {
    info: '#2563eb',
    success: '#16a34a',
    warning: '#d97706',
    error: '#dc2626',
  }
  let stack = doc.getElementById('amc-dev-shell-toasts')
  if (!stack) {
    stack = doc.createElement('div')
    stack.id = 'amc-dev-shell-toasts'
    stack.style.cssText =
      'position:fixed;right:16px;bottom:16px;z-index:2147483647;display:flex;flex-direction:column;gap:8px'
    doc.body.appendChild(stack)
  }
  const banner = doc.createElement('div')
  banner.textContent = opts.message
  banner.style.cssText =
    'padding:10px 14px;border-radius:6px;color:#fff;font:13px sans-serif;box-shadow:0 2px 8px rgba(0,0,0,.4);background:' +
    (colours[opts.type ?? 'info'] ?? colours.info)
  stack.appendChild(banner)
  setTimeout(() => banner.remove(), opts.durationMs)
}

/** The script the shell runs inside the plugin page to show one toast. */
export function toastBannerScript(opts: MockToastOptions): string {
  const requested = Number(opts?.durationMs)
  const durationMs = requested > 0 ? Math.min(requested, MAX_TOAST_MS) : DEFAULT_TOAST_MS
  const safe = { type: opts?.type, message: String(opts?.message ?? ''), durationMs }
  return `(${drawToastBanner.toString()})(document, ${JSON.stringify(safe)})`
}

/**
 * The source of the `<webview>` preload. It is a single CommonJS file that needs only
 * `electron`, so it loads even when the guest is sandboxed (a sandboxed preload cannot require
 * other files) and regardless of this package being ESM. It forwards bridge calls to the shell
 * process over IPC and installs the page-world Proxy before any plugin script runs.
 */
export function buildPreloadSource(): string {
  const install =
    `(${installMainWorldBridge.toString()})(window.${INVOKE_GLOBAL}, ` +
    `${JSON.stringify(GUEST_BRIDGE_CONFIG)}, window)`
  return [
    `const { contextBridge, ipcRenderer, webFrame } = require('electron')`,
    `contextBridge.exposeInMainWorld(${JSON.stringify(INVOKE_GLOBAL)}, ` +
      `(namespace, method, args) => ipcRenderer.invoke(${JSON.stringify(BRIDGE_CHANNEL)}, namespace, method, args))`,
    `webFrame.executeJavaScript(${JSON.stringify(install)})`,
    '',
  ].join('\n')
}
