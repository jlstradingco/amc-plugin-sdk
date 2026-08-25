import { describe, it, expect } from 'vitest'
import * as fs from 'node:fs'
import * as path from 'node:path'
import { fileURLToPath } from 'node:url'
import { PLUGIN_PERMISSIONS, manifestSchema } from '../index.js'
import { createTestContext } from '../testing/index.js'

const here = path.dirname(fileURLToPath(import.meta.url))

/**
 * The member names on `AgentMC`, read from source.
 *
 * `AgentMC` is a type, so there is nothing to enumerate at runtime — and the
 * SDK ships no mock for the webview surface at all. Parsing the interface is
 * the only way to assert against it without hand-maintaining a third mirror.
 */
function bridgeNamespaceNames(): string[] {
  const source = fs.readFileSync(path.join(here, '..', 'types', 'bridge.ts'), 'utf-8')
  const iface = source.slice(source.indexOf('export interface AgentMC'))
  const body = iface.slice(0, iface.indexOf('\n}'))
  const names = [...body.matchAll(/^ {2}([a-zA-Z][A-Za-z0-9_]*)\s*:/gm)].map((m) => m[1])
  // Vacuity guard: an empty list would satisfy every assertion downstream.
  expect(names.length).toBeGreaterThan(0)
  return names
}
import {
  HOST_PERMISSIONS,
  SDK_AHEAD_PERMISSIONS,
  HOST_AHEAD_PERMISSIONS,
  BRIDGE_PENDING_PERMISSIONS,
  KNOWN_TYPE_DELTAS,
  HOST_MIRROR_PROVENANCE,
} from './fixtures/host-permission-mirror.js'

