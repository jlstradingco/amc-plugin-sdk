/**
 * Test harness for AMC plugins. Import from '@agent-mc/plugin-sdk/testing' in a
 * vitest / jest test to get a faithful in-memory PluginContext plus capture
 * surfaces, so a backend's activate() logic can be exercised without AMC or
 * Electron.
 *
 *   import { createTestContext } from '@agent-mc/plugin-sdk/testing'
 *   import activate from '../src/backend'
 *
 *   const h = createTestContext({ settings: { apiKey: 'x' } })
 *   const be = activate(h.ctx)
 *   be.onEnable?.()
 *   expect(h.toasts).toHaveLength(1)
 */

import { EventEmitter } from 'node:events'
import type {
  PluginContext,
  CliHandler,
  CliRequest,
  CliResponse,
  SidebarItem,
  InboxItem,
  PluginAuthUser,
  PluginAuthSession,
  Recording,
  QueryOptions
} from '../types/index.js'

export interface CapturedLog {
  level: 'info' | 'warn' | 'error' | 'debug'
  message: string
  args: unknown[]
}

export interface TestContextOptions {
  pluginId?: string
  pluginVersion?: string
  dataDir?: string
  /** Seed values for ctx.settings.get / getAll. */
  settings?: Record<string, unknown>
  /** Injected fetch for ctx.http.fetch. Without it, http.fetch rejects. */
  fetch?: (url: string, options?: RequestInit) => Promise<Response>
  /** Override ctx.ai responses. */
  ai?: {
    generateMessage?: (systemPrompt: string, userPrompt: string) => Promise<string> | string
    generateTitle?: (text: string) => Promise<string> | string
  }
  /** Seed an authenticated user / session. */
  auth?: {
    user?: PluginAuthUser | null
    googleIdToken?: string | null
    session?: PluginAuthSession | null
  }
}

export interface TestHarness {
  ctx: PluginContext
  /** Captured ctx.toast.show calls. */
  toasts: Array<{ type: 'success' | 'error' | 'info'; message: string }>
  /** Captured ctx.toast.notify calls. */
  notifications: Array<{ title: string; body: string }>
  /** Captured ctx.log.* calls. */
  logs: CapturedLog[]
  /** Captured ctx.events.emit calls. */
  emittedEvents: Array<{ channel: string; data: unknown }>
  /** Latest ctx.sidebar.setBadge value (null until set). */
  sidebarBadge: number | null
  /** Latest ctx.sidebar.setItems value. */
  sidebarItems: SidebarItem[]
  /** Latest ctx.inbox.setItems value. */
  inboxItems: InboxItem[]
  /** Trigger a registered cron handler by id. */
  runCron(id: string): Promise<void>
  /** Invoke a registered CLI handler; returns 404 if unregistered. */
  callCli(path: string, req: CliRequest): Promise<CliResponse>
}

function nowIso(): string {
  return new Date().toISOString()
}

function matchesWhere(row: Record<string, unknown>, where?: Record<string, unknown>): boolean {
  if (!where) return true
  return Object.entries(where).every(([k, v]) => row[k] === v)
}

function applyQuery(
  rows: Record<string, unknown>[],
  options?: QueryOptions
): Record<string, unknown>[] {
  let out = rows.filter((r) => matchesWhere(r, options?.where))
  if (options?.orderBy) {
    const key = options.orderBy
    const dir = options.order === 'DESC' ? -1 : 1
    out = [...out].sort((a, b) => {
      const av = a[key]
      const bv = b[key]
      if (av === bv) return 0
      if (av === undefined || av === null) return -1 * dir
      if (bv === undefined || bv === null) return 1 * dir
      return (av < bv ? -1 : 1) * dir
    })
  }
  const offset = options?.offset ?? 0
  const end = options?.limit !== undefined ? offset + options.limit : undefined
  return out.slice(offset, end)
}

