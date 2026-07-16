import { describe, it, expect } from 'vitest'
import {
  checkNodeVersion,
  checkSdkVersion,
  checkManifest,
  checkHostReachable,
  checkCliToken,
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

  it('passes when installed matches latest', () => {
    expect(checkSdkVersion('1.0.7', '1.0.7').status).toBe('pass')
  })

  it('passes when latest is unknown (offline)', () => {
    expect(checkSdkVersion('1.0.7', null).status).toBe('pass')
  })

  it('warns when an update is available', () => {
    const r = checkSdkVersion('1.0.4', '1.0.7')
    expect(r.status).toBe('warn')
    expect(r.message).toContain('1.0.7')
  })

  it('passes when installed is ahead of the registry (local dev)', () => {
    expect(checkSdkVersion('1.1.0', '1.0.7').status).toBe('pass')
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

describe('checkHostReachable', () => {
  it('passes when AMC is reachable', () => {
    expect(checkHostReachable(true, 19519).status).toBe('pass')
  })

  it('warns (never fails) when AMC is not running', () => {
    const r = checkHostReachable(false, 19519)
    expect(r.status).toBe('warn')
    expect(r.message).toContain('19519')
  })
})

describe('checkCliToken', () => {
  it('passes when the token file exists', () => {
    expect(checkCliToken(true).status).toBe('pass')
  })

  it('warns when the token file is missing', () => {
    expect(checkCliToken(false).status).toBe('warn')
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
