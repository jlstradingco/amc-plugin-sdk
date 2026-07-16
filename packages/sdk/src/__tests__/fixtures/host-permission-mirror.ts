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
// SOURCE OF TRUTH (host repo, current): the host moved the `PluginPermission`
// union into src/shared/plugin-permissions.ts (PLUGIN_PERMISSION_INFO keys);
// plugin-permission-map.ts re-exports it. Mirror that file's keys here.
//
// Last reconciled: 2026-07-14 with the paired host PR that recognizes the
// `recording` permission (host union: 16 permissions, incl. host-ahead
// `firebase`).

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
  'firebase',
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
 * Permissions the HOST gates that the SDK does NOT yet expose to external
 * authors (host-ahead). These are recognized + consented by the host but have
 * no typed SDK `ctx` namespace, so a plugin built with this SDK cannot request
 * them. Tracked so the gap is named, not silently tolerated.
 *
 * - `firebase`: the host enumerates the user's Firebase accounts / projects and
 *   starts a login. There is no SDK `ctx.firebase` namespace yet, so exposing
 *   the permission string alone would let a plugin declare a capability it can
 *   never actually call. Deferred to a future SDK PR that adds the namespace.
 */
export const HOST_AHEAD_PERMISSIONS = ['firebase'] as const

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
 * Type-shape deltas between the SDK's `PluginContext` and the host's runtime.
 * Recorded here so the guard test names any known drift rather than silently
 * tolerating an unbounded gap. Currently EMPTY — the two historical deltas were
 * resolved by the `fix(sdk): align PluginDb query/update types to host runtime`
 * change:
 *
 * - `QueryOptions.orderBy`: was SDK `string` (+ separate `order`) vs host
 *   `Record<string, 'asc' | 'desc'>` — SDK now matches the host object form.
 * - `PluginDb.update`: was SDK returning the updated row vs host returning
 *   `void` — SDK now returns `Promise<void>`.
 *
 * Append a new entry here (and bump the guard's expected count) only when a
 * fresh, deliberately-deferred type delta is introduced.
 */
export const KNOWN_TYPE_DELTAS = [] as const
