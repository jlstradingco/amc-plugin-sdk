export interface QueryOptions {
  where?: Record<string, unknown>
  orderBy?: Record<string, 'asc' | 'desc'>
  limit?: number
  offset?: number
}

export interface SidebarItem {
  id: string
  title: string
  status?: string
  needsYou?: boolean
  progress?: number
  currentStep?: number
  totalSteps?: number
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
  on(channel: string, handler: (data: unknown) => void): () => void
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

export interface PluginCron {
  register(id: string, schedule: string, handler: () => Promise<void>): void
  unregister(id: string): void
  isRegistered(id: string): boolean
}

export interface PluginCli {
  handle(path: string, handler: CliHandler): void
  removeHandler(path: string): void
}

export interface PluginSidebar {
  setBadge(count: number): void
  setItems(items: SidebarItem[]): void
}

export interface PluginToast {
  show(opts: { type: 'success' | 'error' | 'info'; message: string }): void
  notify(opts: { title: string; body: string }): void
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

export interface InboxItem {
  id: string
  title: string
  body?: string
  icon?: string
  priority?: 'low' | 'normal' | 'high'
  actionLabel?: string
  actionId?: string
  timestamp?: string
}

export interface PluginInbox {
  setItems(items: InboxItem[]): Promise<void>
}

export interface RecordingHandle {
  recordingId: string
}

export interface Recording {
  id: string
  filename: string
  durationMs: number
  createdAt: string
  sizeBytes: number
}

export interface PluginRecording {
  start(options?: { source?: 'screen' | 'window' | 'tab' }): Promise<RecordingHandle>
  stop(handle: RecordingHandle): Promise<{ recordingId: string }>
  list(): Promise<Recording[]>
  getShareUrl(recordingId: string): Promise<string>
  delete(recordingId: string): Promise<void>
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
  status: string
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
  /** The real out-of-pocket slice of `backgroundTotal` (billed to a real API key). */
  outOfPocket: number
}

/** One engine's coding line in the yesterday drill-down. */
export interface SpendEngineLine {
  engine: string
  value: number
  sessions: number
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
  /** Parsed from the `label`'s `-<TS>` suffix when present, else `null`. */
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

/**
 * Polled state of one `exec()` job, as returned by `execStatus()`.
 *
 * - `chunk` is console output produced since the `since` cursor passed in, not
 *   the whole run's output to date.
 * - `truncated` is true once the on-disk cap for this job's output is hit; the
 *   head and tail are retained and the middle is dropped.
 * - `'idle-timeout'` reflects that exec has no wall-clock cap — a run is only
 *   killed after a period of no output, so a legitimately slow suite is not
 *   killed at the same threshold as a deadlocked one.
 */
export interface WorkspaceExecStatus {
  state: 'running' | 'exited' | 'cancelled' | 'idle-timeout'
  exitCode: number | null
  chunk: string
  cursor: number
  truncated: boolean
}

/**
 * A CURSOR read of one `exec()` job's JSONL results stream, as returned by
 * `execResults()` — not a whole-artifact read. There is deliberately no
 * `execArtifact`: no end-of-run blob survives an interrupted run, so a cursor
 * read is the only durable read that exists.
 *
 * - `lines` holds whole JSONL records only. A partial trailing line is held
 *   back host-side until it completes — you will never see one here.
 */
export interface WorkspaceExecResults {
  lines: string[]
  cursor: number
  truncated: boolean
}

/**
 * A user-approved binding of a base command to one (project, package) pair, as
 * returned by `listBindings()`. There is no setter for this type anywhere in
 * `WorkspaceApi` — see `WorkspaceApi.requestBinding()`.
 */
export interface WorkspaceBinding {
  /** Relative to the project root. `''` means the root package. */
  packagePath: string
  /** The user's own, verbatim base command text, e.g. `'npm test'`. */
  baseCommand: string
  /** User override of the auto-detected runner adapter; `null` when
   *  auto-detection applies. */
  adapterOverride: string | null
  /** Recomputed whenever `baseCommand`, the resolved adapter, or the plugin
   *  version changes; downstream caches key on it, so a rebind invalidates
   *  them implicitly. */
  bindingHash: string
  acceptedAt: string
}

/** Outcome of `WorkspaceApi.requestBinding()`. */
export type WorkspaceBindingResult =
  | { accepted: true; binding: WorkspaceBinding }
  | { accepted: false }

/**
 * Read, write, and run test/build commands against the user's real project
 * checkouts and worktrees, scoped per project by a runtime grant the user makes
 * (and can revoke) independently of the install-time permission below; a
 * worktree inherits its project's grant.
 *
 * **NOT YET IMPLEMENTED BY THE HOST.** No host-side `workspace` namespace exists
 * on any branch as of 2026-08-04 (host `master@9c21044ee0`) — every method on
 * this interface currently rejects at runtime with `Unknown namespace:
 * "workspace"`. Declaring `workspace.*` permissions in a manifest and passing
 * `amc-plugin preflight` validates SHAPE only; neither is evidence the host
 * supports this capability yet.
 *
 * Gated by three hierarchical permissions, split per method group below:
 * `workspace.read`, `workspace.write` (implies read), `workspace.exec`.
 * Discovery methods need none of the three beyond holding any `workspace.*`
 * permission at all — without them the plugin cannot construct its first handle.
 *
 * Transcribed from "The interface" in `docs/spec/01-capabilities.md`, which
 * remains the source of truth if this file and that document ever disagree.
 *
 * Three contracts matter most and none of them are visible in the signatures:
 *
 * - In `exec()`, a list-valued entry in `vars` expands to N argv entries
 *   host-side — or ZERO entries when the list is empty. Values are never
 *   concatenated into a shell string; there is no shell.
 * - `execResults` is a CURSOR read of a JSONL stream, not a whole-artifact
 *   read. `lines` holds whole JSONL records only, never a partial line. There
 *   is deliberately no `execArtifact`: no end-of-run blob survives an
 *   interrupted run, so the cursor read is the only durable read that exists.
 * - There is deliberately NO method anywhere on this interface that writes,
 *   sets, or creates a command binding — `requestBinding` itself carries no
 *   command text, not at exec time and not even as a suggested default. The
 *   user binds a base command to a (project, package) pair by editing the
 *   host's own proposal, and the host appends the slot's manifest-static args
 *   at exec time. This is what closes command injection by construction:
 *   there is no plugin-supplied string for anything to inject into.
 */
export interface WorkspaceApi {
  // ── discovery — no permission beyond holding any workspace.* ──
  /** Projects this plugin currently holds a runtime grant for. */
  listProjects(): Promise<Array<{ projectId: string; name: string }>>
  /** Blocking and live — reflects the filesystem and running sessions at call
   *  time, not a cached snapshot. */
  listWorktrees(projectId: string): Promise<WorktreeInfo[]>
  /** Opens the host's project-grant picker. Resolves with the resulting set of
   *  projects this plugin can reach, unchanged if the user declines. */
  requestAccess(): Promise<Array<{ projectId: string; name: string }>>
  /** The only door an absolute path enters by. `null` when the path falls
   *  outside every project and worktree this plugin can currently reach. */
  resolve(absolutePath: string): Promise<WorkspaceHandle | null>

