import { describe, it, expect, vi } from 'vitest'
import { hasErrors, findingsToJson, reportFindings, type Finding } from '../lib/findings.js'

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

describe('reportFindings rendering', () => {
  const render = (findings: Parameters<typeof reportFindings>[0]): string[] => {
    const lines: string[] = []
    // All three: output.ts routes fail -> console.error, warn -> console.warn, and
    // ok/info/the fix line -> console.log. Missing one silently drops that severity.
    const spies = (['log', 'warn', 'error'] as const).map((method) =>
      vi.spyOn(console, method).mockImplementation((...a) => void lines.push(a.join(' ')))
    )
    reportFindings(findings)
    for (const s of spies) s.mockRestore()
    return lines
  }

  it('appends the step location when the message does not name it', () => {
    const out = render([
      { severity: 'error', code: 'x', message: 'Something went wrong.', stepName: 'gather' }
    ])
    expect(out.join(' ')).toContain('(step "gather")')
  })

  it('does NOT repeat a step the message already names', () => {
    // Several checks lead with the step name because the sentence reads better, and
    // repeating it rendered every portability finding as
    //   "ship" runs a local script ... (step "ship")
    const out = render([
      { severity: 'error', code: 'x', message: '"ship" runs a local script.', stepName: 'ship' }
    ])
    expect(out.join(' ')).not.toContain('(step "ship")')
  })

  it('never nests quotes for a pipeline step label', () => {
    const label = 'review › ship'
    const out = render([
      { severity: 'error', code: 'x', message: `"${label}" runs a local script.`, stepName: label }
    ]).join(' ')
    expect(out).not.toContain('""')
    expect(out).toContain('review › ship')
  })

  it('renders a finding with no step at all', () => {
    const out = render([{ severity: 'warning', code: 'x', message: 'Just a note.' }])
    expect(out.join(' ')).toContain('Just a note.')
  })
})