describe('SDK <-> host permission parity', () => {
  const sdk = new Set<string>(PLUGIN_PERMISSIONS)
  const host = new Set<string>(HOST_PERMISSIONS)
  const sdkAhead = new Set<string>(SDK_AHEAD_PERMISSIONS)
  const hostAhead = new Set<string>(HOST_AHEAD_PERMISSIONS)
  const bridgePending = new Set<string>(BRIDGE_PENDING_PERMISSIONS)

  it('exports a non-empty runtime permission list', () => {
    expect(PLUGIN_PERMISSIONS.length).toBeGreaterThan(0)
    // No duplicates in the canonical list.
    expect(sdk.size).toBe(PLUGIN_PERMISSIONS.length)
  })

  it('recognizes every permission the host gates OR a documented host-ahead one', () => {
    // A host-only permission is allowed ONLY if it is a documented host-ahead
    // one (the host gates it but the SDK has no typed namespace for it yet).
    const undocumentedHostOnly = [...host].filter((p) => !sdk.has(p) && !hostAhead.has(p))
    expect(undocumentedHostOnly).toEqual([])
  })

  it('only exposes permissions the host gates OR a documented SDK-ahead one', () => {
    const undocumented = [...sdk].filter((p) => !host.has(p) && !sdkAhead.has(p))
    expect(undocumented).toEqual([])
  })

  it('SDK ∪ host-ahead == host ∪ SDK-ahead (symmetric parity, deltas aside)', () => {
    const lhs = new Set<string>([...sdk, ...hostAhead])
    const rhs = new Set<string>([...host, ...sdkAhead])
    expect([...lhs].sort()).toEqual([...rhs].sort())
  })

  it('every documented SDK-ahead permission is actually exposed by the SDK', () => {
    const dangling = [...sdkAhead].filter((p) => !sdk.has(p))
    expect(dangling).toEqual([])
  })

  it('every documented host-ahead permission is actually gated by the host, not the SDK', () => {
    const notHostGated = [...hostAhead].filter((p) => !host.has(p))
    expect(notHostGated).toEqual([])
    const leakedIntoSdk = [...hostAhead].filter((p) => sdk.has(p))
    expect(leakedIntoSdk).toEqual([])
  })

  it('every bridge-pending permission is recognized by BOTH sides (set parity holds)', () => {
    // Bridge-pending permissions are a runtime namespace gap, NOT a permission
    // -set gap: both the SDK and the host must still recognize the string.
    const notRecognized = [...bridgePending].filter((p) => !sdk.has(p) || !host.has(p))
    expect(notRecognized).toEqual([])
  })

  it('the Zod manifest schema accepts exactly the runtime permission list', () => {
    const base = {
      plugin: {
        id: 'parity-plugin',
        name: 'Parity',
        version: '1.0.0',
        author: 'test',
        description: 'test',
        icon: 'x',
        category: 'other' as const,
        license: { type: 'free' as const },
      },
      settings: [],
      storage: { collections: {} },
      migrations: [],
      sdkVersion: '1.0.0',
    }
    const ok = manifestSchema.safeParse({ ...base, permissions: [...PLUGIN_PERMISSIONS] })
    expect(ok.success).toBe(true)
    const bad = manifestSchema.safeParse({ ...base, permissions: ['not-a-real-permission'] })
    expect(bad.success).toBe(false)
  })

  it('pins the host union size so a silent mirror shrink is a reviewed change', () => {
    // Regression guard for the 2026-07-15 -> 2026-07-27 failure: the mirror was
    // reconciled to 14 permissions while the host union held 19, and because the
    // parity assertions above compare the SDK enum against THIS MIRROR, a wrong
    // mirror plus a wrong enum agreed and the suite stayed green. An explicit
    // count means shrinking the mirror can only happen deliberately, in a diff a
    // reviewer sees. Bump it ONLY after re-deriving from the host's
    // src/shared/plugin-permissions.ts union.
    //
    // 22 -> 26 on 2026-08-04: the mirror had gone stale a THIRD time (see the
    // fixture's HISTORY block). Re-derived by generation from host
    // master@9c21044ee0; the four added are `launch`, `coreRead`, `oauth`,
    // `channel`, all Tier-1 elevated and all host-ahead.
    //
    // 26 -> 29 on 2026-08-11: stale a FOURTH time. The three `workspace.*`
    // permissions were sitting in SDK_AHEAD_PERMISSIONS on the claim that no
    // host implementation existed, six days after the host shipped the whole
    // capability. Re-derived by generation from host origin/master@8722cc3fca.
    //
    // Note what this pin did NOT catch, and cannot: the count moved for a
    // reason invisible to it. The mirror still had 26 strings and the SDK still
    // had 23, so every set-algebra assertion above stayed green — the drift was
    // entirely inside the ALLOW-LISTS. When you bump this number, re-read
    // SDK_AHEAD/HOST_AHEAD/BRIDGE_PENDING too; the count alone is not the guard.
    //
    // 29 -> 31 on 2026-08-24: added `stt` and `microphone`. Unlike every prior
    // bump, neither needed a HOST_AHEAD or SDK_AHEAD entry: `stt` ships with a
    // typed `AgentMC.stt` bridge namespace in the SAME change (see the 'gives
    // every recognized permission a typed namespace' test below), and
    // `microphone` gates raw webview getUserMedia rather than an RPC method, so
    // it is deliberately classified `null` there rather than left undocumented.
    // Re-derived from the host's
    // session/98c53684-6b6e-4c82-b57b-27c39c68c368-stt-transcribe-bridge branch
    // (see HOST_MIRROR_PROVENANCE in the fixture; not yet on origin/master).
    expect(HOST_PERMISSIONS.length).toBe(31)
    expect(host.size).toBe(HOST_PERMISSIONS.length)
  })

  it('gives every recognized permission a typed namespace on SOME surface', () => {
    // The other half of the same failure: a permission string with no typed
    // namespace is declarable but unusable, which is barely better than being
    // rejected outright.
    //
    // The surface matters, and conflating the two is its own bug. `tts`,
    // `sessions.readHistory` and `firebase` were mapped to ctx keys here and
    // mocked on ctx, so this assertion passed — while the host puts all three on
    // the WEBVIEW bridge only, leaving `ctx.tts` undefined and a call to it a
    // TypeError at activation. Each permission now names the surface that
    // actually carries it.
    const CTX = 'ctx' as const
    const BRIDGE = 'bridge' as const
    const namespaceForPermission: Record<
      string,
      { surface: typeof CTX | typeof BRIDGE; key: string } | null
    > = {
      storage: { surface: CTX, key: 'storage' },
      secrets: { surface: CTX, key: 'secrets' },
      sessions: { surface: CTX, key: 'sessions' },
      // Webview-only — no ctx.sessionHistory exists.
      'sessions.readHistory': { surface: BRIDGE, key: 'sessionHistory' },
      ai: { surface: CTX, key: 'ai' },
      // Webview-only — no ctx.tts exists.
      tts: { surface: BRIDGE, key: 'tts' },
      // Webview-only, no ctx.stt exists, same as tts above.
      stt: { surface: BRIDGE, key: 'stt' },
      // Raw webview getUserMedia, gated by the host's per-webview permission
      // handler rather than any RPC method, so there is no ctx or bridge
      // namespace to point at.
      microphone: null,
      network: { surface: CTX, key: 'http' },
      cron: { surface: CTX, key: 'cron' },
      cli: { surface: CTX, key: 'cli' },
      notifications: { surface: CTX, key: 'toast' },
      // Ungated-at-the-namespace-level host capabilities reached through other
      // surfaces (shell/clipboard/process for `system`, RSS reads, the webview
      // chrome APIs, deep-link navigation) — no single backend ctx key owns them.
      system: null,
      rss: null,
      chrome: null,
      navigation: null,
      auth: { surface: CTX, key: 'auth' },
      'auth.session': { surface: CTX, key: 'auth' },
      // Webview-only — no ctx.firebase exists.
      firebase: { surface: BRIDGE, key: 'firebase' },
      recording: { surface: CTX, key: 'recording' },
      inbox: { surface: CTX, key: 'inbox' },
      spend: { surface: CTX, key: 'spend' },
      // All three tiers of the workspace capability are carried by the single
      // `ctx.workspace` namespace; the host splits read/write/exec per METHOD
      // rather than per namespace. Backend-only — the webview case throws.
      'workspace.read': { surface: CTX, key: 'workspace' },
      'workspace.write': { surface: CTX, key: 'workspace' },
      'workspace.exec': { surface: CTX, key: 'workspace' },
    }

    // Every permission the SDK exposes must be classified above — no silent omissions.
    const unclassified = [...sdk].filter(
      (p) => !Object.prototype.hasOwnProperty.call(namespaceForPermission, p)
    )
    expect(unclassified).toEqual([])

    const entries = [...sdk]
      .map((p) => namespaceForPermission[p])
      .filter((n): n is { surface: typeof CTX | typeof BRIDGE; key: string } => n != null)

    // A ctx-surface namespace must exist on the real PluginContext.
    const ctxKeys = new Set(Object.keys(createTestContext().ctx))
    const missingOnCtx = entries
      .filter((n) => n.surface === CTX)
      .map((n) => n.key)
      .filter((key) => !ctxKeys.has(key))
    expect(missingOnCtx).toEqual([])

    // A bridge-surface namespace must be declared on AgentMC — and must NOT be
    // on ctx, which is the specific mistake this test used to hide.
    const bridgeKeys = new Set(bridgeNamespaceNames())
    const bridgeEntries = entries.filter((n) => n.surface === BRIDGE)
    expect(bridgeEntries.filter((n) => !bridgeKeys.has(n.key)).map((n) => n.key)).toEqual([])
    expect(bridgeEntries.filter((n) => ctxKeys.has(n.key)).map((n) => n.key)).toEqual([])
  })

  it('has no outstanding type-shape deltas (both historical ones resolved)', () => {
    // This assertion exists so the guard file names any known drift rather than
    // silently tolerating it. The two original deltas (QueryOptions.orderBy and
    // PluginDb.update) were resolved when the SDK types were aligned to the host
    // runtime, so the list is now empty. Bumping this count is intentional and
    // reviewed — do it only when a new deferred delta is genuinely introduced.
    expect(KNOWN_TYPE_DELTAS.length).toBe(0)
  })
})

