import { describe, it, expect } from 'vitest'
import { hasErrors, findingsToJson, type Finding } from '../lib/findings.js'

const err: Finding = { severity: 'error', code: 'a', message: 'boom' }
const warnF: Finding = { severity: 'warning', code: 'b', message: 'hmm' }
const infoF: Finding = { severity: 'info', code: 'c', message: 'fyi' }

describe('findings', () => {
  it('hasErrors is true only when an error is present', () => {
    expect(hasErrors([])).toBe(false)
    expect(hasErrors([warnF])).toBe(false)
    expect(hasErrors([infoF, warnF])).toBe(false)
    expect(hasErrors([warnF, err])).toBe(true)
  })

  it('findingsToJson groups by severity and sets ok from errors alone', () => {
    const out = findingsToJson([err, warnF])
    expect(out.ok).toBe(false)
    expect(out.errors).toEqual([err])
    expect(out.warnings).toEqual([warnF])
    expect(out.info).toEqual([])
  })

  it('a warning-only set is still ok', () => {
    expect(findingsToJson([warnF]).ok).toBe(true)
  })

  it('an info-only set is still ok', () => {
    expect(findingsToJson([infoF]).ok).toBe(true)
  })

  it('an empty set is ok with empty groups', () => {
    const out = findingsToJson([])
    expect(out).toEqual({ ok: true, errors: [], warnings: [], info: [] })
  })

  it('preserves every finding across the three groups', () => {
    const out = findingsToJson([err, warnF, infoF])
    expect(out.errors.length + out.warnings.length + out.info.length).toBe(3)
  })
})
