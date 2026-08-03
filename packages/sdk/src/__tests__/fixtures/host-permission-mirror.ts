// Checked-in mirror of the AMC host's plugin permission surface.
//
// SOURCE OF TRUTH (host repo): Agent Orchestrator
//   src/shared/plugin-permissions.ts — the `PluginPermission` union and the
//   exhaustive `PLUGIN_PERMISSION_INFO` consent map. That shared file is the ONE
//   definition; src/main/services/plugin/plugin-permission-map.ts re-exports the
//   union and maps bridge METHODS onto it, and the marketplace validator keeps a
//   hand-copy in firebase/marketplace/functions/src/types.ts (KNOWN_PERMISSIONS)
//   held in parity by the host's own guard test.
//
// The host consumes the *published* @agent-mc/plugin-sdk, so a runtime
// cross-import is impossible here (and would be circular). This vendored list
// lets the SDK's parity guard fail loudly when the two surfaces drift. When the
// host adds/removes a permission, update this mirror in the SAME change that
// updates the SDK enum, then reconcile the allow-lists below.
//
// Last reconciled: 2026-08-03 against src/shared/plugin-permissions.ts, by GENERATING
// the list from that file rather than hand-copying it (see HISTORY).
//
// HISTORY — why this file is worth distrusting. Between 2026-07-15 and
// 2026-07-27 this mirror claimed the host union was 14 permissions and that
// `firebase` was "an ungated browser namespace, not a host permission". Both
// were wrong: the host union was 19, and plugin-bridge-handler.ts hard-denies
// the `firebase` namespace without the `firebase` permission. Because the guard
// compares the SDK enum against THIS FILE, a wrong mirror and a wrong enum
// agreed with each other and the guard stayed green while four shipped host
// capabilities (`tts`, `sessions.readHistory`, `firebase`, `spend`) were
// unreachable from the public SDK. A local mirror can only catch drift it is
// itself reconciled against — so re-derive it from the host source when you
// touch it, never from this file's own prior reasoning.
//
// It happened AGAIN, within a week. By 2026-08-03 the host union had grown to 22
// while this mirror still claimed 19: `secrets` (shipped 2026-08-01, and the one
// advertised in Omniscio v0.1.90's release notes), `boards.read` and
// `sessions.launchAny`. `secrets` is now typed end-to-end; the other two are
// declared host-ahead below because inventing a `boards` ctx shape or a
// `sessions.fanout` signature nobody needs yet is precisely how the July mirror
// went wrong. This time the 22 strings were GENERATED from the host union rather
// than retyped, because the count assertion cannot catch a misspelling.

/** The exact permission strings the host recognizes and gates. */
export const HOST_PERMISSIONS = [
  'storage',
  'secrets',
  'sessions',
  'ai',
  'tts',
  'network',
  'cron',
  'cli',
  'notifications',
  'system',
  'rss',
  'auth',
  'auth.session',
  'sessions.readHistory',
  'boards.read',
  'sessions.launchAny',
  'inbox',
  'navigation',
  'chrome',
  'firebase',
  'recording',
  'spend',
] as const

// --- Documented known-deltas (intentional, tracked drift) -------------------

/**
 * Permissions the SDK exposes as a recognized string AHEAD of the host gating
 * any method against them. These are typed in the SDK (string + `ctx`
 * namespace) so an author can build against them, but the host does not yet
 * recognize the permission, so a real plugin's call is currently inert.
 *
 * Currently EMPTY. `recording` used to sit here on the belief that the host had
 * no `recording` permission; the host does carry it in its union and consent map
 * (as an explicitly documented gating stub), so it belongs in
 * BRIDGE_PENDING_PERMISSIONS below instead.
 */
export const SDK_AHEAD_PERMISSIONS = [] as const

/**
 * Permissions the HOST gates that the SDK does NOT yet expose to external
 * authors (host-ahead). These are recognized + consented by the host but have
 * no typed SDK `ctx` namespace, so a plugin built with this SDK cannot request
 * them. Tracked so the gap is named, not silently tolerated.
 *
 * - `boards.read`: gates the host's `boards` namespace and `assembleBoardContext`
 *   (plugin-bridge-handler.ts). No SDK `ctx.boards` type exists yet.
 * - `sessions.launchAny`: gates the `sessions.fanout` method on the EXISTING
 *   sessions namespace (plugin-permission-map.ts) — a method gap, not a namespace
 *   one. The host describes it as "Granted only to built-in plugins", so a
 *   third-party author cannot use it regardless.
 *
 * Both are listed rather than typed on purpose: guessing at a host runtime shape
 * is the exact mistake the HISTORY note above records.
 */
export const HOST_AHEAD_PERMISSIONS = ['boards.read', 'sessions.launchAny'] as const

/**
 * Permissions whose string is recognized+gated by BOTH sides, but whose backend
 * `ctx` namespace is NOT yet wired in the host — a call is currently inert /
 * rejects. Distinct from a permission-set gap: the manifest may declare it and
 * the consent dialog describes it, but the capability itself is pending.
 *
 * - `recording`: the host's own comment in plugin-permissions.ts calls this a
 *   "gating stub" — the consent dialog recognizes and describes it, but the
 *   `ctx.recording` namespace is not wired, so a call is inert. The SDK types
 *   the namespace so `recording-demo` compiles against the eventual shape.
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
