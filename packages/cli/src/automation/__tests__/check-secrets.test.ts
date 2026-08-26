import { describe, it, expect } from 'vitest'
import { checkSecrets, checkTextSecrets } from '../checks/secrets.js'

const withPrompt = (prompt: string): Record<string, unknown> => ({
  name: 'r',
  steps: [{ name: 'a', prompt }]
})
const codes = (r: Record<string, unknown>): string[] => checkSecrets(r).map((f) => f.code)

describe('checkSecrets', () => {
  it('accepts clean prose', () => {
    expect(checkSecrets(withPrompt('Summarize yesterday and post it to the channel.'))).toEqual([])
  })

  it('flags an Anthropic-shaped key', () => {
    expect(codes(withPrompt('use sk-ant-api03-AAAAAAAABBBBBBBB'))).toContain('possible-secret')
  })

  it('flags a GitHub token', () => {
    expect(codes(withPrompt('token ghp_AAAAAAAAAAAAAAAAAAAAAAAA'))).toContain('possible-secret')
  })

  it('flags a GitHub fine-grained token', () => {
    expect(codes(withPrompt('github_pat_AAAAAAAAAAAAAAAAAAAAAA'))).toContain('possible-secret')
  })

  it('flags a Google API key', () => {
    expect(codes(withPrompt('key AIzaSyAAAAAAAAAAAAAAAAAAAAAAAA'))).toContain('possible-secret')
  })

  it('flags a Slack token', () => {
    expect(codes(withPrompt('xoxb-AAAAAAAAAAAA-BBBB'))).toContain('possible-secret')
  })

  it('flags an AWS access key', () => {
    expect(codes(withPrompt('AKIAIOSFODNN7EXAMPLE'))).toContain('possible-secret')
  })

  it('flags a bearer token', () => {
    expect(codes(withPrompt('Bearer abcdefghij0123456789'))).toContain('possible-secret')
  })

  it('flags a key: value secret assignment', () => {
    expect(codes(withPrompt('api_key = "abcdefghijkl1234"'))).toContain('possible-secret')
    expect(codes(withPrompt('password: hunter2hunter2hunter2'))).toContain('possible-secret')
  })

  it('flags an absolute Windows user path', () => {
    expect(codes(withPrompt('read C:\\Users\\jeph\\notes.md'))).toContain('possible-secret')
  })

  it('flags an absolute POSIX user path', () => {
    expect(codes(withPrompt('read /home/jeph/notes.md'))).toContain('possible-secret')
    expect(codes(withPrompt('read /Users/jeph/notes.md'))).toContain('possible-secret')
  })

  it('scans the description as well as step prompts', () => {
    expect(
      codes({ name: 'r', description: 'ghp_AAAAAAAAAAAAAAAAAAAAAAAA', steps: [] })
    ).toContain('possible-secret')
  })

  it('scans runLabel and exitMessage', () => {
    expect(codes({ name: 'r', runLabel: 'ghp_AAAAAAAAAAAAAAAAAAAAAAAA', steps: [] })).toContain(
      'possible-secret'
    )
    expect(
      codes({
        name: 'r',
        steps: [{ name: 'a', prompt: 'ok', exitMessage: 'ghp_AAAAAAAAAAAAAAAAAAAAAAAA' }]
      })
    ).toContain('possible-secret')
  })

  it('reports WARNINGS, never errors — a false positive must not block a publish', () => {
    const found = checkSecrets(withPrompt('ghp_AAAAAAAAAAAAAAAAAAAAAAAA'))
    expect(found.length).toBeGreaterThan(0)
    expect(found.every((f) => f.severity === 'warning')).toBe(true)
  })

  it('names where it found the match', () => {
    const found = checkSecrets(withPrompt('ghp_AAAAAAAAAAAAAAAAAAAAAAAA'))
    expect(found[0]?.message).toContain('steps[0].prompt')
    expect(found[0]?.stepName).toBe('a')
  })

  // AMC's own share-time scanner has always walked pipelines; the CLI did not, so a
  // key pasted into a pipeline prompt was published with no warning.
  describe('pipelines', () => {
    it('flags a secret in a pipeline prompt', () => {
      const found = checkSecrets({
        pipelines: { review: [{ name: 'check', prompt: 'use ghp_AAAAAAAAAAAAAAAAAAAAAAAA' }] }
      })
      expect(found.map((f) => f.code)).toContain('possible-secret')
    })

    it('flags a secret in a pipeline exitMessage', () => {
      const found = checkSecrets({
        pipelines: { review: [{ name: 'check', exitMessage: 'token ghp_AAAAAAAAAAAAAAAAAAAAAAAA' }] }
      })
      expect(found.map((f) => f.code)).toContain('possible-secret')
    })

    it('paths the match inside the pipeline', () => {
      const found = checkSecrets({
        pipelines: { review: [{ prompt: 'ghp_AAAAAAAAAAAAAAAAAAAAAAAA' }] }
      })
      expect(found[0]?.message).toContain('pipelines.review[0].prompt')
    })

    it('stays advisory — a pipeline secret warns, it never blocks', () => {
      const found = checkSecrets({
        pipelines: { review: [{ prompt: 'ghp_AAAAAAAAAAAAAAAAAAAAAAAA' }] }
      })
      expect(found.every((f) => f.severity === 'warning')).toBe(true)
    })

    it('does not throw on malformed pipelines', () => {
      expect(() => checkSecrets({ pipelines: 'nope' })).not.toThrow()
      expect(() => checkSecrets({ pipelines: { a: [null, 3] } })).not.toThrow()
    })
  })

  // The scan is driven off the publish envelope's allow-list, so it covers exactly what a
  // publish ships. Naming fields by hand reached description and runLabel only.
  describe('the rest of the shareable envelope', () => {
    const KEY = 'ghp_AAAAAAAAAAAAAAAAAAAAAAAA'

    it('flags a secret in a parameter default', () => {
      const found = checkSecrets({ parameters: [{ name: 'token', default: KEY }] })
      expect(found.map((f) => f.code)).toContain('possible-secret')
      expect(found[0]?.message).toContain('parameters[0].default')
    })

    it('flags a secret in onComplete', () => {
      const found = checkSecrets({ onComplete: { notify: `Bearer ${KEY}` } })
      expect(found).toHaveLength(1)
      expect(found[0]?.message).toContain('onComplete.notify')
    })

    it('flags a secret in a supervisor prompt', () => {
      const found = checkSecrets({ supervisors: [{ prompt: `use ${KEY}` }] })
      expect(found).toHaveLength(1)
      expect(found[0]?.message).toContain('supervisors[0].prompt')
    })

    it('flags an absolute user path in the name', () => {
      const found = checkSecrets({ name: 'Digest for C:\\Users\\jordan' })
      expect(found[0]?.message).toContain('name')
      expect(found[0]?.message).toContain('Windows user path')
    })

    it('descends through nested objects and arrays', () => {
      const found = checkSecrets({ parameters: { outer: { inner: [{ deep: KEY }] } } })
      expect(found).toHaveLength(1)
      expect(found[0]?.message).toContain('parameters.outer.inner[0].deep')
    })

    it('stops descending at the depth guard rather than recursing forever', () => {
      // 12 levels deep — past MAX_SCAN_DEPTH, so the value is not reached and, more to
      // the point, the walk terminates.
      let nested: Record<string, unknown> = { leaf: KEY }
      for (let i = 0; i < 12; i++) nested = { down: nested }
      expect(() => checkSecrets({ parameters: nested })).not.toThrow()
      expect(checkSecrets({ parameters: nested })).toEqual([])
    })

    it('ignores non-string leaves', () => {
      expect(checkSecrets({ maxRetries: 3, resumable: true, totalBudget: null })).toEqual([])
    })

    it('never reads a field the envelope would not ship', () => {
      // `scope` is local-only and deliberately absent from SHAREABLE_FIELDS, so a path
      // sitting in it is not the author's problem — it never travels.
      expect(checkSecrets({ scope: 'C:\\Users\\jordan\\projects' })).toEqual([])
    })

    it('stays advisory for every one of them', () => {
      const found = checkSecrets({
        parameters: [{ default: KEY }],
        onComplete: { notify: KEY },
        supervisors: [{ prompt: KEY }]
      })
      expect(found.length).toBeGreaterThan(0)
      expect(found.every((f) => f.severity === 'warning')).toBe(true)
    })

    it('does not double-report a step, which is walked with its own label', () => {
      const found = checkSecrets({ steps: [{ name: 'a', prompt: KEY }] })
      expect(found).toHaveLength(1)
      expect(found[0]?.message).toContain('steps[0].prompt')
    })
  })

  // A step is swept through the step-level allow-list too, so the scan covers every
  // field a step publishes. Naming `prompt` and `exitMessage` by hand missed the two
  // fields below, which AMC's own share-time scanner has always checked.
  describe('the rest of the shareable step', () => {
    const KEY = 'ghp_AAAAAAAAAAAAAAAAAAAAAAAA'

    it('flags a secret in an approval gate message', () => {
      const found = checkSecrets({ steps: [{ name: 'ship', approvalGate: { message: KEY } }] })
      expect(found).toHaveLength(1)
      expect(found[0]?.message).toContain('steps[0].approvalGate.message')
      expect(found[0]?.stepName).toBe('ship')
    })

    it('flags a secret in a per-step supervisor prompt', () => {
      const found = checkSecrets({
        steps: [{ name: 'watch', supervisor: { systemPrompt: `auth with ${KEY}` } }]
      })
      expect(found).toHaveLength(1)
      expect(found[0]?.message).toContain('steps[0].supervisor.systemPrompt')
      expect(found[0]?.stepName).toBe('watch')
    })

    it('flags a secret in a step exit message, as before', () => {
      const found = checkSecrets({ steps: [{ name: 'a', exitMessage: KEY }] })
      expect(found).toHaveLength(1)
      expect(found[0]?.message).toContain('steps[0].exitMessage')
    })

    it('flags the same fields inside a pipeline step', () => {
      const found = checkSecrets({
        pipelines: { review: [{ name: 'r', approvalGate: { message: KEY } }] }
      })
      expect(found).toHaveLength(1)
      expect(found[0]?.message).toContain('pipelines.review[0].approvalGate.message')
      expect(found[0]?.stepName).toBe('r')
    })

    it('never scans a step field the envelope would strip', () => {
      // `script` does not travel, so a key sitting in it is not a publication risk —
      // and `checkPortability` already blocks the step outright for a better reason.
      const found = checkSecrets({ steps: [{ name: 'a', prompt: 'clean', script: KEY }] })
      expect(found).toEqual([])
    })

    it('does not scan an unknown local step field', () => {
      const found = checkSecrets({ steps: [{ name: 'a', prompt: 'clean', localNote: KEY }] })
      expect(found).toEqual([])
    })

    it('reports each offending field separately', () => {
      const found = checkSecrets({
        steps: [{ name: 'a', prompt: KEY, exitMessage: KEY, approvalGate: { message: KEY } }]
      })
      expect(found).toHaveLength(3)
      expect(found.every((f) => f.severity === 'warning')).toBe(true)
      expect(found.every((f) => f.stepName === 'a')).toBe(true)
    })

    it('labels an unnamed step positionally rather than dropping the location', () => {
      const found = checkSecrets({ steps: [{ approvalGate: { message: KEY } }] })
      expect(found).toHaveLength(1)
      // No declared name, so no stepName rides along — the path still pinpoints it.
      expect(found[0]?.stepName).toBeUndefined()
      expect(found[0]?.message).toContain('steps[0].approvalGate.message')
    })
  })

  it('does not throw on malformed input', () => {
    expect(() => checkSecrets({})).not.toThrow()
    expect(() => checkSecrets({ steps: [null, 3], description: 42 })).not.toThrow()
    expect(() => checkSecrets({ steps: 'nope' })).not.toThrow()
  })
})

// F065: a standalone text field (the --changelog flag) publishes alongside the recipe
// but is never merged into it, so it is scanned on its own with the same patterns.
describe('checkTextSecrets', () => {
  it('flags a secret in a standalone text field, labelled by the given path', () => {
    const found = checkTextSecrets('changelog', 'rotated ghp_AAAAAAAAAAAAAAAAAAAAAAAA today')
    expect(found).toHaveLength(1)
    expect(found[0]?.code).toBe('possible-secret')
    expect(found[0]?.severity).toBe('warning')
    expect(found[0]?.message).toContain('changelog')
  })

  it('accepts clean changelog prose', () => {
    expect(checkTextSecrets('changelog', 'Fixed the retry loop and tidied the output.')).toEqual([])
  })

  it('returns nothing for an absent or empty field', () => {
    expect(checkTextSecrets('changelog', undefined)).toEqual([])
    expect(checkTextSecrets('changelog', null)).toEqual([])
    expect(checkTextSecrets('changelog', '')).toEqual([])
  })
})
