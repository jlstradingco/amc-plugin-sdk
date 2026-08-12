import type { PluginStorage, PluginDb, PluginSettings, PluginEvents, PluginSidebar, PluginToast, PluginAi, PluginInbox, PluginTts, PluginSessionHistory, PluginFirebase, PluginSpend, SessionStatus, SessionPendingAction } from './context.js'

/**
 * Re-exported so a webview author can NAME the types they now receive.
 * `@agent-mc/plugin-sdk/browser` maps straight to this file, so a type declared
 * only in `./context.js` is unreachable from a webview — `BridgeSessionStatus`
 * would hand back a `status` whose type could not be written down.
 */
export type { SessionStatus, SessionPendingAction } from './context.js'

/**
 * What `AgentMC.theme.get()` resolves to.
 *
 * `visualTheme` was declared here and has never existed. The real payload is
 * `{ mode, accent, surfaces }` — and note it is a STATIC PLACEHOLDER host-side:
 * `mode` is always `'dark'`, `accent` a fixed RGB triple, `surfaces` always
 * `{}`. Do not build on it expecting the user's real theme.
 */
export interface BridgeThemeValue {
  mode: string
  /** An `r,g,b` triple, e.g. `'139,92,246'`. */
  accent: string
  surfaces: Record<string, unknown>
}

export interface BridgeTheme {
  /**
   * Returns a PROMISE. This was typed synchronous, so `theme.get().mode` type
   * -checked and was `undefined` at runtime.
   */
  get(): Promise<BridgeThemeValue>
  /**
   * Subscribes to `plugin-theme-change` — a channel with NO emitter anywhere in
   * the host, so this callback never fires. Kept because the subscription is
   * real and harmless; do not wait on it.
   */
  onChange(callback: (theme: BridgeThemeValue) => void): () => void
}

/**
 * `AgentMC.ai` — same methods as the backend's `PluginAi`, with one real
 * difference the shared type was hiding.
 *
 * On THIS surface `generateMessage` can resolve `null`: the host's response
 * schema for it is `z.string().nullable()`, so a failed generation comes back
 * as `null` rather than a rejection. Typed as `Promise<string>`, the obvious
 * `(await ai.generateMessage(...)).trim()` was a crash waiting on a bad day.
 *
 * The backend path returns a plain string, which is why this is narrowed here
 * rather than widened for everyone.
 */
export interface BridgeAi extends Omit<PluginAi, 'generateMessage'> {
  /** `null` when generation failed — check before using it. */
  generateMessage(systemPrompt: string, userPrompt: string): Promise<string | null>
}

/**
 * `AgentMC.auth` — the webview's auth surface, which is ONE method.
 *
 * This is not `PluginAuth`. Earlier versions assigned the backend's six-method
 * `PluginAuth` here; none of those six exists on the bridge, so every one was a
 * `TypeError`. What the host actually exposes is a Firebase web-auth handoff so
 * a plugin webview can sign into the same identity AMC holds.
 *
 * Requires the `auth` permission. Throws a humanized error when AMC has no
 * cached identity.
 */
