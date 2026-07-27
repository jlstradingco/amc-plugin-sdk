import { describe, it, expect } from 'vitest'
import { runAllChecks, SCHEMA_VERSION, EXECUTION_MODES } from '../checks/index.js'

describe('runAllChecks', () => {
  it('returns nothing for a clean recipe', () => {
    expect(
      runAllChecks({
        name: 'ok',
        executionMode: 'multi-session',
        steps: [{ name: 'a', prompt: 'go' }]
      })
    ).toEqual([])
  })

  it('aggregates findings from every check module', () => {
    const codes = runAllChecks({
      name: '',
      scope: 'project',
      steps: [{ name: 'a', prompt: '', script: './x.sh' }],
      description: 'ghp_AAAAAAAAAAAAAAAAAAAAAAAA'
    }).map((f) => f.code)
    expect(codes).toContain('missing-name') // structure
    expect(codes).toContain('empty-prompt') // steps
    expect(codes).toContain('project-scope') // portability
    expect(codes).toContain('possible-secret') // secrets
  })

  it('orders errors before warnings so the blocking problems read first', () => {
    const found = runAllChecks({
      name: '',
      steps: [],
      description: 'ghp_AAAAAAAAAAAAAAAAAAAAAAAA'
    })
    const firstWarning = found.findIndex((f) => f.severity === 'warning')
    const lastError = found.map((f) => f.severity).lastIndexOf('error')
    expect(firstWarning).toBeGreaterThan(-1)
    expect(lastError).toBeLessThan(firstWarning)
  })

  it('re-exports the shared constants so callers have one import site', () => {
    expect(SCHEMA_VERSION).toBe(1)
    expect([...EXECUTION_MODES]).toEqual(['multi-session', 'same-session', 'parallel'])
  })

  it('does not throw on empty input', () => {
    expect(() => runAllChecks({})).not.toThrow()
  })
})
