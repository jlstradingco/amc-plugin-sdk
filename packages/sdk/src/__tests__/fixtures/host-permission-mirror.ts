// Checked-in mirror of the AMC host's plugin permission surface.
//
// SOURCE OF TRUTH (host repo): Agent Orchestrator
//   src/main/services/plugin/plugin-permission-map.ts — the `PluginPermission`
//   union + PERMISSION_MAP / PERMISSION_DESCRIPTIONS keys. That file is the ONLY
//   place the host enumerates gated permissions. (`src/main/ipc/plugin-
//   permissions.ts` merely resolves whatever strings a manifest/registry entry
//   declares; it does not define or enum-enforce the set.)
//
// The host consumes the *published* @agent-mc/plugin-sdk, so a runtime
// cross-import is impossible here (and would be circular). This vendored list
// lets the SDK's parity guard fail loudly when the two surfaces drift. When the
// host adds/removes a permission, update this mirror in the SAME change that
// updates the SDK enum, then reconcile the allow-lists below.
//
// Last reconciled: 2026-07-27 against the real host `plugin-permission-map.ts`.
// The host union is 15 permissions (added `tts` — read-aloud, gated via the
// `tts.synthesize` / `tts.isAvailable` methods). Two strings previously listed here as
// host-recognized — `firebase` and `recording` — are NOT host permissions:
//   - `firebase`: the host delivers it as an UNGATED browser namespace
//     (`AgentMC.firebase` in plugin-bridge-preload.ts → plugin-bridge-handler's
//     `case 'firebase'`), with no PERMISSION_MAP entry and no consent gate. It
//     is a capability the host exposes without a permission, so it does not
//     belong in the permission mirror at all. (A future SDK PR could add a
//     browser-only `AgentMC.firebase` *type* — no permission string — if we
//     want to type that surface for authors.)
//   - `recording`: the host has a general screen-recorder service but exposes
//     NO plugin `ctx`/bridge namespace and does NOT gate a `recording`
//     permission. The SDK is ahead here (it exposes the string + typed
//     namespace), so `recording` is tracked below as SDK-ahead — matching the
//     `recording-demo` example, which docs describe as a forward-looking
//     scaffold whose calls are currently inert.

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
  'tts',
] as const

// --- Documented known-deltas (intentional, tracked drift) -------------------

/**
 * Permissions the SDK exposes as a recognized string AHEAD of the host gating
 * any method against them. These are typed in the SDK (string + `ctx`
 * namespace) so an author can build against them, but the host does not yet
 * recognize the permission, so a real plugin's call is currently inert.
 *
 * - `recording`: the SDK exposes the `recording` permission + a typed
 *   `PluginRecording` namespace (start/stop/list/getShareUrl/delete). The host
 *   has a screen-recorder service but wires NO plugin bridge for it and does
 *   not gate a `recording` permission. The `recording-demo` example is the
 *   forward-looking scaffold for when the host catches up.
 */
export const SDK_AHEAD_PERMISSIONS = ['recording'] as const

/**
 * Permissions the HOST gates that the SDK does NOT yet expose to external
 * authors (host-ahead). These are recognized + consented by the host but have
 * no typed SDK `ctx` namespace, so a plugin built with this SDK cannot request
 * them. Tracked so the gap is named, not silently tolerated.
 *
 * Currently EMPTY: the host's 14-permission union is fully covered by the SDK.
 * (`firebase` was previously listed here, but it is an ungated browser
 * namespace on the host, not a gated permission — see the header note.)
 */
export const HOST_AHEAD_PERMISSIONS = [] as const

/**
 * Permissions whose string is recognized+gated by BOTH sides, but whose backend
 * `ctx` namespace is NOT yet wired in the host — a call is currently inert /
 * rejects. Distinct from a permission-set gap: the manifest may declare it and
 * the consent dialog describes it, but the capability itself is pending.
 *
 * Currently EMPTY. `recording` was previously listed here, but the host does
 * not recognize a `recording` permission at all (no union entry, no consent
 * description), so it is an SDK-ahead permission (above), not a both-sides
 * bridge-pending one.
 */
export const BRIDGE_PENDING_PERMISSIONS = [] as const

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
