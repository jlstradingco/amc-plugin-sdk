import { describe, it, expect } from 'vitest'
import * as fs from 'node:fs'
import * as path from 'node:path'
import { fileURLToPath } from 'node:url'
import { PLUGIN_PERMISSIONS, manifestSchema } from '../index.js'
import { createTestContext } from '../testing/index.js'

const here = path.dirname(fileURLToPath(import.meta.url))

function bridgeNamespaceNames(): string[] {
  const source = fs.readFileSync(path.join(here, '..', 'types', 'bridge.ts'), 'utf-8')
  const iface = source.slice(source.indexOf('export interface AgentMC'))
  const body = iface.slice(0, iface.indexOf('\n}'))
  const names = [...body.matchAll(/^ {2}([a-zA-Z][A-Za-z0-9_]*)\s*:/gm)].map((m) => m[1])
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
  const CTX = 'ctx' as const
  const BRIDGE = 'bridge' as const
  const namespaceForPermission: Record<
    string,
    { surface: typeof CTX | typeof BRIDGE; key: string } | null
  > = {
    storage: { surface: CTX, key: 'storage' },
    secrets: { surface: CTX, key: 'secrets' },
    sessions: { surface: CTX, key: 'sessions' },
    'sessions.readHistory': { surface: BRIDGE, key: 'sessionHistory' },
    ai: { surface: CTX, key: 'ai' },
    tts: { surface: BRIDGE, key: 'tts' },
    stt: { surface: BRIDGE, key: 'stt' },
    microphone: null,
    network: { surface: CTX, key: 'http' },
    cron: { surface: CTX, key: 'cron' },
    cli: { surface: CTX, key: 'cli' },
    notifications: { surface: CTX, key: 'toast' },
    system: null,
    rss: null,
    chrome: null,
    navigation: null,
    auth: { surface: CTX, key: 'auth' },
    'auth.session': { surface: CTX, key: 'auth' },
    firebase: { surface: BRIDGE, key: 'firebase' },
    recording: { surface: CTX, key: 'recording' },
    inbox: { surface: CTX, key: 'inbox' },
    spend: { surface: CTX, key: 'spend' },
    'boards.read': null,
    coreRead: { surface: CTX, key: 'core' },
    'chrome.widget': { surface: BRIDGE, key: 'widget' },
    'workspace.read': { surface: CTX, key: 'workspace' },
    'workspace.write': { surface: CTX, key: 'workspace' },
    'workspace.exec': { surface: CTX, key: 'workspace' },
    'sessions.launchAny': { surface: CTX, key: 'sessions' },
    'sessions.observeStatus': { surface: CTX, key: 'sessions' },
    'auth.sharedSignIn': { surface: CTX, key: 'auth' },
    'documents.read': { surface: BRIDGE, key: 'documents' },
    'documents.write': { surface: BRIDGE, key: 'documents' },
    'members.read': null,
    'email.send': { surface: CTX, key: 'email' },
    'network.upload': { surface: BRIDGE, key: 'http' },
    launch: null,
    oauth: null,
    channel: null,
    'boards.link': null,
    webassembly: null,
  }

  const sdk = new Set<string>(PLUGIN_PERMISSIONS)
  const host = new Set<string>(HOST_PERMISSIONS)
  const sdkAhead = new Set<string>(SDK_AHEAD_PERMISSIONS)
  const hostAhead = new Set<string>(HOST_AHEAD_PERMISSIONS)
  const bridgePending = new Set<string>(BRIDGE_PENDING_PERMISSIONS)

  it('exports a non-empty runtime permission list', () => {
    expect(PLUGIN_PERMISSIONS.length).toBeGreaterThan(0)
    expect(sdk.size).toBe(PLUGIN_PERMISSIONS.length)
  })

  it('recognizes every permission the host gates OR a documented host-ahead one', () => {
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
      uploadHosts: ['upload.example.com'],
    }
    const ok = manifestSchema.safeParse({ ...base, permissions: [...PLUGIN_PERMISSIONS] })
    expect(ok.success).toBe(true)
    const bad = manifestSchema.safeParse({ ...base, permissions: ['not-a-real-permission'] })
    expect(bad.success).toBe(false)
  })

  it('pins the host union size so a silent mirror shrink is a reviewed change', () => {
    expect(HOST_PERMISSIONS.length).toBe(41)
    expect(host.size).toBe(HOST_PERMISSIONS.length)
  })

  it('gives every recognized permission a typed namespace on SOME surface', () => {
    const unclassified = [...sdk].filter(
      (p) => !Object.prototype.hasOwnProperty.call(namespaceForPermission, p)
    )
    expect(unclassified).toEqual([])

    const entries = [...sdk]
      .map((p) => namespaceForPermission[p])
      .filter((n): n is { surface: typeof CTX | typeof BRIDGE; key: string } => n != null)

    const ctxKeys = new Set(Object.keys(createTestContext().ctx))
    const missingOnCtx = entries
      .filter((n) => n.surface === CTX)
      .map((n) => n.key)
      .filter((key) => !ctxKeys.has(key))
    expect(missingOnCtx).toEqual([])

    const bridgeKeys = new Set(bridgeNamespaceNames())
    const bridgeEntries = entries.filter((n) => n.surface === BRIDGE)
    expect(bridgeEntries.filter((n) => !bridgeKeys.has(n.key)).map((n) => n.key)).toEqual([])
    const ctxEntryKeys = new Set(entries.filter((n) => n.surface === CTX).map((n) => n.key))
    expect(
      bridgeEntries.filter((n) => ctxKeys.has(n.key) && !ctxEntryKeys.has(n.key)).map((n) => n.key)
    ).toEqual([])
  })

  it('keeps the webview-only uploadFile off the backend http namespace', () => {
    expect('uploadFile' in createTestContext().ctx.http).toBe(false)
  })

  it('classifies coreRead and chrome.widget as REAL namespaces, not nulls', () => {
    expect(namespaceForPermission.coreRead).toEqual({ surface: CTX, key: 'core' })
    expect(namespaceForPermission['chrome.widget']).toEqual({ surface: BRIDGE, key: 'widget' })
  })

  it('has no outstanding type-shape deltas (both historical ones resolved)', () => {
    expect(KNOWN_TYPE_DELTAS.length).toBe(0)
  })
})

describe('host-permission-mirror freshness (guards the vendored copy itself, not just its contents)', () => {
  it('fails once HOST_MIRROR_PROVENANCE.reconciledAt is older than the staleness budget', () => {
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
      const livePermissions = [...body.matchAll(/^\s*\|\s*'([^']+)'/gm)].map((m) => m[1])
      expect(livePermissions.length).toBeGreaterThan(0)
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
