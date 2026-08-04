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
  HistoryProject,
  HistorySession,
  HistoryMessage,
  SessionMessage,
  FirebaseAccount,
  FirebaseProject,
  FirebaseSetupStatus,
  SpendReportBreakdown
} from '../types/index.js'

/** Zeroed spend breakdown — the shape a brand-new install reports. */
function emptySpendBreakdown(): SpendReportBreakdown {
  const zeroWindow = { codingValue: 0, backgroundTotal: 0, outOfPocket: 0 }
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
  /** Override ctx.tts. Unset, TTS reports unavailable and synthesize() rejects — the host's
   *  behaviour when the user has configured no voice. */
  tts?: {
    available?: boolean
    synthesize?: (text: string) => Promise<{ audioBase64: string; mime: 'audio/mpeg' }>
  }
  /**
   * Seed what the user has granted to ctx.sessionHistory. Defaults to nothing granted,
   * matching the host's default-deny posture — getMessages() on an unseeded session
   * throws exactly as the real bridge does.
   */
  sessionHistory?: {
    projects?: HistoryProject[]
    sessions?: HistorySession[]
    /** Keyed by session id. Only ids present here are readable. */
    messages?: Record<string, HistoryMessage[]>
    /** What requestAccess() resolves to. Defaults to a cancelled grant. */
    grantResult?: { cancelled?: boolean; sessionIds?: string[]; projectIds?: string[] }
  }
  /** Seed ctx.firebase. Every list defaults to empty, like a machine with no Firebase CLI. */
  firebase?: {
    accounts?: FirebaseAccount[]
    projects?: FirebaseProject[]
    projectsByAccount?: Record<string, FirebaseProject[]>
    setupStatus?: Partial<FirebaseSetupStatus>
    /**
     * What startLogin() reports. Defaults to false, matching the rest of these
     * defaults: no CLI is installed, so the spawn could not have succeeded.
     */
    loginStarts?: boolean
  }
  /** Seed ctx.spend.getBreakdown(). Defaults to an all-zero breakdown. */
  spend?: Partial<SpendReportBreakdown>
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

/**
 * Why `ctx.workspace` is a wall of rejections rather than a working fake.
 *
 * The host has no `workspace` namespace — not on master, not on any branch — so
 * every real call rejects with `Unknown namespace: "workspace"`. An in-memory
 * fake here would make plugin tests pass against a capability that cannot run,
 * which is exactly how `ctx.events` stayed broken for months: this harness
 * implemented it as a real EventEmitter, so unit tests were green the whole time
 * the production path was dead in both directions.
 *
 * So the mock refuses. A test that needs workspace must inject its own double
 * and thereby state, in its own source, that it is testing against a shape
 * nobody has implemented.
 *
 * Delete this and write a real fake ONLY when the host ships the namespace.
 */
const WORKSPACE_NOT_IMPLEMENTED =
  'ctx.workspace is not implemented by the AMC host yet, so this test harness ' +
  'refuses to fake it — a passing test against a fake workspace would be ' +
  'evidence of nothing. The SDK types the capability ahead of the host so ' +
  'plugins can be authored and packaged against it; a real call currently ' +
  'rejects with `Unknown namespace: "workspace"`.'

/** Every method rejects. Kept in sync with the dev-shell's identical stub. */
function workspaceNotImplemented(): PluginContext['workspace'] {
  // One nullary thunk reused for all 17 methods: it is assignable to every
  // signature (fewer params is fine, and Promise<never> satisfies any Promise<T>)
  // and declares no parameter, so `noUnusedParameters` has nothing to complain
  // about.
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
    execCancel: reject
  }
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

export function createTestContext(opts: TestContextOptions = {}): TestHarness {
  const pluginId = opts.pluginId ?? 'test-plugin'
  const pluginVersion = opts.pluginVersion ?? '1.0.0'

  const storageMap = new Map<string, unknown>()
  const secretsMap = new Map<string, string>()
  const collections = new Map<string, Record<string, unknown>[]>()
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
        sessionMessages.set(sessionId, [])
        void createOpts
        return Promise.resolve({ sessionId })
      },
      sendMessage: (sessionId, text) => {
        // Recorded so getMessages() hands back a real row in the real shape.
        const messages = sessionMessages.get(sessionId) ?? []
        messages.push({
          id: `test-message-${messages.length + 1}`,
          role: 'user',
          text,
          timestamp: new Date().toISOString()
        })
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
    },

    tts: {
      isAvailable: () => Promise.resolve(opts.tts?.available ?? false),
      synthesize: (text) => {
        if (opts.tts?.synthesize) return opts.tts.synthesize(text)
        // Mirrors the host: synthesis without a configured voice throws rather
        // than returning silent/empty audio.
        if (!(opts.tts?.available ?? false)) {
          return Promise.reject(
            new Error('Text-to-speech is not configured. Add a voice in Settings.')
          )
        }
        return Promise.resolve({
          audioBase64: Buffer.from(`test-audio:${text}`).toString('base64'),
          mime: 'audio/mpeg' as const
        })
      }
    },

    sessionHistory: {
      listProjects: () => Promise.resolve([...(opts.sessionHistory?.projects ?? [])]),
      listSessions: () => Promise.resolve([...(opts.sessionHistory?.sessions ?? [])]),
      getMessages: ({ sessionId }) => {
        const granted = opts.sessionHistory?.messages ?? {}
        // Default-deny, exactly like the host bridge: an ungranted session is an
        // error, never an empty array (which would read as "no messages").
        if (!Object.prototype.hasOwnProperty.call(granted, sessionId)) {
          return Promise.reject(new Error('session not granted to this plugin'))
        }
        return Promise.resolve([...(granted[sessionId] ?? [])])
      },
      requestAccess: () => {
        const seeded = opts.sessionHistory?.grantResult
        const requestId = `test-history-grant-${crypto.randomUUID().slice(0, 8)}`
        if (!seeded || seeded.cancelled) {
          return Promise.resolve({ requestId, cancelled: true, sessionIds: [], projectIds: [] })
        }
        return Promise.resolve({
          requestId,
          cancelled: false,
          sessionIds: seeded.sessionIds ?? [],
          projectIds: seeded.projectIds ?? []
        })
      }
    },

    firebase: {
      listAccounts: () => Promise.resolve([...(opts.firebase?.accounts ?? [])]),
      listProjects: () => Promise.resolve([...(opts.firebase?.projects ?? [])]),
      // Unknown account resolves to [] rather than throwing — the host swallows
      // every CLI failure into an empty list.
      listProjectsForAccount: (email) =>
        Promise.resolve([...(opts.firebase?.projectsByAccount?.[email] ?? [])]),
      setupStatus: () =>
        Promise.resolve({
          cliInstalled: false,
          signedIn: false,
          accounts: [],
          firebaseAccess: 'unknown' as const,
          billing: { checked: false, hasOpenAccount: false },
          ...(opts.firebase?.setupStatus ?? {})
        }),
      // Defaults false to agree with the dev-shell mock and with the other
      // defaults here: cliInstalled is false, so a spawn cannot have succeeded.
      // Returning true made the two mocks disagree about the same host.
      startLogin: () => Promise.resolve({ started: opts.firebase?.loginStarts ?? false })
    },

    spend: {
      getBreakdown: () => Promise.resolve({ ...emptySpendBreakdown(), ...(opts.spend ?? {}) })
    },

    workspace: workspaceNotImplemented()
  }

  harness.ctx = ctx
  return harness
}
