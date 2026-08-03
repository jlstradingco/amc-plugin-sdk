import { describe, it, expect } from 'vitest'
import { PLUGIN_PERMISSIONS, manifestSchema } from '../index.js'
import { createTestContext } from '../testing/index.js'
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
    expect(HOST_PERMISSIONS.length).toBe(22)
    expect(host.size).toBe(HOST_PERMISSIONS.length)
  })

  it('gives every recognized permission a typed ctx namespace', () => {
    // The other half of the same failure: a permission string with no typed
    // namespace is declarable but unusable, which is barely better than being
    // rejected outright. Every permission maps to the ctx key that carries it
    // (or to null when it gates no backend namespace at all).
    const namespaceForPermission: Record<string, string | null> = {
      storage: 'storage',
      secrets: 'secrets',
      sessions: 'sessions',
      'sessions.readHistory': 'sessionHistory',
      ai: 'ai',
      tts: 'tts',
      network: 'http',
      cron: 'cron',
      cli: 'cli',
      notifications: 'toast',
      // Ungated-at-the-namespace-level host capabilities reached through other
      // surfaces (shell/clipboard/process for `system`, RSS reads, the webview
      // chrome APIs, deep-link navigation) — no single backend ctx key owns them.
      system: null,
      rss: null,
      chrome: null,
      navigation: null,
      auth: 'auth',
      'auth.session': 'auth',
      firebase: 'firebase',
      recording: 'recording',
      inbox: 'inbox',
      spend: 'spend',
    }

    // Every permission the SDK exposes must be classified above — no silent omissions.
    const unclassified = [...sdk].filter(
      (p) => !Object.prototype.hasOwnProperty.call(namespaceForPermission, p)
    )
    expect(unclassified).toEqual([])

    // And every classified namespace must actually exist on PluginContext.
    const ctxKeys = new Set(Object.keys(createTestContext().ctx))
    const missingNamespaces = [...sdk]
      .map((p) => namespaceForPermission[p])
      .filter((ns): ns is string => ns !== null && ns !== undefined)
      .filter((ns) => !ctxKeys.has(ns))
    expect(missingNamespaces).toEqual([])
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
