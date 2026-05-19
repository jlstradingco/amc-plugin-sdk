import { EventEmitter } from 'node:events'
import type { PluginContext } from '@agent-mc/plugin-sdk'

interface MockContextOptions {
  pluginId: string
  pluginVersion: string
  dataDir?: string
  logToConsole?: boolean
}

export function createMockContext(opts: MockContextOptions): PluginContext {
  const store = new Map<string, unknown>()
  const eventBus = new EventEmitter()
  const prefix = `[plugin:${opts.pluginId}]`
  const shouldLog = opts.logToConsole ?? true

  return {
    pluginId: opts.pluginId,
    pluginVersion: opts.pluginVersion,
    dataDir: opts.dataDir ?? `/tmp/amc-dev-shell/${opts.pluginId}`,

    storage: {
      get: (key) => Promise.resolve(store.get(key)),
      set: (key, value) => { store.set(key, value); return Promise.resolve() },
      delete: (key) => { store.delete(key); return Promise.resolve() },
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
        const row = { ...data, id, created_at: new Date().toISOString(), updated_at: new Date().toISOString() }
        if (shouldLog) console.log(`${prefix} [db] insert(${col})`, row)
        return Promise.resolve(row)
      },
      query: (col, _options) => {
        if (shouldLog) console.log(`${prefix} [db] query(${col})`)
        return Promise.resolve([])
      },
      getById: (col, id) => {
        if (shouldLog) console.log(`${prefix} [db] getById(${col}, ${id})`)
        return Promise.resolve(null)
      },
      update: (col, id, fields) => {
        if (shouldLog) console.log(`${prefix} [db] update(${col}, ${id})`, fields)
        return Promise.resolve({ id, ...fields, updated_at: new Date().toISOString() })
      },
      delete: (col, id) => {
        if (shouldLog) console.log(`${prefix} [db] delete(${col}, ${id})`)
        return Promise.resolve()
      },
      deleteWhere: (col, where) => {
        if (shouldLog) console.log(`${prefix} [db] deleteWhere(${col})`, where)
        return Promise.resolve()
      },
    },

    settings: {
      getAll: () => Promise.resolve({}),
      get: () => Promise.resolve(undefined),
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
  }
}
