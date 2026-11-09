import { describe, it, expect, beforeEach, vi } from 'vitest'
import {
  BRIDGE_GLOBALS,
  callMockBridge,
  createMockBridge,
  type MockBridge,
  type MockToastOptions,
} from '../mock-bridge'
import {
  GUEST_BRIDGE_CONFIG,
  buildPreloadSource,
  installMainWorldBridge,
  toastBannerScript,
} from '../webview-guest'

describe('createMockBridge', () => {
  let toasts: MockToastOptions[]
  let log: ReturnType<typeof vi.fn>
  let bridge: MockBridge

  beforeEach(() => {
    toasts = []
    log = vi.fn()
    bridge = createMockBridge({ showToast: (opts) => toasts.push(opts), log })
  })

  it('hands a toast.show message and type to the showToast callback', async () => {
    await bridge.toast.show({ type: 'success', message: 'It works!' })
    expect(toasts).toEqual([{ type: 'success', message: 'It works!' }])
  })

  it('does not draw a toast for any other call', async () => {
    await bridge.toast.notify({ title: 'hi' })
    expect(toasts).toEqual([])
  })

  it('resolves undefined for an unknown namespace and method without throwing', async () => {
    await expect(bridge.widget.set({ shape: 'stat' })).resolves.toBeUndefined()
    await expect(bridge.made.up()).resolves.toBeUndefined()
  })

  it('logs namespace.method with the arguments', async () => {
    await bridge.project.list('a', 2)
    expect(log).toHaveBeenCalledWith('[dev-shell] project.list', ['a', 2])
  })

  it('round-trips storage, including list by prefix and delete', async () => {
    await bridge.storage.set('todo:1', { done: false })
    await bridge.storage.set('other', 1)
    expect(await bridge.storage.get('todo:1')).toEqual({ done: false })
    expect(await bridge.storage.list('todo:')).toEqual([{ key: 'todo:1', value: { done: false } }])
    await bridge.storage.delete('todo:1')
    expect(await bridge.storage.get('todo:1')).toBeUndefined()
    expect(await bridge.storage.get('missing')).toBeUndefined()
  })

  it('serves settings seeded from the dev config', async () => {
    const seeded = createMockBridge({ showToast: () => undefined, log, settings: { apiKey: 'dev', max: 10 } })
    expect(await seeded.settings.get('apiKey')).toBe('dev')
    expect(await seeded.settings.getAll()).toEqual({ apiKey: 'dev', max: 10 })
    expect(await bridge.settings.getAll()).toEqual({})
  })

  it('theme.get resolves the host placeholder, fresh each time', async () => {
    const theme = (await bridge.theme.get()) as { mode: string; accent: string; surfaces: object }
    expect(theme).toEqual({ mode: 'dark', accent: '139,92,246', surfaces: {} })
    theme.surfaces = { mutated: true }
    expect(await bridge.theme.get()).toEqual({ mode: 'dark', accent: '139,92,246', surfaces: {} })
  })

  it('subscribe methods return a callable unsubscribe, not a promise', () => {
    for (const unsubscribe of [bridge.theme.onChange(() => undefined), bridge.events.on('ch', () => undefined)]) {
      expect(typeof unsubscribe).toBe('function')
      expect((unsubscribe as () => unknown)()).toBeUndefined()
    }
  })

  it('does not treat the bridge as a thenable when awaited', async () => {
    expect(await Promise.resolve(bridge)).toBe(bridge)
  })

  it('callMockBridge dispatches namespace.method with spread args', async () => {
    await callMockBridge(bridge, 'storage', 'set', ['k', 'v'])
    expect(await callMockBridge(bridge, 'storage', 'get', ['k'])).toBe('v')
  })

  it('callMockBridge answers a subscribe call with something IPC can carry, never a function', () => {
    const answer = callMockBridge(bridge, 'theme', 'onChange', ['[function]'])
    expect(answer).toBeUndefined()
    expect(() => structuredClone(answer)).not.toThrow()
  })

  it('resolves undefined for a method named like an Object.prototype member instead of calling it', async () => {
    expect(await bridge.storage.constructor()).toBeUndefined()
    expect(await bridge.toast.toString()).toBeUndefined()
  })
})

describe('installMainWorldBridge', () => {
  it('installs one bridge under both names and forwards calls with function args replaced', async () => {
    const target: Record<string, unknown> = {}
    const invoke = vi.fn().mockResolvedValue('result')
    installMainWorldBridge(invoke, GUEST_BRIDGE_CONFIG, target)

    expect(Object.getOwnPropertyNames(target).sort()).toEqual([...BRIDGE_GLOBALS].sort())
    expect(target.Omniscio).toBe(target.AgentMC)

    const bridge = target.Omniscio as MockBridge
    await expect(bridge.toast.show({ message: 'x' })).resolves.toBe('result')
    expect(invoke).toHaveBeenCalledWith('toast', 'show', [{ message: 'x' }])
    await bridge.events.emit('ch', () => undefined)
    expect(invoke).toHaveBeenLastCalledWith('events', 'emit', ['ch', '[function]'])
  })

  it('returns a synchronous unsubscribe for subscribe methods and survives a failing host', () => {
    const target: Record<string, unknown> = {}
    const invoke = vi.fn().mockRejectedValue(new Error('host gone'))
    installMainWorldBridge(invoke, GUEST_BRIDGE_CONFIG, target)

    const unsubscribe = (target.Omniscio as MockBridge).theme.onChange(() => undefined)
    expect(typeof unsubscribe).toBe('function')
    expect(invoke).toHaveBeenCalledWith('theme', 'onChange', ['[function]'])
  })
})

describe('guest scripts', () => {
  it('preload source is a single CommonJS file that only requires electron', () => {
    const source = buildPreloadSource()
    const requires = [...source.matchAll(/require\(([^)]*)\)/g)].map((m) => m[1])
    expect(requires).toEqual(["'electron'"])
    expect(source).toContain('contextBridge.exposeInMainWorld')
    expect(source).toContain('webFrame.executeJavaScript')
    expect(source).toContain('Omniscio')
    expect(source).toContain('AgentMC')
  })

  it('toast script clamps the duration and carries the message as data, not code', () => {
    const script = toastBannerScript({ message: '"); alert(1); ("', type: 'error', durationMs: 999999 })
    expect(script).toContain('"durationMs":60000')
    expect(script).toContain(JSON.stringify('"); alert(1); ("'))
    expect(toastBannerScript({ message: 'x' })).toContain('"durationMs":3000')
  })
})