export interface BridgeAuth {
  getWebAuth(): Promise<{
    config: {
      apiKey: string
      authDomain: string
      projectId: string
      storageBucket: string
      messagingSenderId: string
      appId: string
    }
    customToken: string
    organizationId: string | null
  }>
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
   * (`plugin-bridge/session-handler.ts`, the `coalesceSpawn(key, …)` call keyed on
   * `hashPrompt`).
   */
  create(opts: {
    prompt?: string
    /**
     * The durable idempotency key. Re-sending the SAME id short-circuits to the
     * original `sessionId` instead of minting a SECOND PAID session, which is
     * what a retry-on-timeout or a bridge re-dispatch would otherwise do.
     *
     * The host has accepted this since F026 and the SDK omitted it, so the
     * documented replay protection was literally unreachable through typed SDK
     * code. Omitting it falls back to in-flight-only coalescing by prompt hash,
     * which does not survive a retry after the first call resolves.
     */
    clientRequestId?: string
  }): Promise<{ sessionId: string }>
  /** Resolves the new message id, or `{ resumed: true }` if it woke an idle session. */
  sendMessage(
    sessionId: string,
    opts: { text: string }
  ): Promise<{ messageId: string } | { resumed: true }>
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
   * composer — `plugin-bridge/session-handler.ts`'s `launchWithDraft` case reads all three keys.
   */
  launchWithDraft(opts: {
    projectId: string
    draftText: string
    autoSend?: boolean
  }): Promise<void>
  /**
   * Launch a session on a REAL project (not your plugin's virtual one), from a
   * prompt. Carries the same `clientRequestId` replay protection as
   * {@link create}.
   */
  launchBuild(opts: {
    projectId: string
    prompt: string
    clientRequestId?: string
  }): Promise<{ sessionId: string }>
  /** Re-attach a session your plugin launched but lost track of across a reload. */
  reregisterLaunched(sessionId: string): Promise<void>
  /** Accrued cost of one session, in USD. */
  getCost(sessionId: string): Promise<{ costUsd: number }>
}

/**
 * Save files and pick folders through the OS dialogs, on `AgentMC.export`.
 *
 * Permission-free: the native dialog IS the consent. But note that `pickFolder`
 * also SEEDS a per-plugin folder grant — `writeFiles`, `verifyFiles` and
 * `openFolder` are restricted to directories the user has picked, so call
 * `pickFolder` first rather than assembling a path yourself.
 *
 * Every method here previously returned `Promise<void>`, which threw away the
 * answer: `saveFile` and `savePdf` tell you whether the user CANCELLED,
 * `pickFolder` returns an object rather than a bare string, and `verifyFiles`
 * exists purely for its result.
 */
export interface BridgeExport {
  /** `type` is optional host-side. Resolves `{ saved: false }` if the user cancels. */
  saveFile(opts: {
    filename: string
    content: string
    type?: string
  }): Promise<{ saved: true; path: string } | { saved: false }>
  /**
   * NOTE THE CASING — `savePdf`, not `savePDF`. The mis-cased spelling this SDK
   * shipped resolved to nothing on `window.AgentMC`, so it was a `TypeError`.
   *
   * It also takes **`html`**, not `markdown`, and there is no `metadata` — the
   * host renders the HTML you give it. `preferCSSPageSize` and `landscape`
   * control the page setup.
   */
  savePdf(opts: {
    filename: string
    html: string
    preferCSSPageSize?: boolean
    landscape?: boolean
  }): Promise<{ saved: true; path: string } | { saved: false }>
  /** Resolves an OBJECT, not a bare path string. */
  pickFolder(opts?: {
    defaultPath?: string
    title?: string
  }): Promise<{ selected: true; path: string } | { selected: false }>
  /** 1-256 files. Resolves how many were written. */
  writeFiles(opts: {
    directory: string
    files: { name: string; content: string }[]
  }): Promise<{ written: number; directory: string }>
  /** The whole point is the result — `verified`, plus which files were `missing`. */
  verifyFiles(opts: {
    directory: string
    files: string[]
  }): Promise<{ verified: boolean; kickoffContent?: string; missing: string[] }>
  openFolder(opts: { path: string }): Promise<{ opened: true }>
  /** The host's default export folder. */
  getDefaultFolder(): Promise<{ path: string }>
}

