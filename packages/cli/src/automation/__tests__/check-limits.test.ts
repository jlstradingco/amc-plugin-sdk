import { describe, it, expect } from 'vitest'
import { checkLimits } from '../checks/limits.js'
import { deriveAutomationId, isValidAutomationId } from '../lib/envelope.js'

const codes = (recipe: Record<string, unknown>): string[] =>
  checkLimits(recipe).map((f) => f.code)

const step = (prompt: string): Record<string, unknown> => ({ name: 'step', prompt })

const base = (over: Record<string, unknown> = {}): Record<string, unknown> => ({
  name: 'Daily Digest',
  executionMode: 'multi-session',
  steps: [step('do the thing')],
  ...over
})

describe('checkLimits', () => {
  it('passes an ordinary automation', () => {
    expect(checkLimits(base())).toEqual([])
  })

  describe('the derived id', () => {
    it('rejects a name that slugs to a single character', () => {
      // The server's pattern requires at least two characters, so "X" is refused with a
      // 400 the author cannot connect to anything they typed.
      expect(codes(base({ name: 'X' }))).toContain('automation-id-too-short')
    })

    it('rejects a name whose slug runs past 64 characters', () => {
      // The local name limit is 100, so this passes checkStructure and used to reach
      // the server only to be refused.
      expect(codes(base({ name: 'a'.repeat(80) }))).toContain('automation-id-too-long')
    })

    it('accepts a name that slugs to exactly the minimum length', () => {
      expect(codes(base({ name: 'Hi' }))).toEqual([])
    })

    it('accepts a name that slugs to exactly the maximum length', () => {
      const name = 'a'.repeat(64)
      expect(deriveAutomationId(name)).toHaveLength(64)
      expect(codes(base({ name }))).toEqual([])
    })

    it('names the automation, not the id, as the thing to change', () => {
      // The author never types the id — a fix that talked about the id would be a dead end.
      const [finding] = checkLimits(base({ name: 'X' }))
      expect(finding!.fix).toMatch(/name/i)
      expect(finding!.message).toContain('"X"')
    })

    it('says nothing about the id when there is no name', () => {
      // checkStructure already reports the missing name; piling on helps nobody.
      expect(codes(base({ name: '' }))).toEqual([])
      expect(codes(base({ name: undefined }))).toEqual([])
    })

    it('counts punctuation-only names as too short, matching the deriver', () => {
      // deriveAutomationId falls back to "automation" for an all-symbol name, which IS
      // a valid id — so this documents that the fallback is deliberately accepted rather
      // than silently producing a shared namespace collision the author cannot see.
      expect(deriveAutomationId('!!!')).toBe('automation')
      expect(isValidAutomationId('automation')).toBe(true)
      expect(codes(base({ name: '!!!' }))).toEqual([])
    })
  })

  describe('step count', () => {
    it('accepts exactly 200 steps', () => {
      expect(codes(base({ steps: Array.from({ length: 200 }, () => step('go')) }))).toEqual([])
    })

    it('rejects 201 steps', () => {
      expect(codes(base({ steps: Array.from({ length: 201 }, () => step('go')) }))).toContain(
        'too-many-steps'
      )
    })

    it('reports the actual count and the limit', () => {
      const [finding] = checkLimits(base({ steps: Array.from({ length: 250 }, () => step('go')) }))
      expect(finding!.message).toContain('250')
      expect(finding!.message).toContain('200')
    })

    it('ignores a non-array steps field, which structure already reports', () => {
      expect(codes(base({ steps: 'nope' }))).toEqual([])
    })
  })

  describe('definition size', () => {
    it('rejects a definition past 256 KB', () => {
      expect(codes(base({ steps: [step('x'.repeat(300 * 1024))] }))).toContain(
        'definition-too-large'
      )
    })

    it('accepts a large but publishable definition', () => {
      expect(codes(base({ steps: [step('x'.repeat(200 * 1024))] }))).toEqual([])
    })

    it('measures the envelope, not the file, so local-only fields do not count', () => {
      // `scope` and any unknown field never travel, so a recipe carrying a large
      // local-only blob is still publishable. Measuring the file on disk would have
      // rejected it.
      const recipe = base({
        scope: 'global',
        localNotes: 'y'.repeat(300 * 1024),
        steps: [step('short')]
      })
      expect(codes(recipe)).toEqual([])
    })

    it('reports the size in KB rather than bytes', () => {
      const [finding] = checkLimits(base({ steps: [step('x'.repeat(300 * 1024))] }))
      expect(finding!.message).toMatch(/KB/)
    })
  })

  it('reports every limit problem in one pass', () => {
    const recipe = base({
      name: 'X',
      steps: Array.from({ length: 201 }, () => step('go'))
    })
    const found = codes(recipe)
    expect(found).toContain('automation-id-too-short')
    expect(found).toContain('too-many-steps')
  })

  it('reports every finding at error severity — these are hard rejections', () => {
    const findings = checkLimits(base({ name: 'X', steps: Array.from({ length: 201 }, () => step('go')) }))
    expect(findings.every((f) => f.severity === 'error')).toBe(true)
  })

  it('gives every finding a remedy', () => {
    const findings = checkLimits(
      base({ name: 'a'.repeat(80), steps: Array.from({ length: 201 }, () => step('go')) })
    )
    expect(findings.length).toBeGreaterThan(0)
    expect(findings.every((f) => typeof f.fix === 'string' && f.fix.length > 0)).toBe(true)
  })
})
