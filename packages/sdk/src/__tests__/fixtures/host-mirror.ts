/**
 * Vendored mirror of what the AMC host ACTUALLY validates and reads — manifest
 * bounds AND session shapes — so this SDK cannot silently drift from it again.
 *
 * ## Provenance — read this before trusting anything here
 *
 * Every constant below was read out of the host's own source in
 * `Agent-Orchestrator`, pinned at `origin/master` **9a95c573fa (2026-08-06)**,
 * together with the host unit tests that lock each value.
 *
 * It was deliberately NOT taken from this SDK's mock or testing harness. The
 * dependency ledger's governing warning for the whole drift list is that the
 * SDK's mock implemented `ctx.events` as a real in-memory emitter, so plugin
 * unit tests passed for months while the production path was dead in both
 * directions — and the host's own contract document asserted the opposite of
 * the truth. **An SDK mock passing is not evidence that a host path works.**
 *
 * When you update this file, re-read the host source. Do not "fix" it to match
 * whatever this SDK currently does — that inverts the whole point.
 */

/** Host file:line citations, kept beside the values so a reader can re-verify. */
export const HOST_SOURCES = {
  manifestValidator:
    'src/main/services/plugin/plugin-manifest-validator.ts',
  storage: 'src/main/db/plugin-storage.ts',
  sessionBridge: 'src/main/services/plugin/plugin-session-bridge.ts',
  contextProvider: 'src/main/services/session-context/plugin-provider.ts',
} as const

/** Length bounds inside the `ui` block — `plugin-manifest-validator.ts:220-265`. */
export const HOST_UI_BOUNDS = {
  /**
   * `MANIFEST_ENTRY_PATH_MAX` in the host's shared/plugin-manifest-entry-path.ts, which owns every
   * entry-path bound now (vendored and pinned by host-entry-path-parity.test.ts).
   */
  entryPointMax: 500,
  /** `sidebar.title` / `sidebar.icon`: `min(1).max(50)` — validator:222-227 */
  sidebarTitleMax: 50,
  sidebarIconMax: 50,
  /** `overlay.entryPoint`: same entry-path rule, REQUIRED when `overlay` present */
  overlayEntryPointMax: 500,
  /** `sessions.contextTemplate`: `z.string().max(5000).optional()` — NOTE: no `.min(1)` — validator:246 */
  contextTemplateMax: 5000,
  /** `sessions.label`: `min(1).max(100)` — validator:247 */
  sessionsLabelMax: 100,
  /** `sessions.suggestedPrompts[].label` / `.prompt` — validator:251-254 */
  suggestedPromptLabelMax: 60,
  suggestedPromptTextMax: 2000,
  /** `PLUGIN_SUGGESTED_PROMPTS_MAX` — `types/plugins.ts:92` */
  suggestedPromptsMax: 4,
} as const

/**
 * Marketplace listing bounds on the `plugin` block, read from host master
 * **4d69ffac84 (2026-09-23)**: `plugin-manifest-validator.ts:18-19` (screenshots)
 * and `:206` (links). The marketplace server enforces the same two numbers in
 * `firebase/marketplace/functions/src/endpoints/upload-plugin.ts:100-101`
 * (`MAX_SCREENSHOTS` / `MAX_SCREENSHOT_URL_LEN`) — but it silently DROPS what
 * the host validator, and this SDK, reject.
 */
export const HOST_LISTING_BOUNDS = {
  /** `PLUGIN_SCREENSHOTS_MAX = 8` — validator:18, applied at validator:240-253 */
  screenshotsMax: 8,
  /**
   * ONE cap for every listing URL. The host spells it as two constants with one
   * value — `PLUGIN_SCREENSHOT_URL_MAX = 2048` (validator:19) and
   * `PLUGIN_LINK_URL_MAX = 2048` (validator:206) — and both refine on the host's
   * shared `isHttpUrl` (`src/shared/http-url.ts`), so a raise of either is a raise
   * of this number.
   */
  listingUrlMax: 2048,
  /** `links: z.object({ homepage, support, privacy, contact, repository })` — validator:267-273 */
  linkKeys: ['homepage', 'support', 'privacy', 'contact', 'repository'],
} as const

/**
 * The host's migration operation enum — `plugin-manifest-validator.ts:199`.
 *
 * `remove_column` / `remove_index` are NOT here and never were: they trace to a
 * stale design plan in the host repo
 * (`docs/superpowers/plans/2026-05-17-amc-plugin-sdk.md:196`). The shipped host
 * renamed `remove_index` -> `drop_index` and dropped `remove_column` entirely.
 */
export const HOST_MIGRATION_OPS = ['add_column', 'add_index', 'drop_index'] as const

/** Ops this SDK once advertised that the host has never accepted. */
export const HOST_REJECTED_MIGRATION_OPS = ['remove_column', 'remove_index'] as const

/**
 * Columns the host owns, and refuses inside BOTH a collection schema
 * (`plugin-manifest-validator.ts:167-172`) and a migration operation (`:206-212`)
 * — `types/plugins.ts:34-42`.
 *
 * This SDK enforces both halves — see `RESERVED_COLUMNS` in
 * ../../validators/manifest.ts.
 */
export const HOST_RESERVED_COLUMNS = ['id', 'created_at', 'updated_at'] as const

