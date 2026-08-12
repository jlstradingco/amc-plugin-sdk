export interface QueryOptions {
  where?: Record<string, unknown>
  orderBy?: Record<string, 'asc' | 'desc'>
  limit?: number
  offset?: number
}

/**
 * One row in your plugin's sidebar list.
 *
 * **`status` is REQUIRED**, and getting that wrong was expensive: the host
 * validates the whole array against its push schema and, on any failure, logs a
 * warning and DROPS THE ENTIRE BATCH — it never throws and never returns an
 * error. So an item missing `status` made `setItems` resolve successfully while
 * nothing reached the sidebar. This type declared it optional.
 *
 * At most 200 items per call from a webview; over that the call is rejected.
 */
export interface SidebarItem {
  id: string
  title: string
  /** Required. Free-form, up to 200 chars — e.g. `'3 failing'`, `'idle'`. */
  status: string
  subtitle?: string
  needsYou?: boolean
  /** 0-100. */
  progress?: number
  currentStep?: number
  totalSteps?: number
  /** Up to 5 chars, e.g. `'A+'`. */
  grade?: string
  /** 0-100. */
  score?: number
  lastScanDate?: string
}

export interface CliRequest {
  method: string
  path: string
  body?: unknown
  query?: Record<string, string>
}

export interface CliResponse {
  status: number
  body?: unknown
}

export type CliHandler = (req: CliRequest) => Promise<CliResponse>

export interface PluginStorage {
  get(key: string): Promise<unknown>
  set(key: string, value: unknown): Promise<void>
  delete(key: string): Promise<void>
  list(prefix?: string): Promise<{ key: string; value: unknown }[]>
}

/**
 * Store and read this plugin's own credentials, encrypted by the operating system's
 * keychain (macOS Keychain, Windows DPAPI, libsecret) rather than kept as plaintext
 * rows the way `PluginStorage` and `PluginDb` are.
 * Requires the `secrets` permission.
 *
 * Scoped to this plugin, in its own table: a plugin holding `storage` but not
 * `secrets` cannot read these values or even enumerate their keys.
 *
 * Four behaviours matter and none of them are visible in the signatures:
 *
 * - `set` THROWS when the machine has no available keyring. There is no plaintext
 *   fallback anywhere, so a `set` that resolves was definitely encrypted.
 * - `get` returns `null` for BOTH "never set" and "stored but no longer
 *   decryptable". Do not read `null` as "nothing here, safe to overwrite".
 * - `list` returns KEYS only. No layer exposes a read-all-values primitive.
 * - A key is 1–256 characters and a value 1–8192. An empty value is rejected
 *   rather than stored, so `''` is never a value you can read back.
 */
export interface PluginSecrets {
  /** The stored secret, or `null` if it is missing OR no longer decryptable. */
  get(key: string): Promise<string | null>
  /** Encrypt and store. Throws if this computer has no available keychain. */
  set(key: string, value: string): Promise<void>
  /** Remove a secret. Succeeds whether or not the key existed. */
  delete(key: string): Promise<void>
  /** The keys this plugin has stored, sorted. Never the values. */
  list(): Promise<string[]>
}

export interface PluginDb {
  insert(collection: string, data: Record<string, unknown>): Promise<Record<string, unknown>>
  query(collection: string, options?: QueryOptions): Promise<Record<string, unknown>[]>
  getById(collection: string, id: string): Promise<Record<string, unknown> | null>
  update(collection: string, id: string, fields: Record<string, unknown>): Promise<void>
  delete(collection: string, id: string): Promise<void>
  deleteWhere(collection: string, where: Record<string, unknown>): Promise<void>
}

export interface PluginSettings {
  getAll(): Promise<Record<string, unknown>>
  get(key: string): Promise<unknown>
}

export interface PluginLogger {
  info(message: string, ...args: unknown[]): void
  warn(message: string, ...args: unknown[]): void
  error(message: string, ...args: unknown[]): void
  debug(message: string, ...args: unknown[]): void
}

export interface PluginEvents {
  emit(channel: string, data: unknown): void
  /**
   * Subscribe to a channel.
   *
   * **On the BACKEND this returns nothing.** It was typed `() => void`, so
   * `const off = ctx.events.on(...); off()` type-checked and threw
   * `TypeError: off is not a function`. There is no unsubscribe path at all on
   * this surface — no `events.off`, no unsubscribe message in the worker
   * protocol, and the handler set is append-only — so a subscription lives
   * until the worker exits. Guard inside your handler instead.
   *
   * The WEBVIEW surface genuinely does return an unsubscribe; `BridgeEvents`
   * narrows this member to say so.
   */
  on(channel: string, handler: (data: unknown) => void): void
}

