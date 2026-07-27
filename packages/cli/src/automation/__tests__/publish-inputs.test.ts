import { describe, it, expect } from 'vitest'
import {
  checkPublishInputs,
  inputProblemsAsFindings,
  isValidCategory,
  isValidVersion,
  VERSION_PATTERN
} from '../lib/publish-inputs.js'
import { AUTOMATION_CATEGORIES } from '../lib/envelope.js'

describe('isValidVersion', () => {
  it('accepts three dot-separated integers', () => {
    expect(isValidVersion('1.0.0')).toBe(true)
    expect(isValidVersion('0.0.1')).toBe(true)
    expect(isValidVersion('12.34.56')).toBe(true)
  })

  it('rejects the near-misses a person actually types', () => {
    expect(isValidVersion('1.0')).toBe(false)
    expect(isValidVersion('v1.0.0')).toBe(false)
    expect(isValidVersion('1.0.0.0')).toBe(false)
    expect(isValidVersion('1')).toBe(false)
    expect(isValidVersion('')).toBe(false)
    expect(isValidVersion('latest')).toBe(false)
  })

  it('rejects the semver extensions the marketplace does not accept', () => {
    // Deliberately stricter than semver: the server's regex has no room for these,
    // so accepting them locally would only move the 400 later.
    expect(isValidVersion('1.0.0-beta')).toBe(false)
    expect(isValidVersion('1.0.0+build.1')).toBe(false)
    expect(isValidVersion('1.0.0-rc.1')).toBe(false)
  })

  it('is anchored at both ends', () => {
    expect(isValidVersion(' 1.0.0')).toBe(false)
    expect(isValidVersion('1.0.0 ')).toBe(false)
    expect(isValidVersion('x1.0.0x')).toBe(false)
  })

  it('mirrors the marketplace pattern exactly', () => {
    // The server's validateVersion is /^\d+\.\d+\.\d+$/ — pinned here so a local
    // loosening has to be a deliberate, reviewed edit.
    expect(VERSION_PATTERN.source).toBe('^\\d+\\.\\d+\\.\\d+$')
  })
})

describe('isValidCategory', () => {
  it('accepts every published category', () => {
    for (const category of AUTOMATION_CATEGORIES) {
      expect(isValidCategory(category), category).toBe(true)
    }
  })

  it('rejects an unknown one', () => {
    expect(isValidCategory('malware')).toBe(false)
    expect(isValidCategory('Development')).toBe(false)
    expect(isValidCategory('')).toBe(false)
  })
})

describe('checkPublishInputs', () => {
  it('passes a well-formed version and category', () => {
    expect(checkPublishInputs({ version: '1.2.3', category: 'devops' })).toEqual([])
  })

  it('ignores what was not supplied', () => {
    // Both flags carry defaults at the command layer; an absent value is not a problem.
    expect(checkPublishInputs({})).toEqual([])
  })

  it('flags a bad version', () => {
    const problems = checkPublishInputs({ version: 'v1' })
    expect(problems).toHaveLength(1)
    expect(problems[0]?.code).toBe('bad-version')
    expect(problems[0]?.message).toContain('"v1"')
  })

  it('flags a bad category and names the valid ones', () => {
    const problems = checkPublishInputs({ category: 'malware' })
    expect(problems).toHaveLength(1)
    expect(problems[0]?.code).toBe('bad-category')
    expect(problems[0]?.suggestion).toContain('planning')
    expect(problems[0]?.suggestion).toContain('other')
  })

  it('reports both problems at once, not one per run', () => {
    const problems = checkPublishInputs({ version: '1.0', category: 'nope' })
    expect(problems.map((p) => p.code)).toEqual(['bad-version', 'bad-category'])
  })

  it('gives every problem a remedy', () => {
    for (const p of checkPublishInputs({ version: 'x', category: 'y' })) {
      expect(p.suggestion, `${p.code} has no suggestion`).toBeTruthy()
    }
  })
})

describe('inputProblemsAsFindings', () => {
  it('maps a problem onto an error-severity finding', () => {
    const findings = inputProblemsAsFindings(checkPublishInputs({ version: 'v1' }))
    expect(findings).toHaveLength(1)
    expect(findings[0]?.severity).toBe('error')
    expect(findings[0]?.code).toBe('bad-version')
    expect(findings[0]?.fix).toBeTruthy()
  })

  it('carries the suggestion across as the fix', () => {
    const problems = checkPublishInputs({ category: 'nope' })
    const findings = inputProblemsAsFindings(problems)
    expect(findings[0]?.fix).toBe(problems[0]?.suggestion)
  })

  it('returns nothing for no problems', () => {
    expect(inputProblemsAsFindings([])).toEqual([])
  })
})
