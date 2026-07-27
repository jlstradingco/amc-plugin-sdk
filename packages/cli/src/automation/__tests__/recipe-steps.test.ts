import { describe, it, expect } from 'vitest'
import {
  collectAllSteps,
  collectTopLevelSteps,
  collectPipelineSteps
} from '../lib/recipe-steps.js'

const labels = (recipe: Record<string, unknown>): string[] =>
  collectAllSteps(recipe).map((s) => s.label)

const paths = (recipe: Record<string, unknown>): string[] =>
  collectAllSteps(recipe).map((s) => s.path)

describe('collectTopLevelSteps', () => {
  it('returns nothing for a recipe with no steps', () => {
    expect(collectTopLevelSteps({})).toEqual([])
  })

  it('tolerates a non-array steps field', () => {
    expect(collectTopLevelSteps({ steps: 'nope' })).toEqual([])
    expect(collectTopLevelSteps({ steps: 42 })).toEqual([])
  })

  it('uses the declared name as the label', () => {
    const [s] = collectTopLevelSteps({ steps: [{ name: 'gather', prompt: 'x' }] })
    expect(s!.label).toBe('gather')
    expect(s!.declaredName).toBe('gather')
    expect(s!.path).toBe('steps[0]')
  })

  it('falls back to a positional label when a step has no name', () => {
    const [s] = collectTopLevelSteps({ steps: [{ prompt: 'x' }] })
    expect(s!.label).toBe('step 1')
    expect(s!.declaredName).toBeUndefined()
  })

  it('treats a blank name as no name', () => {
    const [s] = collectTopLevelSteps({ steps: [{ name: '   ', prompt: 'x' }] })
    expect(s!.label).toBe('step 1')
    expect(s!.declaredName).toBeUndefined()
  })

  it('skips malformed entries without shifting the indices of the rest', () => {
    // The positional label has to keep matching the author's file, so a null entry
    // must not renumber the steps after it.
    const found = collectTopLevelSteps({ steps: [null, { prompt: 'x' }, 'nope', { prompt: 'y' }] })
    expect(found.map((s) => s.path)).toEqual(['steps[1]', 'steps[3]'])
    expect(found.map((s) => s.label)).toEqual(['step 2', 'step 4'])
  })
})

describe('collectPipelineSteps', () => {
  it('returns nothing when there are no pipelines', () => {
    expect(collectPipelineSteps({})).toEqual([])
    expect(collectPipelineSteps({ pipelines: null })).toEqual([])
    expect(collectPipelineSteps({ pipelines: [] })).toEqual([])
  })

  it('walks every named pipeline', () => {
    const found = collectPipelineSteps({
      pipelines: { review: [{ prompt: 'a' }, { prompt: 'b' }], deploy: [{ prompt: 'c' }] }
    })
    expect(found).toHaveLength(3)
  })

  it('paths a pipeline step by pipeline name and index', () => {
    const [s] = collectPipelineSteps({ pipelines: { review: [{ prompt: 'a' }] } })
    expect(s!.path).toBe('pipelines.review[0]')
  })

  it('always names the pipeline in the label, since step names are not unique across them', () => {
    const found = collectPipelineSteps({
      pipelines: { review: [{ name: 'check', prompt: 'a' }], deploy: [{ name: 'check', prompt: 'b' }] }
    })
    expect(found.map((s) => s.label)).toEqual(['deploy › check', 'review › check'])
  })

  it('falls back to a positional label when a pipeline step has no name', () => {
    const [s] = collectPipelineSteps({ pipelines: { review: [{ prompt: 'a' }] } })
    expect(s!.label).toBe('review › step 1')
  })

  it('keeps labels free of quotes, since callers wrap them in quotes', () => {
    // A label carrying its own quotes produced nested ones in every rendered finding.
    const found = collectPipelineSteps({ pipelines: { review: [{ name: 'ship', prompt: 'a' }] } })
    expect(found[0]!.label).not.toContain('"')
  })

  it('orders pipelines by name so findings do not shuffle when the file is reordered', () => {
    // Object key order is JSON file order; sorting keeps output stable across an edit
    // that only moved a pipeline.
    const a = collectPipelineSteps({ pipelines: { zebra: [{ prompt: 'z' }], alpha: [{ prompt: 'a' }] } })
    const b = collectPipelineSteps({ pipelines: { alpha: [{ prompt: 'a' }], zebra: [{ prompt: 'z' }] } })
    expect(a.map((s) => s.path)).toEqual(b.map((s) => s.path))
    expect(a.map((s) => s.path)).toEqual(['pipelines.alpha[0]', 'pipelines.zebra[0]'])
  })

  it('skips a pipeline whose value is not an array', () => {
    expect(collectPipelineSteps({ pipelines: { review: 'nope' } })).toEqual([])
  })
})

describe('collectAllSteps', () => {
  it('returns top-level steps first, then pipeline steps', () => {
    const recipe = {
      steps: [{ name: 'gather', prompt: 'a' }],
      pipelines: { review: [{ name: 'check', prompt: 'b' }] }
    }
    expect(paths(recipe)).toEqual(['steps[0]', 'pipelines.review[0]'])
    expect(labels(recipe)).toEqual(['gather', 'review › check'])
  })

  it('covers a recipe that keeps ALL its work in pipelines', () => {
    // The blind spot this module exists for: nothing in `steps`, everything in a
    // pipeline, previously scanned by nothing at all.
    const recipe = { steps: [], pipelines: { main: [{ prompt: 'a' }, { prompt: 'b' }] } }
    expect(collectAllSteps(recipe)).toHaveLength(2)
  })

  it('does not throw on an empty recipe', () => {
    expect(() => collectAllSteps({})).not.toThrow()
    expect(collectAllSteps({})).toEqual([])
  })
})