  // ── workspace.read ──
  glob(
    s: WorkspaceScope,
    patterns: string[],
    o?: WorkspaceGlobOpts
  ): Promise<WorkspaceEntry[]>
  stat(h: WorkspaceHandle): Promise<WorkspaceEntry | null>
  exists(h: WorkspaceHandle): Promise<boolean>
  /** `encoding` is reserved for future binary support; unused in v1, which is
   *  UTF-8 text only. If passed, `'utf-8'` is the only legal value. */
  readFile(h: WorkspaceHandle, o?: { encoding?: 'utf-8' }): Promise<string>
  /** Chunked host-side at 500 files / ~4.8 MB per call — a large batch takes
   *  several round trips transparently, well inside the 240 s RPC timeout. */
  readFiles(
    hs: WorkspaceHandle[]
  ): Promise<Array<{ handle: WorkspaceHandle } & ({ content: string } | { error: string })>>
  /** No setter for this type exists anywhere in this API — see `requestBinding()`. */
  listBindings(s: WorkspaceScope): Promise<WorkspaceBinding[]>

  // ── workspace.write (implies read) ──
  /**
   * `expectedMtimeMs` is a required compare-and-swap token: `null` means the
   * file must NOT already exist. It closes both torn writes and lost updates,
   * and costs nothing to obtain because `glob()` already returned it.
   * `encoding` is reserved for future binary support and unused in v1 (UTF-8
   * text only).
   */
  writeFile(
    h: WorkspaceHandle,
    content: string,
    o: { expectedMtimeMs: number | null; encoding?: 'utf-8' }
  ): Promise<{ mtimeMs: number }>
  /** `expectedMtimeMs` is the same required compare-and-swap token as
   *  `writeFile` — it must match the file's current `mtimeMs` or this rejects. */
  deleteFile(h: WorkspaceHandle, o: { expectedMtimeMs: number }): Promise<void>

  // ── workspace.exec ──
  /** Carries NO command text — not even as a suggested default. The host reads
   *  the package's own `test` script and shows that as the editable proposal
   *  in its own modal; the plugin supplies nothing beyond which package to bind. */
  requestBinding(s: WorkspaceScope, packagePath: string): Promise<WorkspaceBindingResult>
  /**
   * Runs a manifest-declared command slot for this scope. The host allows at
   * most one running job per (project, worktree); calling this again on the
   * same scope before the prior job finishes or is cancelled rejects host-side.
   *
   * A list-valued entry in `vars` expands to N argv entries host-side, or ZERO
   * when the list is empty — values are never concatenated into a shell
   * string. Host-reserved placeholders in the slot's arg template (e.g.
   * `{outFile}`) are substituted by the host itself and never sourced from
   * `vars`.
   */
  exec(
    s: WorkspaceScope,
    slot: string,
    vars?: Record<string, string | string[]>
  ): Promise<{ jobId: string }>
  execStatus(jobId: string, o?: { since?: number }): Promise<WorkspaceExecStatus>
  /** A cursor read, not a whole-artifact read — see `WorkspaceExecResults`. */
  execResults(jobId: string, o?: { since?: number }): Promise<WorkspaceExecResults>
  execCancel(jobId: string): Promise<void>
}

export interface PluginContext {
  pluginId: string
  pluginVersion: string
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
  tts: PluginTts
  sessionHistory: PluginSessionHistory
  firebase: PluginFirebase
  spend: PluginSpend
  /**
   * NOT YET IMPLEMENTED BY THE HOST — see {@link WorkspaceApi}. Typed so a
   * plugin can be authored and packaged against it; every call currently
   * rejects at runtime, and both SDK mocks refuse to fake it.
   */
  workspace: WorkspaceApi
}
