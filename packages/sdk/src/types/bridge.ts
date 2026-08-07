import type { PluginStorage, PluginDb, PluginSettings, PluginEvents, PluginSidebar, PluginToast, PluginAi, PluginInbox, PluginAuth, PluginRecording, SessionStatus, SessionPendingAction } from './context.js'

/**
 * Re-exported so a webview author can NAME the types they now receive.
 * `@agent-mc/plugin-sdk/browser` maps straight to this file, so a type declared
 * only in `./context.js` is unreachable from a webview — `BridgeSessionStatus`
 * would hand back a `status` whose type could not be written down.
 */
export type { SessionStatus, SessionPendingAction } from './context.js'

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
/**
 * The payload handed to an {@link BridgeEvents.onSessionStatus} subscriber.
 *
 * Only `sessionId` and `status` are dependable. The host broadcasts this from
 * roughly twenty different producers and validates the payload **advisory-only**
 * — a producer that omits a field logs a warning and the event is forwarded
 * anyway — so every other field is genuinely optional at runtime, whatever a
 * given producer happens to send.
 */
export interface BridgeSessionStatusEvent {
  sessionId: string
  status: SessionStatus
  previousStatus?: SessionStatus
  pendingAction?: SessionPendingAction | null
  /** Seconds the session has been actively working. */
  activeSeconds?: number
  statusChangedAt?: string
  snoozedUntil?: string | null
  recoveryTerminal?: boolean
  lastAgentMessageContent?: string | null
}

export interface BridgeEvents extends PluginEvents {
  /**
   * Subscribe to session status changes. Call the returned function to stop.
   *
   * ::: Two things this does NOT do :::
   *
   * **It is not scoped to your plugin.** Despite what earlier versions of this
   * comment claimed, the host broadcasts every session's status change to every
   * open subscriber — including sessions belonging to the user and to other
   * plugins. There is no ownership filter and no permission gate on this
   * channel. Filter on `sessionId` yourself against sessions you created.
   *
   * **It only fires in an overlay window.** The host sends this channel solely
   * to plugin overlay windows. The method exists in an in-panel plugin webview
   * because both surfaces share a preload, but nothing delivers the channel
   * there, so a subscription from a panel is silently never called. For a panel,
   * poll `AgentMC.session.getStatus()` instead.
   *
   * The backend's `ctx.sessions.onStatusChange(sessionId, handler)` is NOT the
   * same shape: it takes a session id, is ownership-checked, and hands the
   * handler a bare status string rather than this object.
   *
   * The parameter stays `unknown` on purpose. {@link BridgeSessionStatusEvent}
   * documents the shape the host sends, but the host validates that payload
   * advisory-only — a producer that sends the wrong thing logs a warning and the
   * event is forwarded regardless — so narrowing this to a struct would promise a
   * guarantee no code enforces. Narrow it yourself:
   *
   * ```ts
   * AgentMC.events.onSessionStatus((e) => {
   *   const { sessionId, status } = e as BridgeSessionStatusEvent
   *   if (sessionId !== mySessionId) return
   * })
   * ```
   */
  onSessionStatus(callback: (event: unknown) => void): () => void
}

/**
 * One open Document, minted by {@link BridgeDocuments.open} — the host's own
 * `DocumentHandle` (`plugin-bridge/document-handles.ts:71-77`).
 *
 * A Handle is a capability over exactly ONE file in exactly one mode, and it is
 * everything a plugin gets: the host deliberately does not send the file's path.
 */
export interface DocumentHandle {
  /** 16 CSPRNG bytes as hex — the host validates `/^[0-9a-f]{32}$/`. */
  id: string
  /** The file's base name, for display. Not a path. */
  name: string
  /**
   * The Document's length in bytes, LIVE as of the moment this Handle was
   * serialised — the host re-stats the file every time it hands one over
   * (`plugin-bridge/documents-handler.ts`). It is NOT the length captured when
   * the user picked the file.
   *
   * It still goes stale in your hands: the number froze when the call resolved,
   * and anything may write to the file afterwards. So never feed a `size` you
   * are holding into {@link BridgeDocuments.append}'s `expectedLength` — call
   * {@link BridgeDocuments.stat} first, every time. A stale length asks the host
   * to discard your own earlier saves, and it refuses.
   */
  size: number
  /** Fixed at mint. A `read` Handle can never be written — `append` refuses it. */
  mode: 'read' | 'readwrite'
  /**
   * An absolute loopback URL to hand straight to `fetch()`, pdf.js, or an
   * `<img src>`. OPAQUE — never parse it, never log it, never persist it.
   *
   * Two reasons, both load-bearing. Its path shape is not a contract: today it
   * is `http://127.0.0.1:<port>/plugin/<pluginId>/@doc/<handleId>`, and host
   * PR #2216 appends a capability TOKEN to that last segment — which also makes
   * the string a SECRET granting read access to the file, so anything that logs
   * it or ships it in a bug report leaks the Document. Treat it as write-only
   * into whatever consumes URLs.
   */
  url: string
}

