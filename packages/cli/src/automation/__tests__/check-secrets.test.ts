import { describe, it, expect } from 'vitest'
import { checkSecrets } from '../checks/secrets.js'

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

  it('does not throw on malformed input', () => {
    expect(() => checkSecrets({})).not.toThrow()
    expect(() => checkSecrets({ steps: [null, 3], description: 42 })).not.toThrow()
    expect(() => checkSecrets({ steps: 'nope' })).not.toThrow()
  })
})