/**
 * The plugin-table fence (`agentWritable`), read from host LOCAL master **8d41f0cdf6
 * (2026-10-09)**. It is NOT on the host's GitHub master (checked at 0369c057eb, 2026-10-12): it
 * ships with the pending Omniscio plugin-table fence PR, so no released Omniscio honours it yet.
 * Re-verify `onGitHubMaster` before relying on it, and flip it in the change that sees it land.
 *
 * Meaning (`.claude/memory/contracts/plugin-command-trust-contract.md`): on a TABLE it opts the
 * table IN to control-server writes, which are otherwise refused 403 for every key; on a SETTING
 * it lets a control-server PATCH apply at once instead of waiting for the person's card.
 */
export const HOST_AGENT_WRITABLE = {
  sourceCommit: '8d41f0cdf61d7f19c76a1c88dcd00238f50c98a1',
  onGitHubMaster: false,
  /** `agentWritable: z.boolean().optional()` on a storage collection — validator:387 */
  collectionValidatorLine: 387,
  /** `agentWritable: z.boolean().optional()` on a settings entry — validator:331 */
  settingValidatorLine: 331,
  /** The refusal code — cli-server-plugin-storage.ts:34, sent at :186 */
  refusalCode: 'PLUGIN_COLLECTION_NOT_AGENT_WRITABLE',
} as const

/**
 * How the host pages `ctx.db.query`, read from GitHub master **05a1a59ab5 (2026-10-13)**,
 * `plugin-storage.ts:1112-1123` with `finitePageValue` at :224: `limit ?? 100`, truncated, a value
 * that is not a number falls back to 100, clamped to [1, 10000]; an offset only when it is truthy,
 * clamped to [0, 1000000]; no `orderBy` means `ORDER BY rowid ASC` (insertion order).
 */
export const HOST_DB_QUERY_PAGE = {
  sourceCommit: '05a1a59ab58ec1813770f7a167b64feb0c120052',
  onGitHubMaster: true,
  defaultLimit: 100,
  maxLimit: 10_000,
  maxOffset: 1_000_000,
} as const

/**
 * Every text the host rejects an `AgentMC.backend.invoke` with, at host master 8d41f0cdf6. The
 * host sends no error codes, so the command client classifies by these texts; this list is what
 * keeps that classification honest. `notDelivered` and `busy` fail BEFORE the call reaches a
 * handler (nothing ran). `ambiguous` may fail after the handler started — the client must say
 * the outcome is unknown.
 */
export const HOST_INVOKE_FAILURES = {
  notDelivered: [
    /** plugin-worker-host.ts:1466 — dispatchInvoke with no child process */
    'Plugin backend is not running',
    /** plugin-bridge-handler.ts:1224 — the `backend` case before the runtime is up */
    'plugin runtime is not ready',
    /** plugin-bridge-handler.ts:1228 — a UI-only or v1 plugin */
    'plugin "my-plugin" has no running backend to invoke',
    /** plugin-worker-entry-helpers.ts:827 — createRpcBridge dispatch, no handler for the method */
    "No backend handler registered for 'demo:cmd.start'",
  ],
  /** plugin-worker-host.ts:1471 — the per-plugin in-flight cap (MAX_INFLIGHT_INVOKES_PER_PLUGIN = 100) */
  busy: ['Too many in-flight backend calls (max 100)'],
  ambiguous: [
    /** plugin-worker-host.ts:1478 — INVOKE_DISPATCH_TIMEOUT_MS, 240 s */
    'Backend call timed out',
    /** plugin-worker-host.ts:1490 — drainPendingInvokeCalls on terminate or crash */
    'Plugin was stopped',
    /** plugin-worker-entry.ts:558 — the handler's return value could not be sent */
    'Plugin backend returned a non-serializable value',
    /** plugin-bridge-preload.ts:131 — the webview's 660 s backstop */
    'Plugin bridge call backend.invoke timed out after 660s',
  ],
} as const

/** `ALL_SESSION_STATUSES` — `session-status.ts:22-40`. */
export const HOST_SESSION_STATUSES = [
  'running',
  'needs_you',
  'error',
  'stalled',
  'starting',
  'ready',
  'terminating',
  'ended',
  'archived',
  'paused',
  'waiting',
] as const

/**
 * The three message-read surfaces, which return three DIFFERENT shapes. This is
 * the drift that made the SDK's own demo hedge `m.text ?? m.content ?? ''`.
 *
 * `textField` is the single most load-bearing entry: the worker calls it `text`,
 * both webview surfaces call it `content`.
 */
export const HOST_MESSAGE_SURFACES = {
  /** `ctx.sessions.getMessages` — `plugin-session-bridge.ts:138-152` */
  worker: {
    textField: 'text',
    filtersPartialRows: false,
    keepsSystemRows: true,
    closedRoleUnion: false,
    extractsText: false,
  },
  /** `AgentMC.session.getMessages` — `session-handler.ts:316-324` */
  webview: {
    textField: 'content',
    // The dependency ledger calls this surface "raw". It is not: it filters
    // `metadata.partial === true` at session-handler.ts:318. Only the worker
    // surface is genuinely unfiltered.
    filtersPartialRows: true,
    keepsSystemRows: true,
    closedRoleUnion: false,
    extractsText: false,
  },
  /** `ctx.sessionHistory.getMessages` — `session-history-handler.ts:160-167` */
  sessionHistory: {
    textField: 'content',
    filtersPartialRows: true,
    keepsSystemRows: false,
    closedRoleUnion: true,
    extractsText: true,
  },
} as const

