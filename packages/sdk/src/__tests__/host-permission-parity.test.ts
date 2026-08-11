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
    expect(HOST_PERMISSIONS.length).toBe(29)
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