/**
 * Every status AMC can report for a session.
 *
 * Deliberately an OPEN union: the `(string & {})` arm keeps editor
 * autocomplete for the known values while still accepting a status the host
 * adds later. A closed union would turn an exhaustive `switch` into a silent
 * misroute the day that happens.
 */
export type SessionStatus =
  | 'running'
  | 'needs_you'
  | 'error'
  | 'stalled'
  | 'starting'
  | 'ready'
  | 'terminating'
  | 'ended'
  | 'archived'
  | 'paused'
  | 'waiting'
  | (string & {})

/**
 * What a session is waiting for when it reports `needs_you`, `error` or
 * `waiting`. `null` when it is not waiting on anything. Open, for the same
 * reason as {@link SessionStatus}.
 */
export type SessionPendingAction =
  | 'question'
  | 'plan_approval'
  | 'permission_request'
  | 'rate_limited'
  | 'api_error'
  | 'auth_error'
  | 'user_stopped'
  | 'subagent_timeout'
  | 'wait_timeout'
  | 'response_aborted'
  | 'recovery_failed'
  | 'mission'
  | 'suspended'
  | (string & {})

/**
 * One message from `ctx.sessions.getMessages()` — the BACKEND shape.
 *
 * The body field is called `text` here. On both webview surfaces the very same
 * row arrives with the body in `content` instead
 * ({@link BridgeSessionMessage}, {@link HistoryMessage}). That split is why
 * plugin code has historically hedged with `m.text ?? m.content ?? ''`; you do
 * not need the hedge if you use the type for the surface you are actually on.
 */
export interface SessionMessage {
  id: string
  /**
   * `'user'` for operator turns, `'assistant'` for agent turns, otherwise the
   * host's raw source — `'system'` rows reach you unfiltered on this surface.
   */
  role: 'user' | 'assistant' | 'system' | (string & {})
  /** The message body. Raw: tool calls and tool output are NOT stripped here. */
  text: string
  timestamp: string
}

export interface PluginSessions {
  /**
   * Create a session on your plugin's own virtual project.
   *
   * There is no `projectId` option. Earlier versions of this SDK declared one
   * and the host has never read it — the project is always derived from your
   * plugin id (`__plugin_<id>__`), so code passing a project appeared to target
   * it and silently did not.
   *
   * `userInitiated` marks the session as user-provoked rather than
   * plugin-background, which is what decides whether AMC surfaces it in the
   * sidebar or hides it as plugin chatter. It is read on THIS backend surface
   * only; the webview's `AgentMC.session.create` silently discards it.
   */
  create(opts: { prompt?: string; userInitiated?: boolean }): Promise<{ sessionId: string }>
  sendMessage(sessionId: string, text: string): Promise<void>
  /**
   * Resolves a bare status string.
   *
   * Backend-only shape. The webview's `AgentMC.session.getStatus` resolves
   * `{ status, pendingAction }` instead — same method name, two shapes. Check
   * which surface you are on before comparing the result to a string.
   */
  getStatus(sessionId: string): Promise<SessionStatus>
  /**
   * The full transcript, unfiltered.
   *
   * Of the three message-read surfaces this is the only genuinely raw one:
   * partial (still-streaming) rows are NOT filtered out and `system` rows are
   * included, so a poll can observe a half-written assistant turn. The two
   * webview surfaces both drop partial rows.
   */
  getMessages(sessionId: string): Promise<SessionMessage[]>
  stop(sessionId: string): Promise<void>
  onStatusChange(sessionId: string, handler: (status: SessionStatus) => void): () => void
}

/**
 * Options for {@link PluginAi.generateStructured}. The host forces the model to
 * call `tool`, so the JSON Schema you want filled goes in `tool.inputSchema` —
 * there is no separate `schema` field. `prompt` and `systemPrompt` are each
 * capped at 32 KB host-side (a spend guard), and every call counts against a
 * per-plugin daily cost ceiling.
 */
export interface PluginAiStructuredRequest {
  /** The user-turn text the model reads. */
  prompt: string
  /** The tool the model is forced to call; its input is what you get back. */
  tool: {
    name: string
    description?: string
    /** JSON Schema describing the object the model must produce. */
    inputSchema: Record<string, unknown>
  }
  systemPrompt?: string
  /** Route to the premium model instead of the default. Costs more. */
  premium?: boolean
}

export interface PluginAi {
  generateMessage(systemPrompt: string, userPrompt: string): Promise<string>
  generateTitle(text: string): Promise<string>
  /**
   * Whether an Anthropic API-key account exists. The other methods need one
   * (the Messages API cannot use OAuth tokens), so check this to fail loudly
   * up front instead of letting generation fail opaquely.
   */
  isConfigured(): Promise<boolean>
  /**
   * Forced-tool generation — resolves with the model's raw structured output
   * (the tool input), already matching `tool.inputSchema`. Available to plugin
   * webviews and worker backends alike.
   */
  generateStructured(opts: PluginAiStructuredRequest): Promise<unknown>
}

