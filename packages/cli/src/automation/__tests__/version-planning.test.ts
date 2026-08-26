import { describe, it, expect } from 'vitest'
import {
  latestSubmittedVersion,
  bumpPatch,
  versionAlreadyUsed,
  planDefaultVersion
} from '../lib/version-planning.js'
import type { AutomationSubmission } from '../api/automation-api.js'

const sub = (automationId: string, version: string): AutomationSubmission => ({
  id: `${automationId}@${version}`,
  automationId,
  version,
  status: 'pending',
  submittedAt: '',
  reviewNotes: null
})

describe('latestSubmittedVersion', () => {
  it('returns null when the author has never submitted this automation', () => {
    expect(latestSubmittedVersion([], 'x')).toBeNull()
    expect(latestSubmittedVersion([sub('other', '9.9.9')], 'x')).toBeNull()
  })

  it('picks the highest version by semver, not by string order', () => {
    const subs = [sub('x', '1.9.0'), sub('x', '1.10.0'), sub('x', '1.2.0')]
    expect(latestSubmittedVersion(subs, 'x')).toBe('1.10.0')
  })

  it('counts every status — a pending or rejected version still burned the slot', () => {
    const subs = [
      { ...sub('x', '2.0.0'), status: 'rejected' },
      { ...sub('x', '1.0.0'), status: 'approved' }
    ]
    expect(latestSubmittedVersion(subs, 'x')).toBe('2.0.0')
  })

  it('scopes to the requested automationId', () => {
    const subs = [sub('x', '1.0.0'), sub('y', '5.0.0')]
    expect(latestSubmittedVersion(subs, 'x')).toBe('1.0.0')
  })
})

describe('bumpPatch', () => {
  it('increments the patch component', () => {
    expect(bumpPatch('1.0.0')).toBe('1.0.1')
    expect(bumpPatch('2.4.9')).toBe('2.4.10')
  })

  it('preserves major and minor', () => {
    expect(bumpPatch('3.7.0')).toBe('3.7.1')
  })

  it('discards a pre-release tag before bumping', () => {
    expect(bumpPatch('1.2.3-beta.1')).toBe('1.2.4')
  })

  it('treats a missing component as zero', () => {
    expect(bumpPatch('1')).toBe('1.0.1')
    expect(bumpPatch('1.5')).toBe('1.5.1')
  })
})

describe('versionAlreadyUsed', () => {
  it('is true for an exact automationId + version match', () => {
    expect(versionAlreadyUsed([sub('x', '1.0.0')], 'x', '1.0.0')).toBe(true)
  })

  it('is false for a different version or a different automation', () => {
    const subs = [sub('x', '1.0.0'), sub('y', '2.0.0')]
    expect(versionAlreadyUsed(subs, 'x', '1.0.1')).toBe(false)
    expect(versionAlreadyUsed(subs, 'z', '1.0.0')).toBe(false)
  })
})

describe('planDefaultVersion', () => {
  it('returns the initial default on a first release, with no basis', () => {
    expect(planDefaultVersion([], 'x', '1.0.0')).toEqual({ version: '1.0.0', basedOn: null })
  })

  it('returns the next patch above the latest, naming what it was based on', () => {
    const subs = [sub('x', '1.0.0'), sub('x', '1.0.4')]
    expect(planDefaultVersion(subs, 'x', '1.0.0')).toEqual({ version: '1.0.5', basedOn: '1.0.4' })
  })
})
