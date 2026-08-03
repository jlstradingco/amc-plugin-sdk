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

export interface PluginSessions {
  create(opts: { prompt?: string; projectId?: string }): Promise<{ sessionId: string }>
  sendMessage(sessionId: string, text: string): Promise<void>
  getStatus(sessionId: string): Promise<string>
  getMessages(sessionId: string): Promise<unknown[]>
  stop(sessionId: string): Promise<void>
  onStatusChange(sessionId: string, handler: (status: string) => void): () => void
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

/** One text-only turn of a granted session. */
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

export interface PluginContext {
  pluginId: string
  pluginVersion: string
  dataDir: string
  storage: PluginStorage
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
}