export interface PluginFs {
  readFile(relativePath: string): Promise<string>
  writeFile(relativePath: string, content: string): Promise<void>
  exists(relativePath: string): Promise<boolean>
  listDir(relativePath?: string): Promise<string[]>
  deleteFile(relativePath: string): Promise<void>
}

export interface PluginHttp {
  fetch(url: string, options?: RequestInit): Promise<Response>
}

/**
 * Schedule recurring work. Requires the `cron` permission.
 *
 * Every method here crosses an RPC, so all three return promises — they were
 * typed `void`/`boolean`. That is not cosmetic:
 *
 * - `register` REJECTS on an empty id or an invalid cron expression. Typed as
 *   `void`, nothing awaited it, so an invalid schedule became an unhandled
 *   rejection in the host log and the job simply never ran.
 * - `isRegistered` was typed as a bare `boolean` while returning a Promise, so
 *   `if (ctx.cron.isRegistered(id))` was **always truthy** — a Promise object is
 *   never falsy. Every guarded re-register path built on it was dead code.
 */
export interface PluginCron {
  register(id: string, schedule: string, handler: () => Promise<void>): Promise<void>
  unregister(id: string): Promise<void>
  /** Await this. See the note above — the old `boolean` made every guard true. */
  isRegistered(id: string): Promise<boolean>
}

export interface PluginCli {
  handle(path: string, handler: CliHandler): void
  removeHandler(path: string): void
}

export interface PluginSidebar {
  /**
   * `null` CLEARS the badge, and a short string is allowed for a non-numeric
   * marker — both were unspellable while this took `number` alone.
   *
   * Requires the `notifications` permission (`setItems` does not). Since the
   * call returns a promise nothing awaits, a denial surfaces as an unhandled
   * rejection in the host log rather than at your call site.
   */
  setBadge(count: number | string | null): void
  /** At most 200 items; a longer array is rejected outright. */
  setItems(items: SidebarItem[]): void
}

/**
 * Toasts and OS notifications. Requires the `notifications` permission — which
 * this type never mentioned, and which matters more than usual here: the call
 * returns a promise the SDK types as `void`, so a permission denial surfaces as
 * an unhandled rejection in the log rather than at your call site.
 *
 * A malformed payload is dropped with a warning host-side, never thrown.
 */
export interface PluginToast {
  /**
   * `type` is OPTIONAL and includes `'warning'`, which this type omitted — a
   * `'warning'` toast was unspellable and any 4th value was silently discarded.
   */
  show(opts: {
    message: string
    type?: 'info' | 'success' | 'warning' | 'error'
    /** Up to 60000. */
    durationMs?: number
  }): void
  /** `body` is optional host-side. */
  notify(opts: { title: string; body?: string }): void
}

export interface PluginAuthUser {
  uid: string
  email: string
  displayName: string | null
  photoURL: string | null
}

export interface PluginAuthSession {
  provider: 'google' | 'github'
  accessToken: string
  scopes: string[]
  /** Epoch ms — the plugin should re-request near/after this.
   *  For providers without native expiry (GitHub), the broker sets a synthetic 8h TTL. */
  expiresAt: number
  account: { uid: string; email: string }
}

export interface PluginAuth {
  getUser(): Promise<PluginAuthUser | null>
  getGoogleIdToken(): Promise<string | null>
  isAuthenticated(): Promise<boolean>
  onAuthStateChange(handler: (user: PluginAuthUser | null) => void): () => void
  requestSignIn(): Promise<{ success: boolean }>
  getSession(
    provider: 'google' | 'github',
    scopes: string[],
    options?: { createIfNone?: boolean; forceNewSession?: boolean }
  ): Promise<PluginAuthSession | null>
}

/**
 * One row your plugin contributes to AMC's unified inbox.
 *
 * **`timestamp` is REQUIRED** — it is what the inbox orders on, and the plugin
 * owns recency. As with {@link SidebarItem}, a shape failure makes the host log
 * a warning and drop the WHOLE batch silently rather than throwing, so an item
 * without a timestamp meant `setItems` resolved and nothing appeared.
 *
 * `body`, `icon`, `priority`, `actionLabel` and `actionId` were declared here
 * and have never existed host-side; the real optional fields are `subtitle` and
 * `dotColor`. Sending the old shape is what triggered the silent drop.
 */
