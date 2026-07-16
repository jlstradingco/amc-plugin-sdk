import { EventEmitter } from 'node:events'
import * as fs from 'node:fs'
import * as path from 'node:path'
import type { PluginContext, QueryOptions } from '@agent-mc/plugin-sdk'

interface MockContextOptions {
  pluginId: string
  pluginVersion: string
  dataDir?: string
  logToConsole?: boolean
  /**
   * Dev config the plugin reads via `ctx.settings.getAll()` / `ctx.settings.get()`.
   * The dev-shell loads this from an `amc-dev-settings.json` file next to the
   * plugin, so a plugin's settings-gated logic can actually be exercised.
   */
  settings?: Record<string, unknown>
}

/** A copy so callers can't mutate rows/values still held by the in-memory store. */
function clone<T>(value: T): T {
  return value === undefined ? value : (JSON.parse(JSON.stringify(value)) as T)
}

export function createMockContext(opts: MockContextOptions): PluginContext {
  const eventBus = new EventEmitter()
  const prefix = `[plugin:${opts.pluginId}]`
  const shouldLog = opts.logToConsole ?? true
  const seededSettings = { ...(opts.settings ?? {}) }

  // --- Persisted KV storage -------------------------------------------------
  // With a real `dataDir` the KV store is flushed to `<dataDir>/amc-dev-storage.json`
  // so a plugin's state survives a dev-shell restart, mirroring the host's
  // durable plugin_kv table. Without one it stays purely in-memory.
  const storageFile = opts.dataDir
    ? path.join(opts.dataDir, 'amc-dev-storage.json')
    : null
  const store = new Map<string, unknown>()
  if (storageFile && fs.existsSync(storageFile)) {
    try {
      const raw = JSON.parse(fs.readFileSync(storageFile, 'utf-8')) as Record<string, unknown>
      for (const [k, v] of Object.entries(raw)) store.set(k, v)
    } catch (err) {
      if (shouldLog) console.warn(`${prefix} [storage] failed to load ${storageFile}:`, err)
    }
  }
  const flushStorage = (): void => {
    if (!storageFile) return
    fs.mkdirSync(path.dirname(storageFile), { recursive: true })
    fs.writeFileSync(storageFile, JSON.stringify(Object.fromEntries(store), null, 2))
  }

  // --- Faithful in-memory relational store ----------------------------------
  // Mirrors the host's per-collection tables: rows carry framework-managed
  // id/created_at/updated_at, query supports where/orderBy/order/limit/offset,
  // and reads/writes are cloned so held references can't corrupt the store.
  const collections = new Map<string, Map<string, Record<string, unknown>>>()
  const collectionOf = (name: string): Map<string, Record<string, unknown>> => {
    let col = collections.get(name)
    if (!col) { col = new Map(); collections.set(name, col) }
    return col
  }
  const matchesWhere = (row: Record<string, unknown>, where?: Record<string, unknown>): boolean => {
    if (!where) return true
    return Object.entries(where).every(([k, v]) => row[k] === v)
  }

  return {
    pluginId: opts.pluginId,
    pluginVersion: opts.pluginVersion,
    dataDir: opts.dataDir ?? `/tmp/amc-dev-shell/${opts.pluginId}`,

    storage: {
      get: (key) => Promise.resolve(store.get(key)),
      set: (key, value) => { store.set(key, value); flushStorage(); return Promise.resolve() },
      delete: (key) => { store.delete(key); flushStorage(); return Promise.resolve() },
      list: (pfx) => {
        const items = [...store.entries()]
          .filter(([k]) => !pfx || k.startsWith(pfx))
          .map(([key, value]) => ({ key, value }))
        return Promise.resolve(items)
      },
    },

    db: {
      insert: (col, data) => {
        const id = crypto.randomUUID()
        const now = new Date().toISOString()
        const row = { ...clone(data), id, created_at: now, updated_at: now }
        collectionOf(col).set(id, row)
        if (shouldLog) console.log(`${prefix} [db] insert(${col})`, row)
        return Promise.resolve(clone(row))
      },
      query: (col, options?: QueryOptions) => {
        let rows = [...collectionOf(col).values()].filter((r) => matchesWhere(r, options?.where))
        if (options?.orderBy) {
          const key = options.orderBy
          const dir = options.order === 'DESC' ? -1 : 1
          rows = [...rows].sort((a, b) => {
            const av = a[key]
            const bv = b[key]
            if (av === bv) return 0
            return ((av as number | string) < (bv as number | string) ? -1 : 1) * dir
          })
        }
        const offset = options?.offset ?? 0
        const sliced = options?.limit !== undefined
          ? rows.slice(offset, offset + options.limit)
          : rows.slice(offset)
        if (shouldLog) console.log(`${prefix} [db] query(${col}) -> ${sliced.length} rows`)
        return Promise.resolve(sliced.map(clone))
      },
      getById: (col, id) => {
        const row = collectionOf(col).get(id)
        if (shouldLog) console.log(`${prefix} [db] getById(${col}, ${id}) -> ${row ? 'hit' : 'null'}`)
        return Promise.resolve(row ? clone(row) : null)
      },
      update: (col, id, fields) => {
        const existing = collectionOf(col).get(id)
        if (!existing) {
          return Promise.reject(new Error(`db.update: no row "${id}" in collection "${col}"`))
        }
        const updated = { ...existing, ...clone(fields), id, updated_at: new Date().toISOString() }
        collectionOf(col).set(id, updated)
        if (shouldLog) console.log(`${prefix} [db] update(${col}, ${id})`, fields)
        return Promise.resolve(clone(updated))
      },
      delete: (col, id) => {
        collectionOf(col).delete(id)
        if (shouldLog) console.log(`${prefix} [db] delete(${col}, ${id})`)
        return Promise.resolve()
      },
      deleteWhere: (col, where) => {
        const target = collectionOf(col)
        for (const [id, row] of [...target.entries()]) {
          if (matchesWhere(row, where)) target.delete(id)
        }
        if (shouldLog) console.log(`${prefix} [db] deleteWhere(${col})`, where)
        return Promise.resolve()
      },
    },

    settings: {
      getAll: () => Promise.resolve(clone(seededSettings)),
      get: (key) => Promise.resolve(clone(seededSettings[key])),
    },

    log: {
      info: (msg, ...args) => { if (shouldLog) console.log(`${prefix} [info]`, msg, ...args) },
      warn: (msg, ...args) => { if (shouldLog) console.warn(`${prefix} [warn]`, msg, ...args) },
      error: (msg, ...args) => { if (shouldLog) console.error(`${prefix} [error]`, msg, ...args) },
      debug: (msg, ...args) => { if (shouldLog) console.debug(`${prefix} [debug]`, msg, ...args) },
    },

    events: {
      emit: (channel, data) => eventBus.emit(channel, data),
      on: (channel, handler) => {
        eventBus.on(channel, handler)
        return () => eventBus.off(channel, handler)
      },
    },

    sessions: {
      create: (_opts) => {
        const sessionId = `mock-session-${Date.now()}`
        if (shouldLog) console.log(`${prefix} [sessions] create -> ${sessionId}`)
        return Promise.resolve({ sessionId })
      },
      sendMessage: (sid, text) => {
        if (shouldLog) console.log(`${prefix} [sessions] sendMessage(${sid}): ${text.slice(0, 80)}...`)
        return Promise.resolve()
      },
      getStatus: () => Promise.resolve('running'),
      getMessages: () => Promise.resolve([]),
      stop: (sid) => {
        if (shouldLog) console.log(`${prefix} [sessions] stop(${sid})`)
        return Promise.resolve()
      },
      onStatusChange: () => () => {},
    },

    ai: {
      generateMessage: (_sys, user) => Promise.resolve(`[AI mock] Response to: ${user.slice(0, 100)}`),
      generateTitle: (text) => Promise.resolve(`[AI mock] Title: ${text.slice(0, 50)}`),
    },

    fs: {
      readFile: () => Promise.reject(new Error('Mock fs: use --dataDir for real filesystem')),
      writeFile: () => Promise.reject(new Error('Mock fs: use --dataDir for real filesystem')),
      exists: () => Promise.resolve(false),
      listDir: () => Promise.resolve([]),
      deleteFile: () => Promise.reject(new Error('Mock fs: use --dataDir for real filesystem')),
    },

    http: {
      fetch: (url, options) => globalThis.fetch(url, options),
    },

    cron: {
      register: (id, schedule, _handler) => {
        if (shouldLog) console.log(`${prefix} [cron] register(${id}, ${schedule})`)
      },
      unregister: (id) => {
        if (shouldLog) console.log(`${prefix} [cron] unregister(${id})`)
      },
      isRegistered: () => false,
    },

    cli: {
      handle: (p, _handler) => {
        if (shouldLog) console.log(`${prefix} [cli] handle(${p})`)
      },
      removeHandler: (p) => {
        if (shouldLog) console.log(`${prefix} [cli] removeHandler(${p})`)
      },
    },

    sidebar: {
      setBadge: (count) => {
        if (shouldLog) console.log(`${prefix} [sidebar] setBadge(${count})`)
      },
      setItems: (items) => {
        if (shouldLog) console.log(`${prefix} [sidebar] setItems(${items.length} items)`)
      },
    },

    toast: {
      show: (toastOpts) => {
        if (shouldLog) console.log(`${prefix} [toast] ${toastOpts.type}: ${toastOpts.message}`)
      },
      notify: (notifyOpts) => {
        if (shouldLog) console.log(`${prefix} [notify] ${notifyOpts.title}: ${notifyOpts.body}`)
      },
    },

    inbox: {
      setItems: (items) => {
        if (shouldLog) console.log(`${prefix} [inbox] setItems(${items.length} items)`)
        return Promise.resolve()
      },
    },

    auth: {
      getUser: () => Promise.resolve(null),
      getGoogleIdToken: () => Promise.resolve(null),
      isAuthenticated: () => Promise.resolve(false),
      onAuthStateChange: () => () => {},
      requestSignIn: () => Promise.resolve({ success: false }),
      getSession: () => Promise.resolve(null),
    },

    recording: {
      start: () => Promise.resolve({ recordingId: `mock-recording-${Date.now()}` }),
      stop: (handle) => Promise.resolve({ recordingId: handle.recordingId }),
      list: () => Promise.resolve([]),
      getShareUrl: (recordingId) =>
        Promise.resolve(`https://mock.local/recordings/${recordingId}`),
      delete: () => Promise.resolve(),
    },
  }
}
