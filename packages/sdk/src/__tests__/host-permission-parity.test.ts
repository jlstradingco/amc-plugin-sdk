import { describe, it, expect } from 'vitest'
import { PLUGIN_PERMISSIONS, manifestSchema } from '../index.js'
import {
  HOST_PERMISSIONS,
  SDK_AHEAD_PERMISSIONS,
  KNOWN_TYPE_DELTAS,
} from './fixtures/host-permission-mirror.js'

describe('SDK <-> host permission parity', () => {
  const sdk = new Set<string>(PLUGIN_PERMISSIONS)
  const host = new Set<string>(HOST_PERMISSIONS)
  const sdkAhead = new Set<string>(SDK_AHEAD_PERMISSIONS)

  it('exports a non-empty runtime permission list', () => {
    expect(PLUGIN_PERMISSIONS.length).toBeGreaterThan(0)
    // No duplicates in the canonical list.
    expect(sdk.size).toBe(PLUGIN_PERMISSIONS.length)
  })

  it('recognizes every permission the host gates (no host-only drift)', () => {
    const hostOnly = [...host].filter((p) => !sdk.has(p))
    expect(hostOnly).toEqual([])
  })

  it('only exposes permissions the host gates OR a documented SDK-ahead one', () => {
    const undocumented = [...sdk].filter((p) => !host.has(p) && !sdkAhead.has(p))
    expect(undocumented).toEqual([])
  })

  it('SDK permissions == host permissions ∪ documented SDK-ahead set', () => {
    const expected = new Set<string>([...host, ...sdkAhead])
    expect([...sdk].sort()).toEqual([...expected].sort())
  })

  it('every documented SDK-ahead permission is actually exposed by the SDK', () => {
    const dangling = [...sdkAhead].filter((p) => !sdk.has(p))
    expect(dangling).toEqual([])
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

  it('documents the deferred type-shape deltas (breaking, own PR)', () => {
    // This assertion exists so the guard file names the known drift rather than
    // silently tolerating it. Updating the deltas is intentional and reviewed.
    expect(KNOWN_TYPE_DELTAS.length).toBe(2)
  })
})