export interface InboxItem {
  id: string
  title: string
  /** Required ISO timestamp — the inbox's sort key. */
  timestamp: string
  subtitle?: string
  /** Overrides the per-source dot colour. */
  dotColor?: string
}

export interface PluginInbox {
  /** At most 500 items. Replaces this plugin's whole set. */
  setItems(items: InboxItem[]): Promise<void>
  /**
   * Raise a one-off alert, independent of the `setItems` list.
   *
   * `body` is markdown. `dedupKey` suppresses repeats and is namespaced to your
   * plugin host-side, so it cannot collide with another plugin's.
   */
  postAlert(opts: { title: string; body: string; dedupKey?: string }): Promise<void>
}

/**
 * Outcome of {@link PluginRecording.start}.
 *
 * A REFUSAL IS NOT A REJECTION. The recorder being off, already busy,
 * rate-limited, or the user dismissing the native confirm all RESOLVE with
 * `{ ok: false, error }`. So `await start()` succeeding tells you nothing —
 * branch on `ok` before touching `recordingId`.
 */
export type RecordingStartResult =
  | { ok: true; recordingId: string }
  | { ok: false; error: string }

/** Outcome of {@link PluginRecording.stop}. Also resolves rather than rejecting. */
export interface RecordingStopResult {
  ok: boolean
  error?: string
}

/**
 * The redacted view a plugin gets of one recording.
 *
 * Deliberately carries NO file path, share token, or transcript — the host
 * redacts them, so there is no field here to reach them through. `filename`,
 * `sizeBytes` and `createdAt` were previously declared and never existed;
 * `startedAt` is the field that was meant by `createdAt`.
 */
export interface Recording {
  id: string
  status: string
  durationMs: number
  sourceType: string
  sourceLabel: string
  startedAt: string
  /** `null` while still recording. */
  endedAt: string | null
}

/**
 * Start and stop screen recordings, mediated entirely host-side.
 * Requires the `recording` permission (Tier-1 elevated).
 *
 * The plugin never chooses a capture source, never receives frames or file
 * descriptors, and cannot delete or share a recording — `getShareUrl` and
 * `delete` were declared by earlier versions of this SDK and have never existed
 * host-side. They are deliberate non-capabilities, not missing wiring.
 *
 * Every `start` requires a fresh native confirm the plugin cannot bypass, and
 * `list`/`get` only ever return recordings THIS plugin started.
 */
export interface PluginRecording {
  /**
   * Begin recording. Takes no arguments: the host owns source selection and
   * discards anything passed. Resolves a discriminated result — see
   * {@link RecordingStartResult}.
   */
  start(): Promise<RecordingStartResult>
  /**
   * Stop a recording by its ID — a BARE STRING, not a handle object. Passing an
   * object resolves `{ ok: false }` silently rather than throwing, so this is a
   * mistake nothing surfaces at runtime.
   *
   * Only works for a recording this plugin started AND that is still the
   * active one.
   */
  stop(recordingId: string): Promise<RecordingStopResult>
  /** Recordings this plugin started. `[]` when there are none. */
  list(): Promise<Recording[]>
  /** `null` — never a throw — for an unknown or non-owned id. */
  get(recordingId: string): Promise<Recording | null>
}

/** Base64 MP3 returned by `ctx.tts.synthesize()`. Play it in the webview via a data: URL. */
export interface SynthesizedSpeech {
  audioBase64: string
  mime: 'audio/mpeg'
}

/**
 * Text to speech, using whichever voice the user configured in AMC.
 * Requires the `tts` permission.
 *
 * Synthesis is metered AI spend. The host enforces its own per-plugin daily cap
 * (shared with the `ai` capability) and throws once the cap is hit, so treat a
 * rejection from `synthesize()` as an expected runtime state, not a bug.
 */
export interface PluginTts {
  /** False when the user has TTS disabled or has configured no voice provider. */
  isAvailable(): Promise<boolean>
  synthesize(text: string): Promise<SynthesizedSpeech>
}

/** A project the user granted this plugin access to. */
export interface HistoryProject {
  id: string
  name: string
}

/** A session the user granted this plugin access to, directly or via its project. */
export interface HistorySession {
  id: string
  name: string
  projectId: string
  status: SessionStatus
  lastActiveAt: string
}

/**
 * One message from `ctx.sessionHistory.getMessages()` — the cleanest of the
 * three message-read surfaces, and the only one with a closed role union.
 *
 * The host filters `system` rows and still-streaming rows out entirely, then
 * strips tool calls and tool output from the body. Compare
 * {@link SessionMessage} (backend, field named `text`, nothing filtered) and
 * the webview's `BridgeSessionMessage` (field named `content`, keeps `system`).
 */
export interface HistoryMessage {
  id: string
  role: 'user' | 'assistant'
  /** Plain conversation text. Tool calls, tool output and file contents are stripped by the host. */
  content: string
  timestamp: string
}

