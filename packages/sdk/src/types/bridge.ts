import type { PluginStorage, PluginDb, PluginSettings, PluginEvents, PluginSidebar, PluginToast, PluginAi, PluginInbox, PluginAuth, PluginRecording, SessionStatus, SessionPendingAction } from './context.js'

export interface BridgeTheme {
  get(): { mode: string; visualTheme: string }
  onChange(callback: (theme: { mode: string; visualTheme: string }) => void): () => void
}

/**
 * One message from `AgentMC.session.getMessages()` — the WEBVIEW shape.
 *
 * The body field is called `content` here, where the backend's
 * `ctx.sessions.getMessages()` calls it `text`. Same underlying row, two field
 * names, depending on which surface you asked from.
 */
export interface BridgeSessionMessage {
  id: string
  /**
   * `'user'` for operator turns, `'assistant'` for agent turns, otherwise the
   * host's raw source. `system` rows are NOT filtered out on this surface.
   */
  role: 'user' | 'assistant' | 'system' | (string & {})
  /** The message body. Raw: tool calls and tool output are NOT stripped here. */
  content: string
  timestamp: string
}

/** What `AgentMC.session.getStatus()` resolves to — an object, not a bare string. */
export interface BridgeSessionStatus {
  status: SessionStatus
  /** `null` unless the session is waiting on something. */
  pendingAction: SessionPendingAction | null
}

export interface BridgeSession {
  /**
   * Create a session on your plugin's own virtual project.
   *
   * `prompt` is the only option this surface reads. The backend's
   * `ctx.sessions.create` additionally takes `userInitiated`, but the host
   * strips unknown keys here before the handler sees them, so passing it from a
   * webview would silently do nothing — hence its absence.
   *
   * Concurrent calls with an identical prompt are de-duplicated host-side and
   * resolve to the SAME `sessionId` — the in-flight key is the prompt hash
   * (`plugin-bridge/session-handler.ts:284-287`).
   */
  create(opts: { prompt?: string }): Promise<{ sessionId: string }>
  sendMessage(sessionId: string, opts: { text: string }): Promise<void>
  /**
   * The transcript, with still-streaming rows dropped.
   *
   * `system` rows ARE included and the body is raw — tool calls and tool output
   * are not stripped. For a cleaned, user/assistant-only transcript use
   * `ctx.sessionHistory.getMessages()` on the backend instead.
   */
  getMessages(sessionId: string): Promise<BridgeSessionMessage[]>
  /**
   * Resolves `{ status, pendingAction }` — an OBJECT.
   *
   * The backend's `ctx.sessions.getStatus` resolves a bare string for the same
   * method name. Comparing this result directly to a string (`status ===
   * 'ended'`) is always false and is a mistake this type now catches at compile
   * time; read `.status` instead.
   */
  getStatus(sessionId: string): Promise<BridgeSessionStatus>
  rename(sessionId: string, name: string): Promise<void>
  stop(sessionId: string): Promise<void>
  /**
   * `autoSend` submits the draft immediately instead of leaving it in the
   * composer — `plugin-bridge/session-handler.ts:366-377` reads all three keys.
   */
  launchWithDraft(opts: {
    projectId: string
    draftText: string
    autoSend?: boolean
  }): Promise<void>
}

export interface BridgeExport {
  saveFile(opts: { filename: string; content: string; type: string }): Promise<void>
  savePDF(opts: { filename: string; markdown: string; metadata?: Record<string, unknown> }): Promise<void>
  pickFolder(opts?: { defaultPath?: string; title?: string }): Promise<string>
  writeFiles(opts: { directory: string; files: { name: string; content: string }[] }): Promise<void>
  verifyFiles(opts: { directory: string; files: string[] }): Promise<void>
  openFolder(opts: { path: string }): Promise<void>
}

export interface BridgeProject {
  listAll(): Promise<unknown[]>
  findByFolder(folderPath: string): Promise<unknown | null>
  create(opts: { name: string; folderPath: string }): Promise<unknown>
  openAddDialog(opts: { preselectedFolder: string }): Promise<unknown>
}

export interface BridgeAssets {
  readFile(path: string): Promise<string>
  listFiles(path: string): Promise<string[]>
}

/**
 * The renderer half of your plugin's event bus, on `AgentMC.events`.
 *
 * `emit` and `on` are exactly `PluginEvents`, so one bus spans both of your
 * plugin's surfaces and a channel means the same thing on either side. The host
 * conforms to this deliberately: its renderer bridge declares `emit` as `void`
 * *because* the SDK does. Extending rather than re-declaring is what makes that
 * shared half impossible to drift.
 *
 * How delivery works, and its limits — enforced by the host, not by this type:
 * - An `emit` fans out to BOTH surfaces: your webview subscribers and your
 *   backend worker's `ctx.events.on`. Delivery is self-inclusive, like any
 *   pub/sub — the surface that emitted also receives, if it subscribed to that
 *   channel. Re-emitting from your own handler therefore loops; that is yours to
 *   avoid, the host does not guard it.
 * - `emit` is fire-and-forget. It returns nothing and tells you nothing about
 *   whether anyone was listening, and a failure surfaces only in your devtools
 *   console — not as a thrown error you can catch.
 * - Everything is scoped to your own plugin. You cannot reach, or be reached by,
 *   another plugin's channels.
 * - Payloads must survive JSON: a `Date` arrives as an ISO string, `undefined`
 *   object properties are dropped, and a `Map` or `Set` arrives as `{}`.
 * - A channel name is capped at 200 characters and a payload at 1 MiB. Over
 *   either, the emit fails silently per the previous point.
 * - You may hold at most 200 live subscriptions at once.
 */
export interface BridgeEvents extends PluginEvents {
  /** Listen for status changes on sessions your plugin launched. Call the returned function to stop. */
  onSessionStatus(callback: (event: unknown) => void): () => void
}

export interface AgentMC {
  storage: PluginStorage
  db: PluginDb
  settings: PluginSettings
  events: BridgeEvents
  theme: BridgeTheme
  toast: PluginToast
  session: BridgeSession
  ai: PluginAi
  export: BridgeExport
  project: BridgeProject
  sidebar: PluginSidebar
  assets: BridgeAssets
  inbox: PluginInbox
  auth: PluginAuth
  recording: PluginRecording
}

declare global {
  interface Window {
    AgentMC: AgentMC
  }
}