export function createTestContext(opts: TestContextOptions = {}): TestHarness {
  const pluginId = opts.pluginId ?? 'test-plugin'
  const pluginVersion = opts.pluginVersion ?? '1.0.0'

  const storageMap = new Map<string, unknown>()
  const collections = new Map<string, Record<string, unknown>[]>()
  const fsFiles = new Map<string, string>()
  const eventBus = new EventEmitter()
  const cronHandlers = new Map<string, () => Promise<void>>()
  const cliHandlers = new Map<string, CliHandler>()
  const sessionStatus = new Map<string, string>()
  const recordings: Recording[] = []
  const settings = { ...(opts.settings ?? {}) }

  const harness: TestHarness = {
    // ctx filled in below
    ctx: undefined as unknown as PluginContext,
    toasts: [],
    notifications: [],
    logs: [],
    emittedEvents: [],
    sidebarBadge: null,
    sidebarItems: [],
    inboxItems: [],
    async runCron(id: string) {
      const handler = cronHandlers.get(id)
      if (!handler) throw new Error(`No cron job registered with id "${id}"`)
      await handler()
    },
    async callCli(path: string, req: CliRequest) {
      const handler = cliHandlers.get(path)
      if (!handler) return { status: 404, body: { error: `No CLI handler for "${path}"` } }
      return handler(req)
    }
  }

  const ctx: PluginContext = {
    pluginId,
    pluginVersion,
    dataDir: opts.dataDir ?? `/tmp/amc-test/${pluginId}`,

    storage: {
      get: (key) => Promise.resolve(storageMap.get(key)),
      set: (key, value) => { storageMap.set(key, value); return Promise.resolve() },
      delete: (key) => { storageMap.delete(key); return Promise.resolve() },
      list: (prefix) => Promise.resolve(
        [...storageMap.entries()]
          .filter(([k]) => !prefix || k.startsWith(prefix))
          .map(([key, value]) => ({ key, value }))
      )
    },

    db: {
      insert: (collection, data) => {
        const rows = collections.get(collection) ?? []
        const row = { ...data, id: crypto.randomUUID(), created_at: nowIso(), updated_at: nowIso() }
        rows.push(row)
        collections.set(collection, rows)
        return Promise.resolve({ ...row })
      },
      query: (collection, options) =>
        Promise.resolve(applyQuery(collections.get(collection) ?? [], options).map((r) => ({ ...r }))),
      getById: (collection, id) => {
        const row = (collections.get(collection) ?? []).find((r) => r.id === id)
        return Promise.resolve(row ? { ...row } : null)
      },
      update: (collection, id, fields) => {
        const rows = collections.get(collection) ?? []
        const row = rows.find((r) => r.id === id)
        if (!row) return Promise.reject(new Error(`No row "${id}" in "${collection}"`))
        Object.assign(row, fields, { updated_at: nowIso() })
        return Promise.resolve({ ...row })
      },
      delete: (collection, id) => {
        const rows = collections.get(collection) ?? []
        collections.set(collection, rows.filter((r) => r.id !== id))
        return Promise.resolve()
      },
      deleteWhere: (collection, where) => {
        const rows = collections.get(collection) ?? []
        collections.set(collection, rows.filter((r) => !matchesWhere(r, where)))
        return Promise.resolve()
      }
    },

    settings: {
      getAll: () => Promise.resolve({ ...settings }),
      get: (key) => Promise.resolve(settings[key])
    },

    log: {
      info: (message, ...args) => { harness.logs.push({ level: 'info', message, args }) },
      warn: (message, ...args) => { harness.logs.push({ level: 'warn', message, args }) },
      error: (message, ...args) => { harness.logs.push({ level: 'error', message, args }) },
      debug: (message, ...args) => { harness.logs.push({ level: 'debug', message, args }) }
    },

    events: {
      emit: (channel, data) => { harness.emittedEvents.push({ channel, data }); eventBus.emit(channel, data) },
      on: (channel, handler) => {
        eventBus.on(channel, handler)
        return () => eventBus.off(channel, handler)
      }
    },

    sessions: {
      create: (createOpts) => {
        const sessionId = `test-session-${crypto.randomUUID().slice(0, 8)}`
        sessionStatus.set(sessionId, 'running')
        void createOpts
        return Promise.resolve({ sessionId })
      },
      sendMessage: () => Promise.resolve(),
      getStatus: (sessionId) => Promise.resolve(sessionStatus.get(sessionId) ?? 'running'),
      getMessages: () => Promise.resolve([]),
      stop: (sessionId) => { sessionStatus.set(sessionId, 'stopped'); return Promise.resolve() },
      onStatusChange: () => () => {}
    },

    ai: {
      generateMessage: (systemPrompt, userPrompt) =>
        Promise.resolve(
          opts.ai?.generateMessage
            ? opts.ai.generateMessage(systemPrompt, userPrompt)
            : `[test-ai] ${userPrompt.slice(0, 100)}`
        ),
      generateTitle: (text) =>
        Promise.resolve(
          opts.ai?.generateTitle ? opts.ai.generateTitle(text) : `[test-ai] ${text.slice(0, 40)}`
        )
    },

    fs: {
      readFile: (relativePath) => {
        const content = fsFiles.get(relativePath)
        return content === undefined
          ? Promise.reject(new Error(`No such file: ${relativePath}`))
          : Promise.resolve(content)
      },
      writeFile: (relativePath, content) => { fsFiles.set(relativePath, content); return Promise.resolve() },
      exists: (relativePath) => Promise.resolve(fsFiles.has(relativePath)),
      listDir: (relativePath) => Promise.resolve(
        [...fsFiles.keys()].filter((k) => !relativePath || k.startsWith(relativePath))
      ),
      deleteFile: (relativePath) => { fsFiles.delete(relativePath); return Promise.resolve() }
    },

    http: {
      fetch: (url, options) => {
        if (!opts.fetch) {
          return Promise.reject(
            new Error('ctx.http.fetch is not mocked — pass { fetch } to createTestContext')
          )
        }
        return opts.fetch(url, options)
      }
    },

    cron: {
      register: (id, _schedule, handler) => { cronHandlers.set(id, handler) },
      unregister: (id) => { cronHandlers.delete(id) },
      isRegistered: (id) => cronHandlers.has(id)
    },

    cli: {
      handle: (path, handler) => { cliHandlers.set(path, handler) },
      removeHandler: (path) => { cliHandlers.delete(path) }
    },

    sidebar: {
      setBadge: (count) => { harness.sidebarBadge = count },
      setItems: (items) => { harness.sidebarItems = items }
    },

    toast: {
      show: (toastOpts) => { harness.toasts.push(toastOpts) },
      notify: (notifyOpts) => { harness.notifications.push(notifyOpts) }
    },

    inbox: {
      setItems: (items) => { harness.inboxItems = items; return Promise.resolve() }
    },

    auth: {
      getUser: () => Promise.resolve(opts.auth?.user ?? null),
      getGoogleIdToken: () => Promise.resolve(opts.auth?.googleIdToken ?? null),
      isAuthenticated: () => Promise.resolve(Boolean(opts.auth?.user)),
      onAuthStateChange: () => () => {},
      requestSignIn: () => Promise.resolve({ success: Boolean(opts.auth?.user) }),
      getSession: () => Promise.resolve(opts.auth?.session ?? null)
    },

    recording: {
      start: () => Promise.resolve({ recordingId: `test-recording-${crypto.randomUUID().slice(0, 8)}` }),
      stop: (handle) => Promise.resolve({ recordingId: handle.recordingId }),
      list: () => Promise.resolve([...recordings]),
      getShareUrl: (recordingId) => Promise.resolve(`https://test.local/recordings/${recordingId}`),
      delete: () => Promise.resolve()
    }
  }

  harness.ctx = ctx
  return harness
}