/**
 * The block above only ever compares the SDK against HOST_PERMISSIONS, a
 * hand-maintained copy of the host's real union (see the fixture file's
 * HISTORY block: it went stale five separate times, each caught only because
 * someone happened to re-read it). A wrong mirror and a wrong SDK enum agree
 * with each other, so nothing above can ever detect the mirror itself
 * drifting from the actual host source. There is no dependency from this
 * package on the host app to check against for real: the host consumes the
 * PUBLISHED @agent-mc/plugin-sdk, so a runtime cross-import back into it would
 * be circular, and the host repo is not present in this package's CI at all.
 *
 * The two tests below are the best available substitute for that missing
 * cross-repo check.
 */
describe('host-permission-mirror freshness (guards the vendored copy itself, not just its contents)', () => {
  it('fails once HOST_MIRROR_PROVENANCE.reconciledAt is older than the staleness budget', () => {
    // 30 days: long enough not to fire on a normal update cadence, short
    // enough that the mirror can only go unreconciled for a month before this
    // forces a human to go re-check it against the host source rather than
    // trusting it indefinitely.
    const budgetDays = 30
    const reconciledAt = new Date(`${HOST_MIRROR_PROVENANCE.reconciledAt}T00:00:00Z`)
    expect(
      Number.isNaN(reconciledAt.getTime()),
      `HOST_MIRROR_PROVENANCE.reconciledAt ("${HOST_MIRROR_PROVENANCE.reconciledAt}") is not a valid date`
    ).toBe(false)
    const ageDays = (Date.now() - reconciledAt.getTime()) / (1000 * 60 * 60 * 24)
    expect(
      ageDays,
      `host-permission-mirror.ts was last reconciled ${HOST_MIRROR_PROVENANCE.reconciledAt} ` +
        `(${Math.round(ageDays)} days ago), past the ${budgetDays}-day staleness budget. Re-derive ` +
        "HOST_PERMISSIONS from the host's src/shared/plugin-permissions.ts (generation command is " +
        'at the top of the fixture file), update HOST_MIRROR_PROVENANCE, and bump the pinned count ' +
        'test in the describe above.'
    ).toBeLessThanOrEqual(budgetDays)
  })

  const hostPermissionsPath = process.env.AMC_HOST_PERMISSIONS_PATH
  if (!hostPermissionsPath) {
    // Logged unconditionally at collection time, not only inside the skipped
    // test body below, so the coverage gap is visible even to a runner that
    // only surfaces failures.
    console.warn(
      '[host-permission-parity] AMC_HOST_PERMISSIONS_PATH is not set. Skipping the real cross-repo ' +
        'permission check below, so this run relies only on the hand-maintained mirror plus its ' +
        "staleness budget above, not a live comparison. Point the var at the host checkout's " +
        'src/shared/plugin-permissions.ts to run the real check.'
    )
  }

  it.skipIf(!hostPermissionsPath)(
    'the HOST_PERMISSIONS mirror matches the REAL host union when AMC_HOST_PERMISSIONS_PATH is set',
    () => {
      const filePath = hostPermissionsPath as string
      const source = fs.readFileSync(filePath, 'utf-8')
      const match = source.match(/export type PluginPermission =\s*([\s\S]*?)\n\s*\n\s*export/)
      const body = match?.[1]
      if (body === undefined) {
        throw new Error(
          `Could not find "export type PluginPermission = ..." in ${filePath}. The host file's ` +
            'shape changed; update this parser rather than trusting a stale result.'
        )
      }
      // Anchored to the union's own `| 'permission'` syntax rather than a bare
      // quote-to-quote scan, so a comment inside the union body (which CAN
      // contain an apostrophe) can never be mistaken for a member. A bare scan
      // hit exactly this failure mode elsewhere in this same change, in the
      // marketplace's own hand-maintained copy of this same problem
      // (firebase/marketplace/functions/src/types.ts, KNOWN_PERMISSIONS).
      const livePermissions = [...body.matchAll(/^\s*\|\s*'([^']+)'/gm)].map((m) => m[1])
      expect(livePermissions.length).toBeGreaterThan(0)
      // Compared against the MIRROR, not PLUGIN_PERMISSIONS: the SDK set is
      // deliberately narrower than the host (see HOST_AHEAD_PERMISSIONS above),
      // so it is never a flat match. HOST_PERMISSIONS is the vendored copy this
      // whole file exists to protect, and a flat match against it is exactly
      // the "has the mirror drifted from the real host" question.
      //
      // WHY THIS IS NOT `expect(setA).toEqual(setB)`, which is what it used to be:
      // that form reports the answer in a notation that cannot be read reliably.
      // Vitest renders a truncated collection as `Set{ 'a', 'b', ...(N) }`, where
      // N is the REMAINDER after the shown members. But the shown count depends on
      // rendered STRING LENGTH, and once the members are long enough that none fit,
      // N becomes the TOTAL. Measured, identical set sizes, only names changed:
      //
      //   12 vs 13, short names:  Set{ 's0', 's1', 's2', 's3', ...(8) }  N = remainder
      //   12 vs 13, long names:   Set{ ...(12) }                         N = total
      //
      // Permission strings sit right at that boundary, so the same notation means
      // opposite things from one run to the next. On 2026-08-25 two people read one
      // real failure of THIS test and each derived a confident, different, wrong
      // pair of totals from it; one then spent twenty minutes chasing a stale
      // checkout that was never stale. Nothing in the output could have settled it.
      //
      // So the failure now reports evidence instead of sizes to be inferred: both
      // NAMED deltas, the two sizes as explicit integers, and the file actually
      // read. The provenance line is printed because it is what distinguishes the
      // causes below, not as a verdict. Read it, then check:
      //   - mirrorOnly non-empty, onOriginMaster false -> check whether sourceBranch
      //     has landed on the host yet. Expected until it does; not a defect.
      //   - hostOnly non-empty -> the host gained permissions the mirror lacks.
      //     Regenerate the mirror (command at the top of the fixture).
      //   - both non-empty -> the two files are from divergent branches; confirm
      //     which host revision AMC_HOST_PERMISSIONS_PATH actually points at.
      // Both widened to Set<string> deliberately (the idiom this file already uses
      // for `host` above): HOST_PERMISSIONS is a `readonly [...] as const`, so an
      // un-widened Set would be keyed on the literal union and reject `.has()` of
      // a string parsed out of the host file, which is the whole input here.
      const mirror = new Set<string>(HOST_PERMISSIONS)
      const live = new Set<string>(livePermissions)
      const mirrorOnly = [...mirror].filter((p) => !live.has(p)).sort()
      const hostOnly = [...live].filter((p) => !mirror.has(p)).sort()
      const detail =
        `live host union has ${live.size} members, HOST_PERMISSIONS mirror has ${mirror.size}. ` +
        `Only in mirror: ${JSON.stringify(mirrorOnly)}. Only in host: ${JSON.stringify(hostOnly)}. ` +
        `Read from: ${filePath}. Mirror reconciled ${HOST_MIRROR_PROVENANCE.reconciledAt} against ` +
        `${HOST_MIRROR_PROVENANCE.sourceBranch} @ ` +
        `${HOST_MIRROR_PROVENANCE.sourceCommit.slice(0, 11)} ` +
        `(onOriginMaster: ${HOST_MIRROR_PROVENANCE.onOriginMaster}).`
      expect({ mirrorOnly, hostOnly }, detail).toEqual({ mirrorOnly: [], hostOnly: [] })
    }
  )
})
