/**
 * Vendored mirror of what the AMC host ACTUALLY validates and reads, so this
 * SDK cannot silently drift from it again.
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
  pluginTypes: 'src/shared/types/plugins.ts',
  storage: 'src/main/db/plugin-storage.ts',
  sessionBridge: 'src/main/services/plugin/plugin-session-bridge.ts',
  sessionHandler: 'src/main/ipc/plugin-bridge/session-handler.ts',
  sessionHistoryHandler: 'src/main/ipc/plugin-bridge/session-history-handler.ts',
  bridgeMethodSchemas: 'src/main/ipc/bridge-method-schemas.ts',
  responseSchemas: 'src/shared/plugin-bridge-response-schemas.ts',
  sessionStatusTypes: 'src/shared/types/session-status.ts',
  contextProvider: 'src/main/services/session-context/plugin-provider.ts',
} as const

/** Length bounds inside the `ui` block — `plugin-manifest-validator.ts:220-265`. */
export const HOST_UI_BOUNDS = {
  /** `entryPoint: z.string().min(1).max(500).optional()` — validator:221 */
  entryPointMax: 500,
  /** `sidebar.title` / `sidebar.icon`: `min(1).max(50)` — validator:222-227 */
  sidebarTitleMax: 50,
  sidebarIconMax: 50,
  /** `overlay.entryPoint`: `min(1).max(500)`, REQUIRED when `overlay` present — validator:228-232 */
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
 * Columns the host refuses inside a collection schema and inside a migration
 * operation — `types/plugins.ts:34-42`, enforced at `plugin-manifest-validator.ts:167-172`
 * and `:206-212`. It owns these three itself.
 */
export const HOST_RESERVED_COLUMNS = ['id', 'created_at', 'updated_at'] as const

/**
 * `migrations` is parsed, type-checked, retained on the registry entry — and
 * then NEVER executed. A repo-wide search for reads of `.migrations` in the
 * host returns zero consumers; the same search for `.collections` returns eight,
 * so the search itself is sound.
 *
 * What actually evolves a plugin's schema is an automatic ADD COLUMN sweep on a
 * version bump (`plugin-storage.ts:605-629`), whose own log line reads
 * "...without declared migrations. Falling back to ADD COLUMN sweep from manifest".
 */
export const HOST_EXECUTES_MIGRATIONS = false

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

/** `pendingAction` — `session-status.ts:209-239`; nullable. */
export const HOST_PENDING_ACTIONS = [
  'question',
  'plan_approval',
  'permission_request',
  'rate_limited',
  'api_error',
  'auth_error',
  'user_stopped',
  'subagent_timeout',
  'wait_timeout',
  'response_aborted',
  'recovery_failed',
  'mission',
  'suspended',
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

/**
 * `ctx.sessions.create` — `plugin-session-bridge.ts:95-110`.
 *
 * The host reads exactly these two keys. It has NEVER read `projectId`: the
 * project is always derived from the plugin's own virtual project
 * `__plugin_<id>__` (`plugin-session-bridge.ts:28-42`), so a caller-supplied
 * project silently did nothing.
 */
export const HOST_SESSION_CREATE_KEYS = ['prompt', 'userInitiated'] as const

/**
 * `AgentMC.session.create` — the WEBVIEW surface — reads only `prompt`.
 * `bridge-method-schemas.ts:197-199` is a non-strict zod tuple, so any extra
 * key (including `userInitiated`) is silently stripped before the handler runs.
 * Adding `userInitiated` to the webview type would swap one lie for another.
 */
export const HOST_BRIDGE_SESSION_CREATE_KEYS = ['prompt'] as const
