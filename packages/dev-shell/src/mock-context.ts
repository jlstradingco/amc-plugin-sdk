import { EventEmitter } from 'node:events'
import * as fs from 'node:fs'
import * as path from 'node:path'
import type { PluginContext, QueryOptions, SessionMessage } from '@agent-mc/plugin-sdk'

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

/**
 * `ctx.workspace` rejects here rather than pretending to work.
 *
 * The host has no `workspace` namespace on any branch, so a real call rejects
 * with `Unknown namespace: "workspace"`. A dev-shell that faked it would let a
 * plugin look finished in the shell and fail the moment it was installed — the
 * same trap `ctx.events` set when the SDK mocked it as a live EventEmitter while
 * the production path was dead.
 *
 * Kept identical to the test harness's stub in
 * packages/sdk/src/testing/index.ts — the two mocks must agree about the host.
 */
const WORKSPACE_NOT_IMPLEMENTED =
  'ctx.workspace is not implemented by the AMC host yet, so the dev shell ' +
  'refuses to fake it — a plugin that works here and nowhere else is worse ' +
  'than one that fails immediately. The SDK types the capability ahead of the ' +
  'host so plugins can be authored and packaged against it; a real call ' +
  'currently rejects with `Unknown namespace: "workspace"`.'

function workspaceNotImplemented(): PluginContext['workspace'] {
  // One nullary thunk for all 17 methods — assignable to every signature, and
  // declares no parameter so `noUnusedParameters` stays satisfied.
  const reject = (): Promise<never> => Promise.reject(new Error(WORKSPACE_NOT_IMPLEMENTED))
  return {
    listProjects: reject,
    listWorktrees: reject,
    requestAccess: reject,
    resolve: reject,
    glob: reject,
    stat: reject,
    exists: reject,
    readFile: reject,
    readFiles: reject,
    listBindings: reject,
    writeFile: reject,
    deleteFile: reject,
    requestBinding: reject,
    exec: reject,
    execStatus: reject,
    execResults: reject,
    execCancel: reject,
  }
}

/**
 * Build a placeholder object matching a generateStructured tool's inputSchema, so
 * the dev shell returns something the plugin can actually render. Only the top
 * level is walked — deeper nesting falls back to the same per-type placeholders.
 */
function mockToolInput(schema: Record<string, unknown>): Record<string, unknown> {
  const properties = (schema['properties'] ?? {}) as Record<string, { type?: string }>
  const out: Record<string, unknown> = {}
  for (const [key, spec] of Object.entries(properties)) {
    switch (spec?.type) {
      case 'array':
        out[key] = [`[AI mock] ${key} 1`, `[AI mock] ${key} 2`]
        break
      case 'number':
      case 'integer':
        out[key] = 0
        break
      case 'boolean':
        out[key] = false
        break
      case 'object':
        out[key] = {}
        break
      default:
        out[key] = `[AI mock] ${key}`
    }
  }
  return out
}