export interface BridgeProject {
  /**
   * Rows are `{ id, projectId, name, color }`, plus `folderPath` ONLY when your
   * plugin holds the `sessions` permission — the host withholds the path
   * otherwise, which is why this stays `unknown[]`.
   */
  listAll(): Promise<unknown[]>
  /** The project the user is currently looking at, or `null`. */
  getActive(): Promise<unknown | null>
  findByFolder(folderPath: string): Promise<unknown | null>
  /**
   * `folderPath` must be your plugin's own virtual project
   * (`__plugin_<pluginId>__`) or a child of it — the host refuses anything else.
   */
  create(opts: { name: string; folderPath: string }): Promise<unknown>
  /** Both the options object and `preselectedFolder` are optional host-side. */
  openAddDialog(opts?: { preselectedFolder?: string }): Promise<unknown>
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
   * Unlike the backend's `ctx.events.on`, THIS surface really does hand back a
   * working unsubscribe — the preload wraps the host's `events.subscribe` /
   * `events.unsubscribe` pair. Call it to stop listening.
   */
  on(channel: string, handler: (data: unknown) => void): () => void
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
 * `DocumentHandle` (`plugin-bridge/document-handles.ts`, the `DocumentHandle` interface).
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
   * serialised — the host re-stats the file every time it hands one over, rather
   * than reporting the length captured when the user picked it
   * (`documents-handler.ts`, `currentLengthOr`). The one exception is a file that
   * can no longer be stat'd — moved or deleted since the pick, which `list()`
   * does not prune — where it falls back to that mint length.
   *
   * It still goes stale in your hands: the number froze when the call resolved,
   * and anything may write to the file afterwards. So never feed a `size` you
   * are holding into {@link BridgeDocuments.append}'s `expectedLength` — call
   * {@link BridgeDocuments.stat} first, every time.
   *
   * Being stale is NOT reliably an error, which is why this matters. The host
   * refuses only when the region you would discard is LARGER than the payload
   * you are writing (`document-append.ts`, the `shorter-than-expected` /
   * `discards-more-than-it-writes` bounds). A slightly stale length —
   * say you appended 50 bytes since, and now write 100 — passes that bound and
   * silently overwrites your own 50 bytes, logging `repairing …` and nothing
   * else. There is no error to catch; only calling `stat` first avoids it.
   */
  size: number
  /** Fixed at mint. A `read` Handle can never be written — `append` refuses it. */
  mode: 'read' | 'readwrite'
  /**
   * An absolute loopback URL for `fetch()` — hand the bytes on to pdf.js or a
   * Blob from there. OPAQUE: never parse it, never log it, never persist it.
   *
   * It is NOT usable as an `<img src>`, an `<iframe src>`, or any other direct
   * element source. The host serves every Document as `application/octet-stream`
   * with `X-Content-Type-Options: nosniff`, `Content-Disposition: attachment`,
   * `Cache-Control: no-store`, `Accept-Ranges: none` and a
   * `default-src 'none'; sandbox` CSP (`plugin-server.ts`,
   * `documentResponseHeaders`) — a deliberate choice, since a sniffed content
   * type would be attacker-influenced input. So it only works through
   * `fetch`/XHR.
   *
   * **This string is a SECRET.** The capability token is already shipped, not
   * forthcoming: the URL is
   * `http://127.0.0.1:<port>/plugin/<pluginId>/@doc/<handleId>.<capToken>`, and
   * that trailing token grants read access to the file. Anything that logs it or
   * puts it in a bug report leaks the Document. Its shape is not a contract
   * either, so never parse it.
   */
  url: string
}

/**
 * Read and append to files the user explicitly picked, on `AgentMC.documents`.
 *
 * ::: OFF BY DEFAULT — check before you build on this :::
 *
 * The entire namespace sits behind the host's `plugin-documents-io` unreleased
 * -feature flag. `requireDocumentsAccess()` runs before every method (and before
 * the `@doc` HTTP route), so on a stock AMC build EVERY call — including
 * `list()` — rejects with `This capability is not available.` Nothing in the
 * types can tell you that, and it is not a permission error you can fix from the
 * manifest. Confirm the flag is on for your target build first.
 *
 * ::: Webview-only, and unusually, permission-free :::
 *
 * There is no `ctx.documents` — the host assembles its backend context without
 * one, so this namespace lives on this surface alone. It also needs no manifest
 * permission: `documents` is in the host's `SELF_GATED_NAMESPACES` and appears
 * nowhere in `plugin-permissions.ts`, because the file picker IS the consent.
 * What a plugin gains is NARROWER than the ungated `fs` reach it already had,
 * not wider — one file, in one fixed mode, per user gesture.
 *
 * The whole namespace is a read path plus exactly ONE write, {@link append}.
 *
 * Refusals arrive as `documents.<method> [code]: prose`, and the code set is
 * wider than the few named below — `unknown-handle`, `protected-path`,
 * `not-a-file`, `file-too-large`, `too-many-handles`, `too-many-requests`,
 * `could-not-read`, `could-not-open`, `could-not-write`, `nothing-to-append`.
 */
