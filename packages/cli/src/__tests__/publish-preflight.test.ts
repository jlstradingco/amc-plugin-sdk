import { describe, it, expect } from 'vitest'
import { PLUGIN_PERMISSIONS } from '@agent-mc/plugin-sdk'
import {
  checkVersionAgainstRegistry,
  checkChangelog,
  checkPackageSize,
  checkDeclaredPermissions,
  summarizePreflight,
  type PreflightResult
} from '../lib/publish-preflight.js'

describe('checkVersionAgainstRegistry', () => {
  it('passes when the plugin has never been published', () => {
    const r = checkVersionAgainstRegistry('1.0.0', null)
    expect(r.status).toBe('pass')
    expect(r.message).toMatch(/first release/i)
  })

  it('passes when the manifest version is newer than the published version', () => {
    const r = checkVersionAgainstRegistry('1.1.0', '1.0.0')
    expect(r.status).toBe('pass')
    expect(r.message).toMatch(/1\.1\.0/)
  })

  it('fails when the manifest version equals the published version (immutable)', () => {
    const r = checkVersionAgainstRegistry('1.0.0', '1.0.0')
    expect(r.status).toBe('fail')
    expect(r.message).toMatch(/already published/i)
    expect(r.suggestion).toMatch(/bump/i)
  })

  it('fails when the manifest version is older than the published version', () => {
    const r = checkVersionAgainstRegistry('0.9.0', '1.0.0')
    expect(r.status).toBe('fail')
    expect(r.message).toMatch(/older/i)
  })
})

describe('checkChangelog', () => {
  it('passes when a non-empty changelog is provided', () => {
    expect(checkChangelog('Fixed a bug').status).toBe('pass')
  })

  it('warns when the changelog is empty', () => {
    expect(checkChangelog('').status).toBe('warn')
  })

  it('warns when the changelog is only whitespace', () => {
    expect(checkChangelog('   \n  ').status).toBe('warn')
  })

  it('warns when the changelog is null', () => {
    expect(checkChangelog(null).status).toBe('warn')
  })
})

describe('checkPackageSize', () => {
  it('passes for a small package', () => {
    expect(checkPackageSize(2 * 1024 * 1024).status).toBe('pass')
  })

  it('warns for a package over 25 MB', () => {
    const r = checkPackageSize(30 * 1024 * 1024)
    expect(r.status).toBe('warn')
    expect(r.message).toMatch(/MB/)
  })

  it('fails for a package over the 50 MB marketplace limit', () => {
    const r = checkPackageSize(55 * 1024 * 1024)
    expect(r.status).toBe('fail')
    expect(r.suggestion).toMatch(/50 ?MB|reduce/i)
  })
})

describe('checkDeclaredPermissions', () => {
  it('passes with no declared permissions', () => {
    expect(checkDeclaredPermissions([]).status).toBe('pass')
    expect(checkDeclaredPermissions(undefined).status).toBe('pass')
  })

  it('passes for a valid permission list', () => {
    const r = checkDeclaredPermissions(['storage', 'ai', 'network'])
    expect(r.status).toBe('pass')
    expect(r.message).toMatch(/storage/)
  })

  it('fails on an unknown permission', () => {
    const r = checkDeclaredPermissions(['storage', 'wat'])
    expect(r.status).toBe('fail')
    expect(r.message).toMatch(/wat/)
  })

  it('warns on duplicate permissions', () => {
    const r = checkDeclaredPermissions(['storage', 'storage'])
    expect(r.status).toBe('warn')
    expect(r.message).toMatch(/duplicate/i)
  })

  // Regression guard. The 1.2.0 SDK widened its permission enum to cover four
  // shipped host capabilities, but preflight kept a hand-copied list that never
  // learned them — so `amc-plugin publish` still exited 1 on "Unknown
  // permission(s)" for the exact plugins the enum was widened to allow. The list
  // had also been missing `system` and `chrome` for longer than that. Accepting
  // every SDK permission is the invariant; the source of the set is the fix.
  it('accepts every permission the SDK enum recognizes', () => {
    const rejected = PLUGIN_PERMISSIONS.filter(
      (p) => checkDeclaredPermissions([p]).status !== 'pass'
    )
    expect(rejected).toEqual([])
  })

  it.each(['tts', 'sessions.readHistory', 'firebase', 'spend'] as const)(
    'accepts the 1.2.0 permission %s',
    (permission) => {
      expect(checkDeclaredPermissions([permission]).status).toBe('pass')
    }
  )

  it.each(['system', 'chrome'] as const)(
    'accepts %s, which the hand-copied list had always omitted',
    (permission) => {
      expect(checkDeclaredPermissions([permission]).status).toBe('pass')
    }
  )

  it('still rejects a string the SDK does not recognize', () => {
    // The widening must not have turned the check into a no-op.
    const r = checkDeclaredPermissions(['storage', 'not-a-permission'])
    expect(r.status).toBe('fail')
    expect(r.message).toMatch(/not-a-permission/)
    expect(r.suggestion).toMatch(/storage/)
  })
})

describe('summarizePreflight', () => {
  const mk = (status: PreflightResult['status']): PreflightResult => ({ name: 'x', status, message: 'm' })

  it('counts statuses and flags failure', () => {
    const s = summarizePreflight([mk('pass'), mk('warn'), mk('fail'), mk('pass')])
    expect(s.counts).toEqual({ pass: 2, warn: 1, fail: 1 })
    expect(s.hasFailure).toBe(true)
  })

  it('reports no failure when all pass or warn', () => {
    const s = summarizePreflight([mk('pass'), mk('warn')])
    expect(s.hasFailure).toBe(false)
  })
})
