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
// LAST RECONCILED: 2026-08-11, against host commit `origin/master@8722cc3fca`
// (committed 2026-08-11T08:30:40-04:00), by GENERATING the 29 strings from
// src/shared/plugin-permissions.ts rather than hand-copying them:
//
//   sed -n '/^export type PluginPermission/,/^$/p' src/shared/plugin-permissions.ts \
//     | grep -oE "'[^']+'" | tr -d "'"
//
// The commit SHA is recorded so the NEXT reconciliation can `git diff` that one
// file between SHAs instead of re-reading 200 lines and eyeballing the delta.
// ─────────────────────────────────────────────────────────────────────────────
//
// HISTORY — why this file is worth distrusting. It has now gone stale FOUR
// times, and each recurrence was found only because somebody happened to look:
//
//  1. 2026-07-15..27 — claimed 14 while the host union was 19, and claimed
//     `firebase` was "an ungated browser namespace, not a host permission".
//     Both wrong; plugin-bridge-handler.ts hard-denies `firebase` without the
//     permission. Four shipped host capabilities (`tts`, `sessions.readHistory`,
//     `firebase`, `spend`) were unreachable from the public SDK.
//  2. 2026-08-03 — claimed 19 while the host held 22. Missing: `secrets`
//     (shipped 2026-08-01 and advertised in Omniscio v0.1.90), `boards.read`,
//     `sessions.launchAny`.
//  3. 2026-08-04 — claimed 22 while the host held 26. Missing: `launch`,
//     `coreRead`, `oauth`, `channel` — all four Tier-1 `elevated`.
//  4. 2026-08-11 (this change) — claimed 26 while the host held 29. The three
//     `workspace.*` permissions were listed as SDK-AHEAD ("no host
//     implementation exists ... verified across all 80 local and remote branch
//     tips") when the host had in fact landed the whole capability on
//     2026-08-05, six days earlier. `BRIDGE_PENDING_PERMISSIONS` likewise still
//     called `recording` an unwired "gating stub" long after ctx.recording went
//     live. Both were caught only by a full re-audit.
//
// RECURRENCE #4 HAS A SECOND LESSON, and it is the more expensive one. The
// audit that found it first ran against a LOCAL host checkout that was 6679
// commits behind `origin/master`, and that stale tree produced confidently
// wrong findings in BOTH directions — it reported the `documents` bridge
// namespace as SDK fiction when the host ships it, and it reported the
// workspace slice as 9 read-only methods when the host has 14 including writes
// and exec. So:
//
//   VERIFY AGAINST `origin/master`, NOT A LOCAL WORKING TREE. Run
//   `git fetch && git log --oneline HEAD..origin/master | wc -l` FIRST. If that
//   number is not 0, every conclusion you draw from the working tree is suspect.
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
  'workspace.read',
  'workspace.write',
  'workspace.exec',
] as const

// --- Documented known-deltas (intentional, tracked drift) -------------------

/**
 * Permissions the SDK exposes as a recognized string AHEAD of the host gating
 * any method against them.
 *
 * EMPTY, and it should stay that way. The three `workspace.*` permissions lived
 * here from 2026-08-04 until 2026-08-11 on the strength of a claim that no host
 * implementation existed "across all 80 local and remote branch tips". The host
 * had shipped `ctx.workspace` on 2026-08-05 — `plugin-permission-map.ts` now
 * carries fourteen `workspace.*` rows, `workspace.write` and `workspace.exec`
 * each gate real mutating methods, and both are `tier: 'elevated'` in the
 * consent dialog.
 *
 * Typing a capability ahead of the host is a deliberate exception to the "never
 * invent a host runtime shape" rule, and recurrence #4 shows what it costs: the
 * SDK shipped six `WorkspaceApi` methods (`listBindings`, `requestBinding`,
 * `exec`, `execStatus`, `execResults`, `execCancel`) transcribed from a spec the
 * host never implemented, and missed three it did (`writeFiles`, `mkdir`,
 * `run`). Prefer waiting for the host.
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
 *
 * Note this is the one allow-list that has never gone stale — all six were still
 * absent from the SDK at the 2026-08-11 reconciliation.
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
 * EMPTY as of 2026-08-11. `recording` sat here describing an unwired "gating
 * stub"; the host has since wired `ctx.recording` for real
 * (plugin-enable.ts builds `{ start, stop, list, get }`, backed by
 * plugin-recording-service.ts, with four rows in plugin-permission-map.ts). The
 * SDK's `PluginRecording` type was realigned to that live shape in the same
 * change that emptied this list.
 */
export const BRIDGE_PENDING_PERMISSIONS = [] as const

/**
 * Type-shape deltas between the SDK's `PluginContext` and the host's runtime.
 * Recorded here so the guard test names any known drift rather than silently
 * tolerating an unbounded gap. Currently EMPTY.
 *
 * Two large deltas were open between 2026-08-05 and 2026-08-11 without ever
 * being recorded here, which is the failure this list exists to prevent:
 *
 * - `ctx.workspace`: the SDK declared 17 methods against the host's 14 — six
 *   pure fiction, three host methods missing, and `writeFile`/`deleteFile`
 *   carrying `expectedMtimeMs` compare-and-swap arguments the host has no
 *   concept of. Resolved by re-deriving `WorkspaceApi` from the host's
 *   WORKSPACE_SCHEMAS.
 * - `ctx.recording`: the SDK declared `getShareUrl` and `delete` (neither
 *   exists), typed `stop()` to take a `{ recordingId }` object where the host
 *   wants a bare string, and gave `start()` a `source` option the host
 *   discards. Resolved by re-deriving from plugin-enable.ts.
 *
 * Note `ctx.workspace` was previously excused from this list on the grounds
 * that "the host has no workspace runtime at all". That carve-out became wrong
 * the moment the host landed one, and nothing re-checked it. A whole-namespace
 * gap converts into a shape delta silently — so when a SDK_AHEAD entry lands
 * host-side, re-derive the shape rather than assuming the spec was followed.
 *
 * Append a new entry here (and bump the guard's expected count) only when a
 * fresh, deliberately-deferred type delta is introduced.
 */
export const KNOWN_TYPE_DELTAS = [] as const
