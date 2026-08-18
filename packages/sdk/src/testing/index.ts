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
  PluginAiStructuredRequest,
  Recording,
  QueryOptions,
  SessionMessage,
  SpendReportBreakdown
} from '../types/index.js'

/** Zeroed spend breakdown — the shape a brand-new install reports. */
function emptySpendBreakdown(): SpendReportBreakdown {
  // `codingOutOfPocket` is a SEPARATE real-money term: a window's true
  // out-of-pocket is `outOfPocket + codingOutOfPocket`, never just the former.
  const zeroWindow = { codingValue: 0, backgroundTotal: 0, outOfPocket: 0, codingOutOfPocket: 0 }
  return {
    generatedAt: new Date(0).toISOString(),
    windows: { yesterday: { ...zeroWindow }, week: { ...zeroWindow }, month: { ...zeroWindow } },
    codingEngines: [],
    backgroundFeatures: [],
    notableCharges: []
  }
}

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
    /** Defaults to true, so a plugin gating on it takes the configured path. */
    isConfigured?: () => Promise<boolean> | boolean
    /**
     * Stub structured generation. Without an override the harness echoes an
     * empty object — enough to satisfy the call, but a plugin asserting on real
     * fields should supply its own shape here.
     */
    generateStructured?: (opts: PluginAiStructuredRequest) => Promise<unknown> | unknown
  }
  /** Seed an authenticated user / session. */
  auth?: {
    user?: PluginAuthUser | null
    googleIdToken?: string | null
    session?: PluginAuthSession | null
  }
  // NOTE: no tts / sessionHistory / firebase seeding options. Those namespaces
  // are webview-only and are no longer on PluginContext, so an option to seed
  // them would be accepted and then do nothing.
  spend?: Partial<SpendReportBreakdown>
  db?: {
    /**
     * What `ctx.db.stats()` reports as its `method`. Defaults to 'payload-estimate',
     * which is what an in-memory store can honestly measure — seed 'dbstat' to exercise
     * the page-accurate branch the host takes on a healthy install. Only the flag
     * changes; the byte figures are an estimate either way.
     */
    statsMethod?: 'dbstat' | 'payload-estimate'
  }
}

export interface TestHarness {
  ctx: PluginContext
  /** Captured ctx.toast.show calls. */
  toasts: Array<{
    message: string
    type?: 'info' | 'success' | 'warning' | 'error'
    durationMs?: number
  }>
  /** Captured ctx.toast.notify calls. */
  notifications: Array<{ title: string; body?: string }>
  /** Captured ctx.inbox.postAlert calls. */
  inboxAlerts: Array<{ title: string; body: string; dedupKey?: string }>
  /** Captured ctx.log.* calls. */
  logs: CapturedLog[]
  /** Captured ctx.events.emit calls. */
  emittedEvents: Array<{ channel: string; data: unknown }>
  /** Latest ctx.sidebar.setBadge value (null until set, and `null` also means
   *  the plugin explicitly CLEARED it). A string is legal host-side too. */
  sidebarBadge: number | string | null
  /** Latest ctx.sidebar.setItems value. */
  sidebarItems: SidebarItem[]
  /** Latest ctx.inbox.setItems value. */
  inboxItems: InboxItem[]
  /** Trigger a registered cron handler by id. */
  runCron(id: string): Promise<void>
  /** Invoke a registered CLI handler; returns 404 if unregistered. */
  callCli(path: string, req: CliRequest): Promise<CliResponse>
}

/**
 * Why `ctx.workspace` is a wall of rejections rather than a working fake.
 *
 * The reason CHANGED on 2026-08-11 and the distinction matters. It used to be
 * "the host has no workspace namespace"; the host shipped one on 2026-08-05 and
 * this harness went on rejecting for six days while telling authors a falsehood.
 * It still rejects, but now for a narrower and honest reason:
 *
 * `ctx.workspace` reaches the user's REAL checkouts, and every method is gated
 * by machinery this harness cannot reproduce — a per-project runtime grant the
 * user makes and can revoke, a native confirm dialog on `deleteFile` and on
 * almost every `run`, single-flight refusals per (plugin, method, project), and
 * a walker that silently truncates. An in-memory fake would model none of that,
 * so a green test against it would predict nothing about production. That is
 * exactly how `ctx.events` stayed broken for months: this harness implemented it
 * as a real EventEmitter, so unit tests were green the whole time the production
 * path was dead in both directions.
 *
 * So a test that needs workspace injects its own double and thereby states, in
 * its own source, which host behaviours it is choosing to assume.
 *
 * The method list below is the host's real one (14 methods, derived from
 * WORKSPACE_SCHEMAS at origin/master@8722cc3fca) — a fake that refuses still has
 * to refuse the RIGHT surface, or a typo'd call fails for the wrong reason.
 */
