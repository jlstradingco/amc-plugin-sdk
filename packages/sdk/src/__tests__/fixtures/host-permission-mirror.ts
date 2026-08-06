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
// ─────────────────────────────────────────────────────────────────────────────
// LAST RECONCILED: 2026-08-04, against host commit `master@9c21044ee0`
// (committed 2026-08-03T23:38:01-04:00), by GENERATING the 26 strings from
// src/shared/plugin-permissions.ts rather than hand-copying them:
//
//   sed -n '10,36p' src/shared/plugin-permissions.ts | grep -oE "'[^']+'"
//
// The commit SHA is recorded so the NEXT reconciliation can `git diff` that one
// file between SHAs instead of re-reading 200 lines and eyeballing the delta.
// ─────────────────────────────────────────────────────────────────────────────
//
// HISTORY — why this file is worth distrusting. It has now gone stale THREE
// times, twice within a fortnight, and each recurrence was found only because
// somebody happened to look:
//
//  1. 2026-07-15..27 — claimed 14 while the host union was 19, and claimed
//     `firebase` was "an ungated browser namespace, not a host permission".
//     Both wrong; plugin-bridge-handler.ts hard-denies `firebase` without the
//     permission. Four shipped host capabilities (`tts`, `sessions.readHistory`,
//     `firebase`, `spend`) were unreachable from the public SDK.
//  2. 2026-08-03 — claimed 19 while the host held 22. Missing: `secrets`
//     (shipped 2026-08-01 and advertised in Omniscio v0.1.90), `boards.read`,
//     `sessions.launchAny`.
//  3. 2026-08-04 (this change) — claimed 22 while the host held 26. Missing:
//     `launch`, `coreRead`, `oauth`, `channel` — all four Tier-1 `elevated`.
//
// The mechanism that keeps failing: the parity assertions compare the SDK enum
// against THIS FILE, so a wrong mirror and a wrong enum agree with each other
// and the suite stays green. The pinned count below cannot save you either —
// it is itself part of what goes stale, and it cannot catch a misspelling.
//
// THE RULE: re-derive from the host source when you touch this file, never from
// this file's own prior reasoning, and never by retyping. Generate it.

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
  'launch',
  'firebase',
  'recording',
  'spend',
  'coreRead',
  'oauth',
  'channel',
] as const

// --- Documented known-deltas (intentional, tracked drift) -------------------

/**
 * Permissions the SDK exposes as a recognized string AHEAD of the host gating
 * any method against them. These are typed in the SDK (string + `ctx`
 * namespace) so an author can build against them, but the host does not yet
 * recognize the permission, so a real plugin's call is currently inert.
 *
 * - `workspace.read` / `workspace.write` / `workspace.exec`: the `ctx.workspace`
 *   capability — read/write/exec against the user's real project checkouts and
 *   worktrees. Specified in the Test Tracker spec (docs/spec/01-capabilities.md,
 *   09-dependencies.md §B1) and typed here so `amc-plugin package` accepts a
 *   manifest requesting them. **No host implementation exists.** As of host
 *   `master@9c21044ee0` there is no `workspace` entry in the host union, no
 *   `'workspace'` key in NAMESPACE_PERMISSION (plugin-bridge-handler.ts), and no
 *   WORKSPACE_SCHEMAS in bridge-method-schemas.ts — verified across all 80 local
 *   and remote branch tips. Every call rejects with
 *   `Unknown namespace: "workspace"`.
 *
 *   Typing them is a deliberate exception to the "never invent a host runtime
 *   shape" rule below, and it is bounded: the shape is transcribed from a
 *   written, reviewed spec rather than guessed, and both SDK mocks REFUSE to
 *   fake the namespace (every method rejects) so no plugin test can go green
 *   against it. Reconcile the moment the host lands its side.
 */
export const SDK_AHEAD_PERMISSIONS = [
  'workspace.read',
  'workspace.write',
  'workspace.exec',
] as const

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
 * - `launch` (elevated): gates `launch.open` — "Open links and files, and run
 *   programs you confirm".
 * - `coreRead` (elevated): gates the `core.*` namespace — `core.sessions.list`,
 *   `core.sessions.get`, `core.projects.list`, `core.projects.get`,
 *   `core.messages.list`. A blanket read of all sessions and projects, distinct
 *   from the opt-in, per-session `sessions.readHistory` grant the SDK does type.
 * - `oauth` (elevated): gates `oauth.authorize` — third-party sign-in.
 * - `channel` (elevated): gates `channel.connect` / `channel.send` /
 *   `channel.close` — a live connection to an external service.
 *
 * All six are listed rather than typed on purpose: guessing at a host runtime
 * shape is the exact mistake the HISTORY note above records, and the parity
 * guard already asserts a host-ahead permission has NOT leaked into the SDK enum.
 */
export const HOST_AHEAD_PERMISSIONS = [
  'boards.read',
  'sessions.launchAny',
  'launch',
  'coreRead',
  'oauth',
  'channel',
] as const

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
 * Note `ctx.workspace` is deliberately NOT a delta: the host has no workspace
 * runtime at all, which is a whole-namespace gap tracked in
 * SDK_AHEAD_PERMISSIONS above, not a shape mismatch between two live surfaces.
 *
 * Append a new entry here (and bump the guard's expected count) only when a
 * fresh, deliberately-deferred type delta is introduced.
 */
export const KNOWN_TYPE_DELTAS = [] as const
