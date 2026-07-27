import { describe, it, expect } from 'vitest'
import { checkStructure } from '../checks/structure.js'

const valid = {
  name: 'Daily digest',
  steps: [{ name: 'one', prompt: 'do the thing' }],
  executionMode: 'multi-session'
}
const codes = (r: Record<string, unknown>): string[] => checkStructure(r).map((f) => f.code)

describe('checkStructure', () => {
  it('accepts a well-formed recipe', () => {
    expect(checkStructure(valid)).toEqual([])
  })

  it('requires a non-empty name', () => {
    expect(codes({ ...valid, name: '' })).toContain('missing-name')
    expect(codes({ ...valid, name: '   ' })).toContain('missing-name')
    expect(codes({ ...valid, name: 42 })).toContain('missing-name')
    const { name: _drop, ...noName } = valid
    expect(codes(noName)).toContain('missing-name')
  })

  it('caps the name at 100 characters', () => {
    expect(codes({ ...valid, name: 'x'.repeat(101) })).toContain('name-too-long')
    expect(codes({ ...valid, name: 'x'.repeat(100) })).not.toContain('name-too-long')
  })

  it('requires steps to be a non-empty array', () => {
    expect(codes({ ...valid, steps: [] })).toContain('no-steps')
    expect(codes({ ...valid, steps: 'nope' })).toContain('no-steps')
    const { steps: _drop, ...noSteps } = valid
    expect(codes(noSteps)).toContain('no-steps')
  })

  it('requires a known executionMode when present', () => {
    expect(codes({ ...valid, executionMode: 'turbo' })).toContain('bad-execution-mode')
    for (const mode of ['multi-session', 'same-session', 'parallel']) {
      expect(codes({ ...valid, executionMode: mode })).not.toContain('bad-execution-mode')
    }
  })

  it('allows executionMode to be absent — the envelope builder defaults it', () => {
    const { executionMode: _drop, ...noMode } = valid
    expect(codes(noMode)).not.toContain('bad-execution-mode')
  })

  it('rejects a schemaVersion this build does not understand', () => {
    expect(codes({ ...valid, schemaVersion: 2 })).toContain('bad-schema-version')
    expect(codes({ ...valid, schemaVersion: 0 })).toContain('bad-schema-version')
    expect(codes({ ...valid, schemaVersion: 1 })).not.toContain('bad-schema-version')
  })

  it('reports every problem in one pass', () => {
    const found = codes({ name: '', steps: [], executionMode: 'turbo', schemaVersion: 9 })
    expect(found).toContain('missing-name')
    expect(found).toContain('no-steps')
    expect(found).toContain('bad-execution-mode')
    expect(found).toContain('bad-schema-version')
  })

  it('gives every finding a remedy', () => {
    for (const f of checkStructure({ name: '', steps: [], executionMode: 'turbo' })) {
      expect(f.fix, `${f.code} has no fix`).toBeTruthy()
    }
  })

  it('does not throw on null or empty input', () => {
    expect(() => checkStructure({})).not.toThrow()
    expect(() => checkStructure({ steps: null } as never)).not.toThrow()
  })
})