/**
 * Read and append to files the user explicitly picked, on `AgentMC.documents`.
 *
 * ::: Webview-only, and unusually, permission-free :::
 *
 * There is no `ctx.documents` — the host assembles its backend context without
 * one, so this namespace lives on this surface alone. It also needs no manifest
 * permission: `documents` is self-gated, because the file picker IS the consent.
 * What a plugin gains is NARROWER than the ungated `fs` reach it already had, not
 * wider — one file, in one fixed mode, per user gesture.
 *
 * The whole namespace is a read path plus exactly ONE write, {@link append}.
 */
export interface BridgeDocuments {
  /**
   * Show the OS file picker and mint a Handle for each file the user chose.
   *
   * Resolves `[]` when they CANCEL — not a rejection. So `const [doc] = await
   * open(…)` leaves `doc` as `undefined` on cancel; check the length first.
   *
   * `options` is REQUIRED and so is `mode` — unlike `export.pickFolder`, calling
   * `open()` bare fails host validation (`bridge-method-schemas.ts:584-592`).
   * Ask for `read` unless you will genuinely write: the mode is frozen into
   * every Handle this call returns and cannot be widened afterwards.
   */
  open(options: {
    mode: 'read' | 'readwrite'
    title?: string
    filters?: { name: string; extensions: string[] }[]
    multiple?: boolean
  }): Promise<DocumentHandle[]>
  /**
   * The Handles this plugin still holds, with freshly re-stat'd sizes.
   *
   * Handles outlive a webview reload, so this is how a panel recovers them after
   * one — no need to re-prompt the user for a file they already picked.
   */
  list(): Promise<DocumentHandle[]>
  /**
   * The Document's CURRENT length — the number to pass as {@link append}'s
   * `expectedLength`.
   *
   * REJECTS on an unknown or closed Handle; it does not resolve `null`.
   */
  stat(handleId: string): Promise<{ length: number }>
  /**
   * Append bytes — the namespace's only write. Resolves the file's new length,
   * re-stat'd from disk, which is exactly the `expectedLength` for your next
   * call.
   *
   * **Always {@link stat} immediately before `append`.** `expectedLength` is a
   * compare-and-swap: the host refuses `shorter-than-expected` when the file is
   * shorter than you claim, and `discards-more-than-it-writes` when rewinding
   * would drop more than your payload replaces
   * (`plugin-bridge/document-append.ts:167-180`).
   *
   * **Mind the argument ORDER — `(handleId, base64, options)`.** Both leading
   * arguments are `string`, so transposing them is invisible to TypeScript and
   * no assertion in this SDK can catch it; the host simply rejects the id.
   *
   * `base64` must be standard base64 (NOT url-safe), non-empty, and a multiple
   * of 4 characters long. It is capped at the host's bridge-args budget minus
   * envelope headroom — 32 MiB less 4 KiB, so 33,550,336 characters, roughly
   * 24 MiB of decoded bytes. Chunk anything larger across successive calls.
   *
   * Two refusals worth designing around:
   * - A `read` Handle rejects `read-only-handle`; the mode is fixed at mint
   *   (`document-append.ts:102`).
   * - If the file was REPLACED on disk — which an ordinary Save in Preview or
   *   Word does, renaming a new inode over the path — the host rejects
   *   `not-the-picked-document` (`document-append.ts:156-158`). On the shipped
   *   host that Handle is finished: `stat` does NOT re-pin it, so recover by
   *   calling {@link open} again for a fresh gesture. Host PR #2216 adds a
   *   re-pin to `stat`; do not rely on it yet.
   */
  append(
    handleId: string,
    base64: string,
    options: { expectedLength: number }
  ): Promise<{ length: number }>
  /** Drop the Handle and its capability. The file itself is untouched. */
  close(handleId: string): Promise<void>
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
  documents: BridgeDocuments
}

declare global {
  interface Window {
    AgentMC: AgentMC
  }
}
