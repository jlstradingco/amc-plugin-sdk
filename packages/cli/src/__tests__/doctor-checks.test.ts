import { describe, it, expect } from 'vitest'
import {
  checkNodeVersion,
  checkSdkVersion,
  checkManifest,
  checkHostProbe,
  checkMarketplaceReachable,
  summarizeDoctor,
  type DoctorResult,
} from '../lib/doctor-checks.js'

describe('checkNodeVersion', () => {
  it('passes on a recent Node', () => {
    expect(checkNodeVersion('v22.11.0').status).toBe('pass')
  })

  it('warns on an old-but-supported Node', () => {
    expect(checkNodeVersion('v18.19.0').status).toBe('warn')
  })

  it('fails on an unsupported Node', () => {
    const r = checkNodeVersion('v16.20.0')
    expect(r.status).toBe('fail')
    expect(r.suggestion).toBeTruthy()
  })

  it('warns (does not crash) on an unparseable version', () => {
    expect(checkNodeVersion('garbage').status).toBe('warn')
  })
})

describe('checkSdkVersion', () => {
  it('warns when the SDK is not installed', () => {
    const r = checkSdkVersion(null, '1.0.7')
    expect(r.status).toBe('warn')
    expect(r.suggestion).toBeTruthy()
  })

  const current = (version: string) => ({ name: '@omniscio/plugin-sdk', version })

  it('passes when installed matches latest', () => {
    expect(checkSdkVersion(current('1.0.7'), '1.0.7').status).toBe('pass')
  })

  it('passes when latest is unknown (offline)', () => {
    expect(checkSdkVersion(current('1.0.7'), null).status).toBe('pass')
  })

  it('warns when an update is available', () => {
    const r = checkSdkVersion(current('1.0.4'), '1.0.7')
    expect(r.status).toBe('warn')
    expect(r.message).toContain('1.0.7')
  })

  it('passes when installed is ahead of the registry (local dev)', () => {
    expect(checkSdkVersion(current('1.1.0'), '1.0.7').status).toBe('pass')
  })

  it('names the new package when a plugin is still on the old @agent-mc name', () => {
    const r = checkSdkVersion({ name: '@agent-mc/plugin-sdk', version: '3.3.0' }, '3.4.0')
    expect(r.status).toBe('warn')
    expect(r.message).toContain('@agent-mc/plugin-sdk 3.3.0')
    expect(r.message).toContain('@omniscio/plugin-sdk')
    expect(r.suggestion).toContain('pnpm add @omniscio/plugin-sdk')
  })
})

describe('checkManifest', () => {
  it('warns when there is no manifest (not in a plugin dir)', () => {
    expect(checkManifest(null, null).status).toBe('warn')
  })

  it('fails when the manifest is invalid', () => {
    const r = checkManifest({}, { valid: false, errors: ['plugin.id is required'] })
    expect(r.status).toBe('fail')
    expect(r.suggestion).toContain('plugin.id')
  })

  it('passes when the manifest is valid', () => {
    expect(checkManifest({ plugin: {} }, { valid: true, errors: [] }).status).toBe('pass')
  })
})

describe('checkHostProbe', () => {
  it('passes only when the authenticated probe answered 2xx', () => {
    expect(checkHostProbe({ reachable: true, status: 200, hasToken: true }, 19519).status).toBe(
      'pass'
    )
  })

  it('warns (never fails) when Omniscio is not running', () => {
    const r = checkHostProbe({ reachable: false, status: null, hasToken: true }, 19519)
    expect(r.status).toBe('warn')
    expect(r.message).toContain('19519')
  })

  it('fails on a 401 with a token rather than reporting a green host [S056]', () => {
    const r = checkHostProbe({ reachable: true, status: 401, hasToken: true }, 19519)
    expect(r.status).toBe('fail')
    expect(r.message).toContain('401')
    expect(r.suggestion).toContain('Settings -> CLI Control')
  })

  it('fails on a 403 too', () => {
    expect(checkHostProbe({ reachable: true, status: 403, hasToken: true }, 19519).status).toBe(
      'fail'
    )
  })

  it('fails when no CLI token was found at all', () => {
    const r = checkHostProbe({ reachable: true, status: 401, hasToken: false }, 19519)
    expect(r.status).toBe('fail')
    expect(r.message).toContain('no CLI token')
  })

  it('warns on an unexpected status, keeping the raw number', () => {
    const r = checkHostProbe({ reachable: true, status: 500, hasToken: true }, 19519)
    expect(r.status).toBe('warn')
    expect(r.message).toContain('500')
  })
})

describe('checkMarketplaceReachable', () => {
  it('passes when reachable', () => {
    expect(checkMarketplaceReachable(true).status).toBe('pass')
  })

  it('warns when unreachable', () => {
    expect(checkMarketplaceReachable(false).status).toBe('warn')
  })
})

describe('summarizeDoctor', () => {
  it('counts by status and flags failures', () => {
    const results: DoctorResult[] = [
      { name: 'a', status: 'pass', message: '' },
      { name: 'b', status: 'warn', message: '' },
      { name: 'c', status: 'fail', message: '' },
      { name: 'd', status: 'pass', message: '' },
    ]
    const s = summarizeDoctor(results)
    expect(s.counts).toEqual({ pass: 2, warn: 1, fail: 1 })
    expect(s.hasFailure).toBe(true)
  })

  it('reports no failure when all pass or warn', () => {
    const s = summarizeDoctor([
      { name: 'a', status: 'pass', message: '' },
      { name: 'b', status: 'warn', message: '' },
    ])
    expect(s.hasFailure).toBe(false)
  })
})