/** Outcome of a `requestAccess()` round trip. `cancelled` is true when the user dismissed the picker. */
export interface HistoryGrantResult {
  requestId: string
  cancelled?: boolean
  sessionIds?: string[]
  projectIds?: string[]
}

/**
 * Read the user's PAST AMC sessions and projects.
 * Requires the `sessions.readHistory` permission.
 *
 * Strictly opt-in and default-deny: the plugin sees nothing until the user picks
 * specific projects/sessions in the grant picker raised by `requestAccess()`.
 * `getMessages()` throws for a session that was never granted, returns text only,
 * and every read is written to an audit log the plugin cannot touch.
 */
export interface PluginSessionHistory {
  listProjects(): Promise<HistoryProject[]>
  listSessions(): Promise<HistorySession[]>
  getMessages(options: { sessionId: string }): Promise<HistoryMessage[]>
  /** Opens the user's grant picker. Resolves once they choose or cancel. */
  requestAccess(options?: { kinds?: ('session' | 'project')[] }): Promise<HistoryGrantResult>
}

/** A Firebase account the user is signed into via the Firebase CLI. */
export interface FirebaseAccount {
  email: string
  active: boolean
}

export interface FirebaseProject {
  projectId: string
  displayName: string
}

export interface FirebaseSetupStatus {
  cliInstalled: boolean
  signedIn: boolean
  accounts: { email: string }[]
  firebaseAccess: 'ok' | 'needs-tos' | 'unknown'
  billing: { checked: boolean; hasOpenAccount: boolean }
}

/**
 * Enumerate the user's Firebase accounts and projects, and start an interactive login.
 * Requires the `firebase` permission.
 *
 * Backed by the user's locally installed Firebase CLI. Every list method resolves to
 * an EMPTY array when the CLI is missing, times out, or returns an unparseable
 * payload — it never rejects — so check `setupStatus()` to tell "none" from "no CLI".
 */
export interface PluginFirebase {
  listAccounts(): Promise<FirebaseAccount[]>
  listProjects(): Promise<FirebaseProject[]>
  listProjectsForAccount(email: string): Promise<FirebaseProject[]>
  setupStatus(): Promise<FirebaseSetupStatus>
  /** Spawns a detached `firebase login`. `started` only reports that the spawn succeeded. */
  startLogin(): Promise<{ started: boolean }>
}

/** Headline totals for one spend window. All money is USD. */
export interface SpendWindow {
  /** Agent-coding shadow value — what the coding work would have cost at API rates. Not a bill. */
  codingValue: number
  /** Total metered background-feature spend, plan-covered and real combined. */
  backgroundTotal: number
  /**
   * The real out-of-pocket slice of `backgroundTotal` (billed to a real API
   * key). This is the BACKGROUND slice ONLY.
   *
   * **A window's total real money is `outOfPocket + codingOutOfPocket`.** The
   * SDK omitted the second term entirely, so anything reporting `outOfPocket`
   * as "what this cost me" UNDER-REPORTED actual spend.
   */
  outOfPocket: number
  /**
   * The real out-of-pocket slice of CODING sessions — billed to an own-key
   * metered vendor or a real Anthropic API key. Disjoint from `outOfPocket`,
   * and zero when all coding ran on a subscription. Never fold it into
   * `outOfPocket`; add it.
   */
  codingOutOfPocket: number
}

/** One engine's coding line in the yesterday drill-down. */
export interface SpendEngineLine {
  engine: string
  value: number
  sessions: number
  /** True when this engine's spend is real money (own API key) rather than
   *  subscription-covered. Drives the report's per-engine key marker. */
  outOfPocket: boolean
}

/** One background-feature line in the yesterday drill-down. */
export interface SpendFeatureLine {
  label: string
  total: number
  real: number
  count: number
}

/** One notable individual charge, deduped by (feature, model, apiKey). */
export interface SpendCharge {
  amount: number
  feature: string
  model: string
  apiKey: boolean
  count: number
  session: string | null
}

/** The full breakdown returned by `ctx.spend.getBreakdown()`. */
export interface SpendReportBreakdown {
  generatedAt: string
  windows: {
    yesterday: SpendWindow
    week: SpendWindow
    month: SpendWindow
  }
  codingEngines: SpendEngineLine[]
  backgroundFeatures: SpendFeatureLine[]
  /** Empty unless yesterday's biggest single charge was at least $0.10. */
  notableCharges: SpendCharge[]
}

/**
 * Read-only AI cost and usage totals, for building spend reports.
 * Requires the `spend` permission.
 *
 * Returns the host's GLOBAL spend across all of the user's accounts, not a
 * plugin-scoped slice. The host resolves the time windows and timezone itself,
 * so there is nothing to pass and no window to widen.
 */
