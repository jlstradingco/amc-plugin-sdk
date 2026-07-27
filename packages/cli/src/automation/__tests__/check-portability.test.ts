import { describe, it, expect } from 'vitest'
import { checkPortability } from '../checks/portability.js'

const base = { name: 'r', steps: [{ name: 'a', prompt: 'go' }] }
const codes = (r: Record<string, unknown>): string[] => checkPortability(r).map((f) => f.code)

describe('checkPortability', () => {
  it('accepts a self-contained recipe', () => {
    expect(checkPortability(base)).toEqual([])
  })

  it('flags a project-scoped recipe', () => {
    expect(codes({ ...base, scope: 'project' })).toContain('project-scope')
  })

  it('accepts a global-scoped or unscoped recipe', () => {
    expect(codes({ ...base, scope: 'global' })).not.toContain('project-scope')
    expect(codes(base)).not.toContain('project-scope')
  })

  it('flags a sub-recipe step by either signal', () => {
    expect(codes({ ...base, steps: [{ name: 'a', kind: 'sub-recipe' }] })).toContain(
      'sub-recipe-step'
    )
    expect(codes({ ...base, steps: [{ name: 'a', subRecipe: { recipeId: 'x' } }] })).toContain(
      'sub-recipe-step'
    )
  })

  it('flags a script step by either signal', () => {
    expect(codes({ ...base, steps: [{ name: 'a', kind: 'script' }] })).toContain('script-step')
    expect(codes({ ...base, steps: [{ name: 'a', script: './run.sh' }] })).toContain('script-step')
  })

  it('flags a prompt read from a file', () => {
    expect(codes({ ...base, steps: [{ name: 'a', promptFile: './p.md' }] })).toContain('prompt-file')
  })

  it('flags a step pinned to a local project', () => {
    expect(codes({ ...base, steps: [{ name: 'a', targetProjectId: 'p1' }] })).toContain(
      'target-project'
    )
  })

  it('reports EVERY blocker in one pass, like AMC does', () => {
    const found = codes({
      ...base,
      scope: 'project',
      steps: [
        { name: 'a', script: './x.sh' },
        { name: 'b', promptFile: './p.md' },
        { name: 'c', targetProjectId: 'p1' },
        { name: 'd', subRecipe: { recipeId: 'z' } }
      ]
    })
    expect(found).toContain('project-scope')
    expect(found).toContain('script-step')
    expect(found).toContain('prompt-file')
    expect(found).toContain('target-project')
    expect(found).toContain('sub-recipe-step')
  })

  it('names the offending step and offers a remedy', () => {
    const found = checkPortability({ ...base, steps: [{ name: 'build', script: './x.sh' }] })
    expect(found[0]?.stepName).toBe('build')
    expect(found[0]?.fix).toBeTruthy()
  })

  it('falls back to a positional label for an unnamed step', () => {
    const found = checkPortability({ ...base, steps: [{ script: './x.sh' }] })
    expect(found[0]?.stepName).toBe('step 1')
  })

  it('does not double-report one step for a single cause', () => {
    const found = checkPortability({
      ...base,
      steps: [{ name: 'a', kind: 'script', script: './x.sh' }]
    })
    expect(found.filter((f) => f.code === 'script-step')).toHaveLength(1)
  })

  it('gives every finding a remedy', () => {
    const found = checkPortability({
      ...base,
      scope: 'project',
      steps: [{ name: 'a', script: './x.sh', promptFile: './p.md', targetProjectId: 'p' }]
    })
    for (const f of found) expect(f.fix, `${f.code} has no fix`).toBeTruthy()
  })

  // pipelines rides the publish envelope's allow-list, so anything in one is shipped.
  // Neither the CLI nor the server used to walk them, so a script step inside a
  // pipeline reached the marketplace with no warning from either side.
  describe('pipelines', () => {
    it('flags a script step inside a pipeline', () => {
      const found = checkPortability({
        ...base,
        pipelines: { review: [{ name: 'run', script: './local.sh' }] }
      })
      expect(found.map((f) => f.code)).toContain('script-step')
    })

    it('flags a sub-recipe step inside a pipeline', () => {
      const found = checkPortability({
        ...base,
        pipelines: { review: [{ name: 'call', kind: 'sub-recipe' }] }
      })
      expect(found.map((f) => f.code)).toContain('sub-recipe-step')
    })

    it('flags a promptFile and a targetProjectId inside a pipeline', () => {
      const found = checkPortability({
        ...base,
        pipelines: { review: [{ name: 'x', promptFile: './p.md', targetProjectId: 'p1' }] }
      })
      const codes = found.map((f) => f.code)
      expect(codes).toContain('prompt-file')
      expect(codes).toContain('target-project')
    })

    it('says which pipeline the step came from', () => {
      // A step name is not unique across pipelines, so "run" alone would be ambiguous.
      const found = checkPortability({
        ...base,
        pipelines: { review: [{ name: 'run', script: './local.sh' }] }
      })
      expect(found[0]?.stepName).toBe('run (in pipeline "review")')
      expect(found[0]?.message).toContain('review')
    })

    it('catches a recipe whose only nonportable step is in a pipeline', () => {
      // The exact shape that used to publish clean.
      const found = checkPortability({
        ...base,
        steps: [{ name: 'ok', prompt: 'fine' }],
        pipelines: { deploy: [{ name: 'ship', script: './deploy.sh' }] }
      })
      expect(found).toHaveLength(1)
      expect(found[0]?.code).toBe('script-step')
    })

    it('does not throw on malformed pipelines', () => {
      expect(() => checkPortability({ ...base, pipelines: 'nope' })).not.toThrow()
      expect(() => checkPortability({ ...base, pipelines: { a: 'nope' } })).not.toThrow()
      expect(() => checkPortability({ ...base, pipelines: { a: [null, 3] } })).not.toThrow()
    })
  })

  it('does not throw on malformed input', () => {
    expect(() => checkPortability({})).not.toThrow()
    expect(() => checkPortability({ steps: [null, 3] })).not.toThrow()
    expect(() => checkPortability({ steps: 'nope' })).not.toThrow()
  })
})