export function createMockContext(opts: MockContextOptions): PluginContext {
  const eventBus = new EventEmitter()
  const prefix = `[plugin:${opts.pluginId}]`
  const shouldLog = opts.logToConsole ?? true
  const seededSettings = { ...(opts.settings ?? {}) }
  const sessionMessages = new Map<string, SessionMessage[]>()

  // --- Persisted KV storage -------------------------------------------------
  // With a real `dataDir` the KV store is flushed to `<dataDir>/amc-dev-storage.json`
  // so a plugin's state survives a dev-shell restart, mirroring the host's
  // durable plugin_kv table. Without one it stays purely in-memory.
  const storageFile = opts.dataDir
    ? path.join(opts.dataDir, 'amc-dev-storage.json')
    : null
  const store = new Map<string, unknown>()
  const secretStore = new Map<string, string>()
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
  // id/created_at/updated_at, query supports where/orderBy/limit/offset, and
  // reads/writes are cloned so held references can't corrupt the store.
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

  // --- Sandboxed filesystem -------------------------------------------------
  // Mirrors the host's PluginFs: every path is relative to the plugin's data
  // directory and cannot escape it. With a `dataDir` reads/writes hit the real
  // filesystem under `<dataDir>/`, so a plugin's ctx.fs output survives a
  // dev-shell restart just like the host. Without one it stays purely in-memory
  // so fs still works in a throwaway dev session.
  const fsRoot = opts.dataDir ? path.resolve(opts.dataDir) : null
  const memFiles = new Map<string, string>()
  const resolveInSandbox = (relativePath: string): string => {
    const full = path.resolve(fsRoot as string, relativePath)
    const rel = path.relative(fsRoot as string, full)
    if (rel === '..' || rel.startsWith(`..${path.sep}`) || path.isAbsolute(rel)) {
      throw new Error(`fs path escapes the plugin sandbox: ${relativePath}`)
    }
    return full
  }
  const realFs: PluginContext['fs'] = {
    readFile: async (rp) => fs.promises.readFile(resolveInSandbox(rp), 'utf-8'),
    writeFile: async (rp, content) => {
      const full = resolveInSandbox(rp)
      await fs.promises.mkdir(path.dirname(full), { recursive: true })
      await fs.promises.writeFile(full, content)
    },
    exists: async (rp) => fs.existsSync(resolveInSandbox(rp)),
    listDir: async (rp) => {
      const full = resolveInSandbox(rp ?? '')
      if (!fs.existsSync(full)) return []
      return fs.promises.readdir(full)
    },
    deleteFile: async (rp) => {
      await fs.promises.rm(resolveInSandbox(rp), { force: true })
    },
  }
  const memFs: PluginContext['fs'] = {
    readFile: (rp) => {
      const content = memFiles.get(rp)
      return content === undefined
        ? Promise.reject(new Error(`No such file: ${rp}`))
        : Promise.resolve(content)
    },
    writeFile: (rp, content) => { memFiles.set(rp, content); return Promise.resolve() },
    exists: (rp) => Promise.resolve(memFiles.has(rp)),
    listDir: (rp) =>
      Promise.resolve([...memFiles.keys()].filter((k) => !rp || k.startsWith(rp))),
    deleteFile: (rp) => { memFiles.delete(rp); return Promise.resolve() },
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

    // In-memory only, and a SEPARATE map from `store`: the real host keeps secrets in
    // their own keychain-backed table, so nothing a dev-shell run writes here should
    // ever land in the storage file `flushStorage()` persists.
    secrets: {
      get: (key) => Promise.resolve(secretStore.get(key) ?? null),
      set: (key, value) => { secretStore.set(key, value); return Promise.resolve() },
      delete: (key) => { secretStore.delete(key); return Promise.resolve() },
      list: () => Promise.resolve([...secretStore.keys()].sort()),
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
          const entry = Object.entries(options.orderBy)[0]
          if (entry) {
            const [key, direction] = entry
            const dir = direction === 'desc' ? -1 : 1
            rows = [...rows].sort((a, b) => {
              const av = a[key]
              const bv = b[key]
              if (av === bv) return 0
              return ((av as number | string) < (bv as number | string) ? -1 : 1) * dir
            })
          }
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
        return Promise.resolve()
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
        sessionMessages.set(sessionId, [])
        return Promise.resolve({ sessionId })
      },
      sendMessage: (sid, text) => {
        if (shouldLog) console.log(`${prefix} [sessions] sendMessage(${sid}): ${text.slice(0, 80)}...`)
        const messages = sessionMessages.get(sid) ?? []
        messages.push({
          id: `mock-message-${messages.length + 1}`,
          role: 'user',
          text,
          timestamp: new Date().toISOString(),
        })
        return Promise.resolve()
      },
      getStatus: () => Promise.resolve('running'),
      getMessages: (sid) => Promise.resolve([...(sessionMessages.get(sid) ?? [])]),
      stop: (sid) => {
        if (shouldLog) console.log(`${prefix} [sessions] stop(${sid})`)
        return Promise.resolve()
      },
      onStatusChange: () => () => {},
    },

    ai: {
      generateMessage: (_sys, user) => Promise.resolve(`[AI mock] Response to: ${user.slice(0, 100)}`),
      generateTitle: (text) => Promise.resolve(`[AI mock] Title: ${text.slice(0, 50)}`),
      isConfigured: () => Promise.resolve(true),
      // Shape the mock from the tool's own inputSchema rather than returning {} —
      // a plugin that renders `tldr` and `bullets` gets something to render in
      // `amc-plugin dev` instead of a screen of undefined.
      generateStructured: (opts) => {
        if (shouldLog) console.log(`${prefix} [ai] generateStructured(${opts.tool.name})`)
        return Promise.resolve(mockToolInput(opts.tool.inputSchema))
      },
    },

    fs: fsRoot ? realFs : memFs,

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

    // The four namespaces below mirror the HOST's real posture rather than
    // returning friendly stubs, so a plugin developed against the dev shell hits
    // the same branches it will hit in AMC. A permissive mock here would let an
    // author ship code that has never once handled "the user said no".
    tts: {
      // No voice is configured in the dev shell, exactly like a fresh install.
      isAvailable: () => Promise.resolve(false),
      synthesize: () =>
        Promise.reject(new Error('Text-to-speech is not configured. Add a voice in Settings.')),
    },

    sessionHistory: {
      listProjects: () => Promise.resolve([]),
      listSessions: () => Promise.resolve([]),
      // Default-deny: nothing is granted in the dev shell, so every read throws
      // just as it would for an ungranted session in AMC.
      getMessages: () => Promise.reject(new Error('session not granted to this plugin')),
      // There is no user to show a picker to — report a cancelled grant, the
      // outcome a plugin must handle anyway.
      requestAccess: () =>
        Promise.resolve({
          requestId: `mock-history-grant-${Date.now()}`,
          cancelled: true,
          sessionIds: [],
          projectIds: [],
        }),
    },

    firebase: {
      // Empty, never rejecting — the host swallows every CLI failure into [].
      listAccounts: () => Promise.resolve([]),
      listProjects: () => Promise.resolve([]),
      listProjectsForAccount: () => Promise.resolve([]),
      setupStatus: () =>
        Promise.resolve({
          cliInstalled: false,
          signedIn: false,
          accounts: [],
          firebaseAccess: 'unknown' as const,
          billing: { checked: false, hasOpenAccount: false },
        }),
      startLogin: () => Promise.resolve({ started: false }),
    },

    spend: {
      getBreakdown: () => {
        const zeroWindow = { codingValue: 0, backgroundTotal: 0, outOfPocket: 0 }
        return Promise.resolve({
          // Epoch, matching createTestContext's emptySpendBreakdown. A wall-clock
          // timestamp made the dev shell and the test harness disagree about the same
          // host, and made a plugin's own snapshot tests non-deterministic.
          generatedAt: new Date(0).toISOString(),
          windows: {
            yesterday: { ...zeroWindow },
            week: { ...zeroWindow },
            month: { ...zeroWindow },
          },
          codingEngines: [],
          backgroundFeatures: [],
          notableCharges: [],
        })
      },
    },

    workspace: workspaceNotImplemented(),
  }
}
