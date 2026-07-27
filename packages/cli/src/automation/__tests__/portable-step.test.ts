import { describe, it, expect } from 'vitest'
import {
  SHAREABLE_STEP_FIELDS,
  pickPortableStep,
  pickPortableSteps,
  pickPortablePipelines,
  collectStrippedStepFields
} from '../lib/portable-step.js'

describe('SHAREABLE_STEP_FIELDS', () => {
  it('mirrors the host STEP_ALLOW_LIST exactly, in order', () => {
    // Pinned against Agent Orchestrator src/shared/automation-share.ts. This list is
    // vendored because the CLI cannot import the host's types, so nothing but this
    // assertion stands between a host change and a silently stale allow-list. Update
    // it only after re-deriving from STEP_ALLOW_LIST itself.
    expect([...SHAREABLE_STEP_FIELDS]).toEqual([
      'name',
      'prompt',
      'kind',
      'followUp',
      'waitForPrevious',
      'injectPriorOutputs',
      'serialDispatch',
      'waveMaxConcurrent',
      'waveMaxRetries',
      'setsVars',
      'runWhen',
      'exitWhen',
      'exitMessage',
      'onError',
      'forEach',
      'approvalGate',
      'output',
      'expand',
      'supervisor',
      'completionCheck',
      'timeoutMinutes'
    ])
  })

  it('pins the field count so a silent shrink is a reviewed change', () => {
    expect(SHAREABLE_STEP_FIELDS.length).toBe(21)
  })

  it('has no duplicates', () => {
    expect(new Set<string>(SHAREABLE_STEP_FIELDS).size).toBe(SHAREABLE_STEP_FIELDS.length)
  })

  it('names the four non-portable fields nowhere in the list', () => {
    // These are the fields the server explicitly refuses. They must never be
    // reachable through the allow-list, independent of the local portability check.
    for (const banned of ['script', 'subRecipe', 'promptFile', 'targetProjectId']) {
      expect(SHAREABLE_STEP_FIELDS as readonly string[]).not.toContain(banned)
    }
  })
})

describe('pickPortableStep', () => {
  it('keeps every allow-listed field', () => {
    const step = {
      name: 'gather',
      prompt: 'do the thing',
      kind: 'prompt',
      followUp: true,
      waitForPrevious: false,
      injectPriorOutputs: true,
      serialDispatch: false,
      waveMaxConcurrent: 2,
      waveMaxRetries: 1,
      setsVars: ['x'],
      runWhen: 'always',
      exitWhen: 'never',
      exitMessage: 'done',
      onError: 'continue',
      forEach: 'items',
      approvalGate: { message: 'ok?' },
      output: 'text',
      expand: false,
      supervisor: { systemPrompt: 'watch' },
      completionCheck: 'auto',
      timeoutMinutes: 5
    }
    expect(pickPortableStep(step)).toEqual(step)
  })

  it('drops a local script reference', () => {
    const out = pickPortableStep({ name: 'ship', prompt: 'x', script: './deploy.sh' })
    expect(out).toEqual({ name: 'ship', prompt: 'x' })
    expect(out.script).toBeUndefined()
  })

  it('drops local identity and project pins', () => {
    const out = pickPortableStep({
      name: 'a',
      prompt: 'b',
      id: 'step_01H9',
      targetProjectId: 'proj_local',
      homeProjectId: 'proj_local',
      subRecipe: 'other-recipe',
      promptFile: '/Users/jo/prompt.txt'
    })
    expect(out).toEqual({ name: 'a', prompt: 'b' })
  })

  it('drops an unknown field the allow-list has never heard of', () => {
    // The whole point of an allow-list: a field nobody predicted still does not travel.
    const out = pickPortableStep({ name: 'a', prompt: 'b', someFutureLocalField: 'secret' })
    expect(out).toEqual({ name: 'a', prompt: 'b' })
  })

  it('omits an explicitly undefined allow-listed field rather than emitting a key', () => {
    const out = pickPortableStep({ name: 'a', prompt: 'b', exitMessage: undefined })
    expect(Object.prototype.hasOwnProperty.call(out, 'exitMessage')).toBe(false)
  })

  it('keeps a null value on an allow-listed field', () => {
    // null is a value the author wrote, not an absent field — only `undefined` means absent.
    expect(pickPortableStep({ name: 'a', prompt: null })).toEqual({ name: 'a', prompt: null })
  })

  it('does not throw on a step with no name', () => {
    // The host's version throws here; this one must not. `checkSteps` already reports
    // an unnamed step as an error, and --skip-validation is a documented way past it,
    // so a stack trace would replace a clear finding with a crash.
    expect(() => pickPortableStep({ prompt: 'x' })).not.toThrow()
    expect(pickPortableStep({ prompt: 'x' })).toEqual({ prompt: 'x' })
  })

  it('returns a new object rather than mutating the input', () => {
    const step = { name: 'a', prompt: 'b', script: './x.sh' }
    const out = pickPortableStep(step)
    expect(out).not.toBe(step)
    expect(step.script).toBe('./x.sh')
  })
})