export interface BridgeDocuments {
  /**
   * Show the OS file picker and mint a Handle for each file the user chose.
   *
   * Resolves `[]` when they CANCEL — not a rejection. So `const [doc] = await
   * open(…)` leaves `doc` as `undefined` on cancel; guard on `doc` before use.
   *
   * `options` is REQUIRED and so is `mode` — unlike `export.pickFolder`, calling
   * `open()` bare fails host validation (`bridge-method-schemas.ts`,
   * `DOCUMENTS_SCHEMAS.open`).
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
   * bounded compare-and-swap, NOT a strict one: the host refuses
   * `shorter-than-expected` when the file is shorter than you claim, and
   * `discards-more-than-it-writes` only when rewinding would drop MORE than your
   * payload replaces (`plugin-bridge/document-append.ts`, the two
   * `APPEND_REFUSAL` bounds). Inside that
   * bound it writes at `expectedLength` and overwrites whatever was there, with
   * only a `repairing …` line in the host log — so a slightly stale length loses
   * data silently rather than raising. The bound is deliberate: it is what lets a
   * plugin repair its own torn tail after a crash.
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
   *   (`document-append.ts`, the `read-only-handle` refusal).
   * - If the file was REPLACED on disk — which an ordinary Save in Preview or
   *   Word does, renaming a new inode over the path — `append` rejects
   *   `not-the-picked-document`. You can usually recover WITHOUT a fresh user
   *   gesture: {@link stat} re-pins the record's identity when it revalidates,
   *   so calling `stat` and retrying the append is the first thing to try. (An
   *   earlier version of this comment said `stat` does not re-pin and that the
   *   re-pin was unshipped; both were wrong.) Fall back to {@link open} only if
   *   `stat` also refuses.
   */
  append(
    handleId: string,
    base64: string,
    options: { expectedLength: number }
  ): Promise<{ length: number }>
  /** Drop the Handle and its capability. The file itself is untouched. */
  close(handleId: string): Promise<void>
}

/**
 * `window.AgentMC` — the surface a plugin WEBVIEW gets.
 *
 * This is a subset of what the host exposes, not the whole of it. The host's
 * preload carries roughly forty namespaces; the ones typed below are those with
 * a stable, documented contract. Notable untyped ones you can still reach at
 * runtime include `secrets`, `http`, `fs`, `shell`, `clipboard`, `process`,
 * `notifications`, `navigation`, `runtime`, `keybindings`, `tray`, `cron`,
 * `overlay`, `share`, `boards`, `host` and `backend.invoke`.
 *
 * `recording` is deliberately ABSENT: it exists on the backend (`ctx.recording`)
 * and has no webview counterpart at all, so the `AgentMC.recording` this
 * interface used to declare was `undefined` — a `TypeError`, not a bridge error.
 */
export interface AgentMC {
  storage: PluginStorage
  db: PluginDb
  settings: PluginSettings
  events: BridgeEvents
  theme: BridgeTheme
  toast: PluginToast
  session: BridgeSession
  ai: BridgeAi
  export: BridgeExport
  project: BridgeProject
  sidebar: PluginSidebar
  assets: BridgeAssets
  inbox: PluginInbox
  /** One method — see {@link BridgeAuth}. NOT the backend's `PluginAuth`. */
  auth: BridgeAuth
  documents: BridgeDocuments
  // These three are webview-ONLY — the host builds its backend context without
  // them, so they are reachable here and NOT via `ctx`. See the note on
  // `PluginContext` in ./context.ts.
  tts: PluginTts
  sessionHistory: PluginSessionHistory
  firebase: PluginFirebase
  spend: PluginSpend
}

declare global {
  interface Window {
    AgentMC: AgentMC
  }
}