const WORKSPACE_NOT_FAKEABLE =
  'ctx.workspace is implemented by the AMC host, but this test harness does not ' +
  'fake it: the capability is gated by a per-project runtime grant, native ' +
  'confirm dialogs, and single-flight limits that an in-memory double cannot ' +
  'reproduce, so a passing test against a fake would be evidence of nothing. ' +
  'Inject your own double for the methods your test needs.'

/** Every method rejects. Kept in sync with the dev-shell's identical stub. */
function workspaceNotFakeable(): PluginContext['workspace'] {
  // One nullary thunk reused for all 14 methods: it is assignable to every
  // signature (fewer params is fine, and Promise<never> satisfies any Promise<T>)
  // and declares no parameter, so `noUnusedParameters` has nothing to complain
  // about.
  const reject = (): Promise<never> => Promise.reject(new Error(WORKSPACE_NOT_FAKEABLE))
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
    writeFile: reject,
    writeFiles: reject,
    mkdir: reject,
    deleteFile: reject,
    run: reject
  }
}

function nowIso(): string {
  return new Date().toISOString()
}

/**
 * Serialized payload size, the same quantity the host's `payload-estimate` fallback
 * measures. Deliberately NOT a page/allocation figure: indexes and page slack have no
 * meaning in a Map, and reporting one would make `stats()` look page-accurate here and
 * disagree with a real host.
 *
 * Exported so the dev shell measures bytes the same way — one definition of a
 * host-parity measurement, the same rule that keeps `createMockSessionMessage` here.
 */
export function estimatePayloadBytes(value: unknown): number {
  return new TextEncoder().encode(JSON.stringify(value) ?? '').length
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
    const entry = Object.entries(options.orderBy)[0]
    if (entry) {
      const [key, direction] = entry
      const dir = direction === 'desc' ? -1 : 1
      out = [...out].sort((a, b) => {
        const av = a[key]
        const bv = b[key]
        if (av === bv) return 0
        if (av === undefined || av === null) return -1 * dir
        if (bv === undefined || bv === null) return 1 * dir
        return (av < bv ? -1 : 1) * dir
      })
    }
  }
  const offset = options?.offset ?? 0
  const end = options?.limit !== undefined ? offset + options.limit : undefined
  return out.slice(offset, end)
}

/**
 * Build one message row in the shape `ctx.sessions.getMessages()` really returns.
 *
 * Shared by this harness and the dev shell's mock so there is ONE definition of
 * the backend row. That matters more than the line count it saves: this surface
 * names the body `text` while both webview surfaces name it `content`, and a
 * mock that drifts from the host teaches plugin authors the wrong field — the
 * exact failure this SDK's parity tests exist to prevent.
 *
 * Exported so a plugin author hand-rolling a session mock gets the real shape
 * too, instead of inventing a fourth one.
 *
 * @param idPrefix distinguishes rows per harness, e.g. `'test-message'`.
 * @param index    1-based position in the session's transcript.
 */
export function createMockSessionMessage(
  idPrefix: string,
  index: number,
  text: string,
  role: SessionMessage['role'] = 'user'
): SessionMessage {
  return {
    id: `${idPrefix}-${index}`,
    role,
    text,
    timestamp: new Date().toISOString()
  }
}

