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
    expect(found[0]?.message).toContain('step 1')
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

  // `pipelines` rides the publish envelope's allow-list, so its steps are published and
  // run. This check walked only `steps`, so an empty prompt in a pipeline shipped clean
  // and then could not run — the one outcome the check exists to prevent.
  describe('pipelines', () => {
    it('flags an empty prompt inside a pipeline', () => {
      const found = checkSteps({
        steps: [{ name: 'a', prompt: 'go' }],
        pipelines: { review: [{ name: 'check', prompt: '' }] }
      })
      expect(found.map((f) => f.code)).toContain('empty-prompt')
    })

    it('flags an unnamed step inside a pipeline', () => {
      const found = checkSteps({ pipelines: { review: [{ prompt: 'go' }] } })
      expect(found.map((f) => f.code)).toContain('unnamed-step')
    })

    it('says which pipeline the step came from', () => {
      // A step name is not unique across pipelines, so "check" alone would be ambiguous.
      const found = checkSteps({ pipelines: { review: [{ name: 'check', prompt: '' }] } })
      expect(found[0]?.message).toContain('review')
      expect(found[0]?.message).toContain('check')
    })

    it('catches a recipe whose only broken step is in a pipeline', () => {
      const found = checkSteps({
        steps: [{ name: 'a', prompt: 'go' }],
        pipelines: { deploy: [{ name: 'ship', prompt: '   ' }] }
      })
      expect(found).toHaveLength(1)
      expect(found[0]?.code).toBe('empty-prompt')
    })

    it('never nests quotes in a pipeline step label', () => {
      const found = checkSteps({ pipelines: { review: [{ name: 'check', prompt: '' }] } })
      expect(found[0]?.message).not.toContain('""')
    })

    it('does not throw on malformed pipelines', () => {
      expect(() => checkSteps({ pipelines: 'nope' })).not.toThrow()
      expect(() => checkSteps({ pipelines: { a: 'nope' } })).not.toThrow()
      expect(() => checkSteps({ pipelines: { a: [null, 3] } })).not.toThrow()
    })

    it('stays quiet on a pipeline whose steps are all well formed', () => {
      expect(
        checkSteps({
          steps: [{ name: 'a', prompt: 'go' }],
          pipelines: { review: [{ name: 'check', prompt: 'look' }] }
        })
      ).toEqual([])
    })
  })
})
