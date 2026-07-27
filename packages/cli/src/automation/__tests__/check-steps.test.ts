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

  // An entry that is not a step was invisible to every check and then silently
  // dropped by the envelope, so the published automation was missing a step and
  // nothing anywhere said so.
  describe('entries that are not steps', () => {
    it('reports a null entry as an error', () => {
      const found = checkSteps({ steps: [{ name: 'a', prompt: 'go' }, null] })
      expect(found).toHaveLength(1)
      expect(found[0]?.code).toBe('malformed-step')
      expect(found[0]?.severity).toBe('error')
    })

    it('names the slot so the author can find it', () => {
      const found = checkSteps({ steps: [{ name: 'a', prompt: 'go' }, null] })
      expect(found[0]?.message).toContain('steps[1]')
    })

    it('says the entry would be dropped, which is the consequence that matters', () => {
      const found = checkSteps({ steps: [null] })
      expect(found[0]?.message).toContain('dropped')
    })

    it('carries a remedy', () => {
      expect(checkSteps({ steps: [null] })[0]?.fix).toBeTruthy()
    })

    it('reports a malformed entry inside a pipeline', () => {
      const found = checkSteps({ pipelines: { review: ['oops'] } })
      expect(found).toHaveLength(1)
      expect(found[0]?.code).toBe('malformed-step')
      expect(found[0]?.message).toContain('pipelines.review[0]')
    })

    it('reports every malformed entry in one pass', () => {
      const found = checkSteps({ steps: [null, 'x', 42] })
      expect(found.filter((f) => f.code === 'malformed-step')).toHaveLength(3)
    })

    it('reports malformed entries alongside the ordinary step findings', () => {
      // A recipe can be wrong in both ways at once; one must not mask the other.
      const found = checkSteps({ steps: [null, { prompt: '' }] })
      expect(found.map((f) => f.code).sort()).toEqual([
        'empty-prompt',
        'malformed-step',
        'unnamed-step'
      ])
    })

    it('carries no stepName, since there is no step to name', () => {
      expect(checkSteps({ steps: [null] })[0]?.stepName).toBeUndefined()
    })

    it('stays quiet when every entry is a real step', () => {
      expect(checkSteps({ steps: [{ name: 'a', prompt: 'go' }] })).toEqual([])
    })
  })
})