export interface PluginSpend {
  getBreakdown(): Promise<SpendReportBreakdown>
}

/** Absolute worktree ROOT path. `null` means the main checkout. */
export type WorktreeRef = string | null

/**
 * Identifies a project, and optionally one of its worktrees, that a
 * `WorkspaceApi` call targets.
 */
export interface WorkspaceScope {
  projectId: string
  worktree: WorktreeRef
}

/**
 * A scoped, RELATIVE path into a project. `path` is deliberately relative: the
 * host joins it onto the scope's root and re-checks the result, so a forged
 * absolute or `..`-escaping path cannot reach outside the grant. `resolve()` is
 * the only door an absolute path enters by.
 */
export interface WorkspaceHandle extends WorkspaceScope {
  path: string
}

/** One filesystem entry, as returned by `glob()` and `stat()`. */
export interface WorkspaceEntry {
  path: string
  size: number
  mtimeMs: number
  isDir: boolean
}

/** One repo backing a project. `branch` is `null` when the checkout is detached. */
export interface WorkspaceCheckout {
  repoPath: string
  branch: string | null
}

/**
 * Lifecycle status of the AMC session attached to a worktree, as reported by
 * `listWorktrees()`.
 *
 * - `'cleanup'` has zero assignment sites host-side. It is carried for parity
 *   with the host's own union — never expect to observe it.
 */
export type WorktreeStatus = 'active' | 'merging' | 'merged' | 'cleanup' | 'conflict' | 'failed'

/**
 * One worktree of a project, or the main checkout, as returned by `listWorktrees()`.
 *
 * - `checkouts` has one entry for a repo-rooted project, and one entry per repo
 *   for an umbrella project.
 * - `session` is `null` when no AMC session is currently attached to this worktree.
 */
export interface WorktreeInfo {
  /** Absolute root path. For the main checkout, this is the project folder itself. */
  path: string
  /** `null` for the main checkout — the value to put in a `WorkspaceScope.worktree`. */
  ref: WorktreeRef
  isMain: boolean
  /** `'main'` for the main checkout, otherwise the worktree's basename with any
   *  trailing `-<TS>` suffix split off. */
  label: string
  /** Parsed from the worktree basename's `-<TS>` suffix when present, else
   *  `null`. Note `label` above has that suffix already split off. */
  createdAt: string | null
  checkouts: WorkspaceCheckout[]
  session: { id: string; name: string; status: WorktreeStatus } | null
  updatedAt: string | null
}

/** Options for `glob()`. */
export interface WorkspaceGlobOpts {
  /** Added to the host's default excludes (`.git`, `node_modules`, the project's
   *  own worktree roots, and `.gitignore` walked as ignore rules) — not a
   *  replacement for them. */
  exclude?: string[]
  includeIgnored?: boolean
  includeNodeModules?: boolean
  includeWorktrees?: boolean
}

/** One project this plugin currently holds a runtime grant for. */
export interface WorkspaceProjectRef {
  projectId: string
  name: string
}

/**
 * Per-handle outcome of one `writeFiles()` entry.
 *
 * A batch is NOT atomic and one bad handle does not fail the others: each entry
 * independently reports `{ ok: true }` or `{ error }`. So a resolved promise is
 * not evidence every write landed — check each element.
 */
export type WorkspaceWriteFilesResult = { handle: WorkspaceHandle } & (
  | { ok: true }
  | { error: string }
)

/**
 * The finished result of one `run()`, as returned by the host.
 *
 * `run` is BLOCKING and resolves once, so there is no job id and nothing to
 * poll. It also never rejects for an ordinary command failure: a non-zero exit,
 * a spawn failure and a timeout all resolve with this object, so branch on
 * `exitCode` / `timedOut` rather than reaching for `catch`.
 *
 * - `exitCode` is `null` when the command timed out or could not be spawned.
 * - `stdout` / `stderr` are each capped at 1 MiB host-side. On a timeout the
 *   host appends `\n[timed out]` to `stderr`.
 * - `silent` is true only when the command ran WITHOUT raising the user's
 *   confirm dialog — see {@link WorkspaceApi.run}.
 */
export interface WorkspaceExecResult {
  exitCode: number | null
  stdout: string
  stderr: string
  silent: boolean
  timedOut: boolean
}

