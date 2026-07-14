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
// Last reconciled: 2026-07-14 (host permission-map has 14 permissions, no `recording`).

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
] as const

// --- Documented known-deltas (intentional, tracked drift) -------------------

/**
 * Permissions the SDK exposes AHEAD of the host recognizing them. The SDK
 * declares the capability so plugin authors can target it, but the host does
 * not yet gate a matching bridge/namespace, so requesting it is currently inert.
 *
 * - `recording`: AMC has a screen-recorder service + `screen_recordings` table,
 *   but there is no plugin bridge/handler wired to it yet and the backend worker
 *   `ctx` has no `recording` namespace. Tracked for a future host PR.
 */
export const SDK_AHEAD_PERMISSIONS = ['recording'] as const

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
