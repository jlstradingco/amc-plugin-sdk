// Checked-in mirror of the AMC host's plugin permission surface.
//
// SOURCE OF TRUTH (host repo): Agent Orchestrator
//   src/main/services/plugin/plugin-permission-map.ts — the `PluginPermission`
//   union + PERMISSION_MAP / PERMISSION_DESCRIPTIONS keys.
//
// The host consumes the *published* @agent-mc/plugin-sdk, so a runtime
// cross-import is impossible here (and would be circular). This vendored list
// lets the SDK's parity guard fail loudly when the two surfaces drift. When the
// host adds/removes a permission, update this mirror in the SAME change that
// updates the SDK enum, then reconcile the allow-lists below.
//
// Last reconciled: 2026-07-14 with the paired host PR that recognizes the
// `recording` permission (host permission-map union: 15 permissions).

/** The exact permission strings the host recognizes and gates. */
export const HOST_PERMISSIONS = [
  'storage',
  'sessions',
  'ai',
  'network',
  'cron',
  'cli',
  'notifications',
  'system',
  'rss',
  'auth',
  'auth.session',
  'inbox',
  'navigation',
  'chrome',
  'recording',
] as const

// --- Documented known-deltas (intentional, tracked drift) -------------------

/**
 * Permissions the SDK exposes as a recognized string AHEAD of the host gating
 * any method against them. Currently empty: `recording` graduated to a
 * host-recognized permission in the paired host PR, so the permission SETS are
 * in full parity. Its RUNTIME bridge is still pending (see BRIDGE_PENDING), but
 * that is a namespace-wiring gap, not a permission-set gap.
 */
export const SDK_AHEAD_PERMISSIONS = [] as const

/**
 * Permissions whose string is recognized+gated by both sides, but whose backend
 * `ctx` namespace is NOT yet wired in the host — a call is currently inert /
 * rejects. Distinct from a permission-set gap: the manifest may declare it and
 * the consent dialog describes it, but the capability itself is pending.
 *
 * - `recording`: AMC has a screen-recorder service + `screen_recordings` table,
 *   but the backend worker `ctx` exposes no `recording` namespace yet. Tracked
 *   for a future host PR that wires the bridge.
 */
export const BRIDGE_PENDING_PERMISSIONS = ['recording'] as const

/**
 * Type-shape deltas between the SDK's `PluginContext` and the host's runtime,
 * deferred to their own breaking-change PR (see the overhaul backlog, PR "type
 * parity"). Recorded here so the guard test documents them rather than silently
 * tolerating an unbounded gap:
 *
 * - `QueryOptions.orderBy`: SDK types it as `string` (+ separate `order`), the
 *   host's `collectionQuery` expects `Record<string, 'asc' | 'desc'>`.
 * - `PluginDb.update`: SDK returns the updated row, the host's
 *   `collectionUpdate` returns `void`.
 */
export const KNOWN_TYPE_DELTAS = [
  'QueryOptions.orderBy: SDK string+order vs host Record<string,"asc"|"desc">',
  'PluginDb.update: SDK returns row vs host returns void',
] as const