/** The one argument to {@link WorkspaceApi.run}. */
export interface WorkspaceRunRequest {
  scope: WorkspaceScope
  /**
   * A bare command NAME, not a shell line — e.g. `'git'`. 1–128 characters.
   * The host resolves it against a PATH deliberately filtered to exclude the
   * project itself and any `node_modules/.bin`, so a repo cannot shadow a
   * system binary with its own.
   */
  command: string
  /** Up to 64 entries, each ≤1024 characters. Passed as argv with
   *  `shell: false` — never concatenated into a shell string. */
  args: string[]
  /**
   * Wall-clock budget. The host validates 1000–120000, then clamps the accepted
   * value to 5000–120000; omitted or invalid means 30000. On expiry the whole
   * process TREE is killed and the call resolves with `timedOut: true`.
   */
  timeoutMs?: number
}

/**
 * Read, write, and run commands against the user's real project checkouts and
 * worktrees, scoped per project by a runtime grant the user makes (and can
 * revoke) independently of the install-time permission; a worktree inherits its
 * project's grant.
 *
 * **Backend only.** There is no `AgentMC.workspace`: the host routes the whole
 * namespace to plugin worker backends and its webview case throws
 * `workspace is not available through the plugin webview bridge yet`.
 *
 * Gated by three permissions, split per method GROUP below. They are NOT
 * hierarchical and none implies another — the host rejects a manifest that asks
 * for `workspace.write` or `workspace.exec` without also listing
 * `workspace.read` explicitly, rather than inferring it, so that the consent
 * card the user reads matches the permission array a plugin actually holds.
 *
 * Note the discovery methods need `workspace.read` specifically. An earlier
 * version of this comment claimed they needed only "any `workspace.*`"; the
 * host gates all four on `workspace.read` like every other read.
 *
 * Three contracts matter and none is visible in the signatures:
 *
 * - **Every negative answer looks identical.** The host collapses almost all
 *   refusals into one string, `That file is not available to this plugin.`, so
 *   a revoked grant, a path outside the scope and a genuinely missing file are
 *   deliberately indistinguishable. Do not branch on the message.
 * - **Some methods are single-flight per (plugin, method, project).** `glob`,
 *   `listWorktrees`, `readFiles`, `writeFiles` and `run` reject a second
 *   concurrent call with `workspace.<m> is already running for this plugin.`,
 *   so `Promise.all` over two globs of the same project fails. Sequence them.
 * - **A batch is not atomic.** `writeFiles` reports success per entry and one
 *   failure does not roll back or stop the rest.
 *
 * Derived from the host's own `WORKSPACE_SCHEMAS` (bridge-method-schemas.ts),
 * `plugin-permission-map.ts` and `workspace-methods.ts` at
 * `origin/master@8722cc3fca`. That code is the source of truth; an earlier
 * revision of this interface was transcribed from an unimplemented spec and
 * invented six methods the host has never had.
 */
export interface WorkspaceApi {
  // ── discovery — workspace.read ──
  /** Projects this plugin currently holds a runtime grant for — NOT every
   *  project the user has. */
  listProjects(): Promise<WorkspaceProjectRef[]>
  /** Blocking and live — reflects the filesystem and running sessions at call
   *  time, not a cached snapshot. */
  listWorktrees(projectId: string): Promise<WorktreeInfo[]>
  /**
   * Opens the host's project-grant picker.
   *
   * Resolves with ONLY the project the user just granted (a one-element array),
   * or `[]` if they cancelled — it is not a read of the full grant set, so do
   * not treat the result as "everything I can now reach". Call
   * {@link listProjects} for that.
   */
  requestAccess(): Promise<WorkspaceProjectRef[]>
  /** The only door an absolute path enters by. `null` when the path falls
   *  outside every project and worktree this plugin can currently reach — and
   *  also `null`, rather than a throw, when the plugin lacks `workspace.read`. */
  resolve(absolutePath: string): Promise<WorkspaceHandle | null>

  // ── workspace.read ──
  /**
   * `patterns` must hold at least ONE pattern (and at most 32, each ≤256
   * chars); an empty array is rejected host-side. `exclude` is capped at 32
   * entries and ADDS to the host's defaults rather than replacing them.
   *
   * Results are silently truncated at the host's walker cap — a short list is
   * not reliably a complete one, and nothing in the return signals it.
   */
  glob(
    s: WorkspaceScope,
    patterns: string[],
    o?: WorkspaceGlobOpts
  ): Promise<WorkspaceEntry[]>
  /** `size` is `0` for a directory. */
  stat(h: WorkspaceHandle): Promise<WorkspaceEntry | null>
  /** Never throws — a refused or missing path is simply `false`. */
  exists(h: WorkspaceHandle): Promise<boolean>
  /** UTF-8 text only; the host also accepts `'utf8'` for this option but
   *  `'utf-8'` is the spelling to prefer. Rejects above a 64 MiB single-file cap. */
  readFile(h: WorkspaceHandle, o?: { encoding?: 'utf-8' }): Promise<string>
  /**
   * Batch read. There is NO transparent chunking: at most 256 handles per call
   * (rejected outright above that), 32 MiB total, and 8 MiB per file — a file
   * over its cap yields an `{ error }` entry rather than failing the batch.
   * Split larger batches yourself.
   */
  readFiles(
    hs: WorkspaceHandle[]
  ): Promise<Array<{ handle: WorkspaceHandle } & ({ content: string } | { error: string })>>

