import { describe, it, expect } from 'vitest'
import { checkSteps } from '../checks/steps.js'

const codes = (steps: unknown): string[] => checkSteps({ steps }).map((f) => f.code)

describe('checkSteps', () => {
  it('accepts steps that all carry a name and a prompt', () => {
    expect(checkSteps({ steps: [{ name: 'a', prompt: 'go' }] })).toEqual([])
  })

  it('flags an empty prompt — AMC pre-flight blocks the run on this', () => {
    expect(codes([{ name: 'a', prompt: '' }])).toContain('empty-prompt')
  })

  it('flags a whitespace-only prompt', () => {
    expect(codes([{ name: 'a', prompt: '   \n\t ' }])).toContain('empty-prompt')
  })

  it('flags a missing prompt', () => {
    expect(codes([{ name: 'a' }])).toContain('empty-prompt')
  })

  it('flags a non-string prompt', () => {
    expect(codes([{ name: 'a', prompt: 42 }])).toContain('empty-prompt')
  })

  it('names the offending step', () => {
    const found = checkSteps({ steps: [{ name: 'second', prompt: '' }] })
    expect(found[0]?.stepName).toBe('second')
  })

  it('flags every bad step, not just the first', () => {
    const found = checkSteps({
      steps: [
        { name: 'a', prompt: '' },
        { name: 'b', prompt: 'ok' },
        { name: 'c', prompt: '' }
      ]
    })
    expect(found.filter((f) => f.code === 'empty-prompt')).toHaveLength(2)
    expect(found.filter((f) => f.code === 'empty-prompt').map((f) => f.stepName)).toEqual([
      'a',
      'c'
    ])
  })

  it('flags a step with no name', () => {
    expect(codes([{ prompt: 'go' }])).toContain('unnamed-step')
    expect(codes([{ name: '  ', prompt: 'go' }])).toContain('unnamed-step')
  })

  it('reports the step position when it has no name to report', () => {
    const found = checkSteps({ steps: [{ prompt: 'go' }] })
    expect(found[0]?.message).toContain('Step 1')
  })

  it('gives every finding a remedy', () => {
    for (const f of checkSteps({ steps: [{ prompt: '' }] })) {
      expect(f.fix, `${f.code} has no fix`).toBeTruthy()
    }
  })

  it('does not throw on non-array or null steps', () => {
    expect(() => checkSteps({ steps: null })).not.toThrow()
    expect(() => checkSteps({})).not.toThrow()
    expect(codes('nope')).toEqual([])
  })

  it('skips a non-object entry rather than throwing', () => {
    expect(() => checkSteps({ steps: [null, 'x', 3] })).not.toThrow()
    expect(checkSteps({ steps: [null, 'x', 3] })).toEqual([])
  })
})