export function createTestContext(opts: TestContextOptions = {}): TestHarness {
  const pluginId = opts.pluginId ?? 'test-plugin'
  const pluginVersion = opts.pluginVersion ?? '1.0.0'

  const storageMap = new Map<string, unknown>()
  const secretsMap = new Map<string, string>()
  const collections = new Map<string, Record<string, unknown>[]>()
  const statsMethod = opts.db?.statsMethod ?? 'payload-estimate'
  const fsFiles = new Map<string, string>()
  const eventBus = new EventEmitter()
  const cronHandlers = new Map<string, () => Promise<void>>()
  const cliHandlers = new Map<string, CliHandler>()
  const sessionStatus = new Map<string, string>()
  const sessionMessages = new Map<string, SessionMessage[]>()
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
    inboxAlerts: [],
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

    // Deliberately a SEPARATE map from `storageMap`: the host keeps secrets in their own
    // table so a plugin holding `storage` alone cannot enumerate them, and a test double
    // that shared one map would let a test pass that the real bridge would reject.
    secrets: {
      get: (key) => Promise.resolve(secretsMap.get(key) ?? null),
      set: (key, value) => { secretsMap.set(key, value); return Promise.resolve() },
      delete: (key) => { secretsMap.delete(key); return Promise.resolve() },
      list: () => Promise.resolve([...secretsMap.keys()].sort())
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
        return Promise.resolve()
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
      },
      // Mirrors the host's `INSERT … ON CONFLICT (tuple) DO UPDATE` (never REPLACE):
      // on a collision the existing row keeps its id + created_at and every supplied
      // column EXCEPT the conflict tuple is refreshed. Rejecting the same three inputs
      // the host rejects matters more than the happy path — a harness that accepts a
      // write the host throws on lets a plugin's suite go green on a write that fails
      // in production.
      //
      // NOT modelled, because this store has no manifest and no SQL (a green test here
      // is NOT proof the write succeeds on a real host):
      //   - the host requires the conflict tuple to be backed by a `uniqueIndexes`
      //     declaration and raises a SQLite error when it is not; this row-scans, so a
      //     forgotten declaration passes here and throws in production;
      //   - the host's SQL-identifier rejection of unsafe collection/column names.
      upsert: (collection, conflictColumns, data) => {
        if (conflictColumns.length === 0) {
          return Promise.reject(new Error('upsert requires at least one conflict column'))
        }
        if (Object.keys(data).length === 0) {
          return Promise.reject(new Error('upsert requires at least one column of data'))
        }
        for (const col of conflictColumns) {
          if (!(col in data)) {
            return Promise.reject(
              new Error(`upsert conflict column "${col}" must be present in the inserted data`)
            )
          }
        }

        const rows = collections.get(collection) ?? []
        const existing = rows.find((r) => conflictColumns.every((c) => r[c] === data[c]))
        if (existing) {
          for (const [k, v] of Object.entries(data)) {
            if (conflictColumns.includes(k) || k === 'id' || k === 'created_at') continue
            existing[k] = v
          }
          existing.updated_at = nowIso()
          collections.set(collection, rows)
          return Promise.resolve({ ...existing })
        }

        const row = { ...data, id: crypto.randomUUID(), created_at: nowIso(), updated_at: nowIso() }
        rows.push(row)
        collections.set(collection, rows)
        return Promise.resolve({ ...row })
      },
      // NOTE the host throws ("no such table") for a collection the manifest never
      // declared, where this returns 0 — collections here are created by first write,
      // not by a manifest. Same caveat as `query` on an unknown collection, which has
      // always returned [] rather than throwing.
      count: (collection) => Promise.resolve((collections.get(collection) ?? []).length),
      // There are no SQLite pages in a Map, so bytes are always the host's DEGRADED
      // `payload-estimate` quantity — never a faked `dbstat` figure.
      //
      // `method`, though, is seedable via `db.statsMethod`, because the host reports
      // 'dbstat' on a healthy install and its docs tell authors to branch on it. Pinning
      // this to 'payload-estimate' would leave the branch they were told to write
      // permanently unexercised. The reported BYTES stay an estimate either way, so a
      // test seeding 'dbstat' is asserting on its own branching, not on real page counts.
      stats: () => {
        const byCollection = [...collections.entries()]
          .map(([name, rows]) => ({ name, rows: rows.length, bytes: estimatePayloadBytes(rows) }))
          .sort((a, b) => a.name.localeCompare(b.name))
        return Promise.resolve({
          method: statsMethod,
          totalRows: byCollection.reduce((n, c) => n + c.rows, 0),
          totalBytes: byCollection.reduce((n, c) => n + c.bytes, 0),
          collections: byCollection,
          kvBytes: estimatePayloadBytes([...storageMap.entries()]),
          secretsBytes: estimatePayloadBytes([...secretsMap.entries()])
        })
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

    // `on` returns NOTHING, because the host's backend `on` returns nothing —
    // there is no unsubscribe wire protocol for the event bus at all, and the
    // worker's handler set is append-only.
    //
    // This mock used to hand back a working unsubscribe. That is the precise
    // shape of the failure this repo keeps citing as its cautionary tale: the
    // harness implemented `ctx.events` as a live EventEmitter, so tests were
    // green while production was dead. Handing back an `off()` the host cannot
    // provide is the same mistake in miniature — a plugin that cleans up in
    // `onDisable` would crash with `off is not a function`.
    events: {
      emit: (channel, data) => { harness.emittedEvents.push({ channel, data }); eventBus.emit(channel, data) },
      on: (channel, handler) => {
        eventBus.on(channel, handler)
      }
    },

    sessions: {
      create: (createOpts) => {
        const sessionId = `test-session-${crypto.randomUUID().slice(0, 8)}`
        sessionStatus.set(sessionId, 'running')
        sessionMessages.set(sessionId, [])
        void createOpts
        return Promise.resolve({ sessionId })
      },
      sendMessage: (sessionId, text) => {
        // Recorded so getMessages() hands back a real row in the real shape.
        const messages = sessionMessages.get(sessionId) ?? []
        messages.push(createMockSessionMessage('test-message', messages.length + 1, text))
        return Promise.resolve()
      },
      getStatus: (sessionId) => Promise.resolve(sessionStatus.get(sessionId) ?? 'running'),
      getMessages: (sessionId) => Promise.resolve([...(sessionMessages.get(sessionId) ?? [])]),
      // 'ended' is a real AMC status; 'stopped' — which this mock used to
      // invent — is not one of the eleven the host can report.
      stop: (sessionId) => { sessionStatus.set(sessionId, 'ended'); return Promise.resolve() },
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
        ),
      isConfigured: () => Promise.resolve(opts.ai?.isConfigured ? opts.ai.isConfigured() : true),
      generateStructured: (structuredOpts) =>
        Promise.resolve(
          opts.ai?.generateStructured ? opts.ai.generateStructured(structuredOpts) : {}
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

    // All three cross an RPC on the host, so all three are async. `isRegistered`
    // in particular was typed as a bare boolean while returning a Promise, which
    // made every `if (ctx.cron.isRegistered(id))` guard unconditionally true.
    cron: {
      register: (id, _schedule, handler) => {
        cronHandlers.set(id, handler)
        return Promise.resolve()
      },
      unregister: (id) => {
        cronHandlers.delete(id)
        return Promise.resolve()
      },
      isRegistered: (id) => Promise.resolve(cronHandlers.has(id))
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
      setItems: (items) => { harness.inboxItems = items; return Promise.resolve() },
      postAlert: (alertOpts) => { harness.inboxAlerts.push(alertOpts); return Promise.resolve() }
    },

    auth: {
      getUser: () => Promise.resolve(opts.auth?.user ?? null),
      getGoogleIdToken: () => Promise.resolve(opts.auth?.googleIdToken ?? null),
      isAuthenticated: () => Promise.resolve(Boolean(opts.auth?.user)),
      onAuthStateChange: () => () => {},
      requestSignIn: () => Promise.resolve({ success: Boolean(opts.auth?.user) }),
      getSession: () => Promise.resolve(opts.auth?.session ?? null)
    },

    // Mirrors the host's real contract: `start` resolves a DISCRIMINATED result
    // rather than a bare handle, `stop` takes a bare id string, and there is no
    // getShareUrl/delete — the host redacts the share token and never lets a
    // plugin delete a recording. The old mock faked both, so a plugin test could
    // go green calling two methods that do not exist.
    recording: {
      start: () =>
        Promise.resolve({
          ok: true as const,
          recordingId: `test-recording-${crypto.randomUUID().slice(0, 8)}`
        }),
      stop: () => Promise.resolve({ ok: true }),
      list: () => Promise.resolve([...recordings]),
      get: (recordingId) =>
        Promise.resolve(recordings.find((r) => r.id === recordingId) ?? null)
    },

    // NOTE: no `tts`, `sessionHistory` or `firebase` here. All three are
    // webview-only capabilities that the host does NOT put on a backend ctx, so
    // mocking them made a plugin test go green against namespaces that are
    // `undefined` in production. See the note on PluginContext in ../types/context.ts.
    spend: {
      getBreakdown: () => Promise.resolve({ ...emptySpendBreakdown(), ...(opts.spend ?? {}) })
    },

    workspace: workspaceNotFakeable()
  }

  harness.ctx = ctx
  return harness
}