describe('pickPortableSteps', () => {
  it('returns an empty array for a non-array', () => {
    expect(pickPortableSteps(undefined)).toEqual([])
    expect(pickPortableSteps('nope')).toEqual([])
    expect(pickPortableSteps({ steps: [] })).toEqual([])
  })

  it('filters every step in the array', () => {
    expect(
      pickPortableSteps([
        { name: 'a', prompt: '1', script: './x' },
        { name: 'b', prompt: '2', targetProjectId: 'p' }
      ])
    ).toEqual([
      { name: 'a', prompt: '1' },
      { name: 'b', prompt: '2' }
    ])
  })

  it('skips malformed entries instead of emitting an empty step', () => {
    // An empty object would be published as a nameless, promptless step. Dropping it
    // is the honest outcome; `checkSteps` reports the malformed entry separately so
    // the author is told rather than left to notice a missing step.
    expect(pickPortableSteps([null, { name: 'a', prompt: '1' }, 'x', 42])).toEqual([
      { name: 'a', prompt: '1' }
    ])
  })
})

describe('pickPortablePipelines', () => {
  it('returns an empty object for a non-object', () => {
    expect(pickPortablePipelines(undefined)).toEqual({})
    expect(pickPortablePipelines([])).toEqual({})
    expect(pickPortablePipelines('nope')).toEqual({})
  })

  it('filters the steps of every pipeline, preserving the keys', () => {
    expect(
      pickPortablePipelines({
        review: [{ name: 'r', prompt: 'p', script: './s' }],
        ship: [{ name: 's', prompt: 'q', id: 'local' }]
      })
    ).toEqual({
      review: [{ name: 'r', prompt: 'p' }],
      ship: [{ name: 's', prompt: 'q' }]
    })
  })

  it('drops a pipeline whose value is not an array', () => {
    expect(pickPortablePipelines({ good: [{ name: 'a', prompt: 'b' }], bad: 'nope' })).toEqual({
      good: [{ name: 'a', prompt: 'b' }]
    })
  })

  it('keeps an empty pipeline as an empty array', () => {
    expect(pickPortablePipelines({ empty: [] })).toEqual({ empty: [] })
  })
})

describe('collectStrippedStepFields', () => {
  it('returns nothing when every field is shareable', () => {
    expect(collectStrippedStepFields([{ name: 'a', prompt: 'b' }])).toEqual([])
  })

  it('names each stripped field once, sorted', () => {
    expect(
      collectStrippedStepFields([
        { name: 'a', prompt: 'b', script: './x', id: '1' },
        { name: 'c', prompt: 'd', script: './y', homeProjectId: 'p' }
      ])
    ).toEqual(['homeProjectId', 'id', 'script'])
  })

  it('reports a field whose value is undefined', () => {
    // `pickPortableStep` would not have copied it either way, but the author still
    // wrote the key, and naming it is how they learn it is not a shareable field.
    expect(collectStrippedStepFields([{ name: 'a', someLocalThing: undefined }])).toEqual([
      'someLocalThing'
    ])
  })

  it('handles an empty collection', () => {
    expect(collectStrippedStepFields([])).toEqual([])
  })
})