  // ── workspace.write ──
  /**
   * Overwrite (or create) one file, up to 8 MiB.
   *
   * There is deliberately no compare-and-swap: the host has no
   * `expectedMtimeMs` concept, so this is a last-writer-wins overwrite. If you
   * need to avoid clobbering a concurrent edit, `stat()` first and accept the
   * race — the SDK cannot close it for you.
   */
  writeFile(h: WorkspaceHandle, content: string): Promise<void>
  /** Up to 64 entries, 16 MiB total. Per-entry outcomes; NOT atomic. */
  writeFiles(
    batch: Array<{ handle: WorkspaceHandle; content: string }>
  ): Promise<WorkspaceWriteFilesResult[]>
  /** Creates ONE directory. Not recursive — the parent must already exist. */
  mkdir(h: WorkspaceHandle): Promise<void>
  /**
   * Delete one file. Gated on `workspace.write`; there is no separate delete
   * permission.
   *
   * For a file the plugin did not itself create, the host raises a native
   * confirm the plugin cannot bypass; files it created delete silently.
   */
  deleteFile(h: WorkspaceHandle): Promise<void>

  // ── workspace.exec ──
  /**
   * Run ONE bounded command in a granted project and wait for it to finish.
   *
   * Blocking and single-shot: it resolves with the whole result, so there is no
   * job id, no polling, no streamed output and no cancel. It also does not
   * reject on a failed command — a non-zero exit, a spawn failure and a timeout
   * all RESOLVE with a {@link WorkspaceExecResult}.
   *
   * **Almost every call raises a confirm dialog.** The host runs silently only
   * for an exact allow-list match — today `git status --porcelain` and
   * `git status --short` — and prompts the user with the command, args and cwd
   * for anything else. If no confirm can be shown the call is REFUSED, so this
   * can never run unattended.
   *
   * The plugin supplies `command` and `args` directly. There is no manifest
   * command-slot indirection: injection is closed instead by `shell: false`, a
   * filtered PATH, and that confirm.
   */
  run(request: WorkspaceRunRequest): Promise<WorkspaceExecResult>
}

export interface PluginContext {
  pluginId: string
  pluginVersion: string
  /**
   * AMC's userData ROOT — **not** your plugin's own directory, and NOT the root
   * `ctx.fs` is scoped to.
   *
   * Every plugin gets the same string here, while `ctx.fs` resolves relative
   * paths under `<userData>/plugins/<pluginId>/data`. So
   * `ctx.fs.readFile(path.join(ctx.dataDir, 'x.json'))` throws
   * `Path escapes the plugin data directory` — the absolute path lands outside
   * the fs sandbox. Pass `ctx.fs` plain relative paths and ignore this field
   * unless you genuinely want the app-level location.
   */
  dataDir: string
  storage: PluginStorage
  secrets: PluginSecrets
  db: PluginDb
  settings: PluginSettings
  log: PluginLogger
  events: PluginEvents
  sessions: PluginSessions
  ai: PluginAi
  fs: PluginFs
  http: PluginHttp
  cron: PluginCron
  cli: PluginCli
  sidebar: PluginSidebar
  toast: PluginToast
  inbox: PluginInbox
  auth: PluginAuth
  recording: PluginRecording
  spend: PluginSpend
  // NOTE: `tts`, `sessionHistory` and `firebase` are deliberately ABSENT.
  //
  // All three are real capabilities, but they live on the WEBVIEW bridge only —
  // the host builds its backend context without them, so `ctx.tts` was
  // `undefined` and `await ctx.tts.isAvailable()` threw
  // `TypeError: Cannot read properties of undefined` at activation rather than
  // producing a permission error. Their permission rows exist for worker-host
  // bookkeeping; a row is not a namespace.
  //
  // Reach them from your webview through `AgentMC.tts` / `AgentMC.sessionHistory`
  // / `AgentMC.firebase` (see ./bridge.ts), and bridge to your backend with
  // `ctx.events` if the result has to cross surfaces.
  /**
   * NOT YET IMPLEMENTED BY THE HOST — see {@link WorkspaceApi}. Typed so a
   * plugin can be authored and packaged against it; every call currently
   * rejects at runtime, and both SDK mocks refuse to fake it.
   */
  workspace: WorkspaceApi
}
