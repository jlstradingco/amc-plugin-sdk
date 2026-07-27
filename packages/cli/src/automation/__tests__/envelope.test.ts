import { describe, it, expect } from 'vitest'
import { buildEnvelope, deriveAutomationId, AUTOMATION_CATEGORIES } from '../lib/envelope.js'

const recipe = {
  name: 'Daily Digest',
  description: 'posts a digest',
  steps: [{ name: 'a', prompt: 'go' }],
  executionMode: 'multi-session',
  scope: 'global',
  id: 'local-only-id',
  createdAt: '2020-01-01',
  homeProjectId: 'proj-1'
}
const opts = {
  automationId: 'daily-digest',
  version: '1.0.0',
  category: 'productivity' as const,
  changelog: 'first'
}

describe('deriveAutomationId', () => {
  it('kebab-cases a display name', () => {
    expect(deriveAutomationId('Daily Digest')).toBe('daily-digest')
  })

  it('strips punctuation and collapses separators', () => {
    expect(deriveAutomationId('My  Cool!! Recipe')).toBe('my-cool-recipe')
  })

  it('trims leading and trailing hyphens', () => {
    expect(deriveAutomationId('  --Hello--  ')).toBe('hello')
  })

  it('falls back for a name with no usable characters', () => {
    expect(deriveAutomationId('!!!')).toBe('automation')
    expect(deriveAutomationId('')).toBe('automation')
  })

  it('keeps digits', () => {
    expect(deriveAutomationId('Report 2026')).toBe('report-2026')
  })
})

describe('buildEnvelope', () => {
  it('stamps the schema version and recipe kind', () => {
    const env = buildEnvelope(recipe, opts)
    expect(env.definition.schemaVersion).toBe(1)
    expect(env.definition.kind).toBe('recipe')
  })

  it('carries the publish metadata through', () => {
    const env = buildEnvelope(recipe, opts)
    expect(env.automationId).toBe('daily-digest')
    expect(env.version).toBe('1.0.0')
    expect(env.category).toBe('productivity')
    expect(env.changelog).toBe('first')
  })

  it('keeps the shareable recipe fields', () => {
    const env = buildEnvelope(recipe, opts)
    expect(env.definition.name).toBe('Daily Digest')
    expect(env.definition.description).toBe('posts a digest')
    expect(env.definition.executionMode).toBe('multi-session')
    expect(env.definition.steps).toHaveLength(1)
  })

  it('drops local-only fields the importer must not receive', () => {
    const env = buildEnvelope(recipe, opts)
    // The allow-list means these can never travel, whatever the local file holds.
    expect(env.definition.id).toBeUndefined()
    expect(env.definition.createdAt).toBeUndefined()
    expect(env.definition.scope).toBeUndefined()
    expect(env.definition.homeProjectId).toBeUndefined()
  })

  it('drops any unknown field rather than passing it through', () => {
    const env = buildEnvelope({ ...recipe, somethingNew: 'x' }, opts)
    expect(env.definition.somethingNew).toBeUndefined()
  })

  it('defaults executionMode when the recipe omits it', () => {
    const { executionMode: _drop, ...noMode } = recipe
    expect(buildEnvelope(noMode, opts).definition.executionMode).toBe('multi-session')
  })

  it('preserves an explicit executionMode', () => {
    expect(buildEnvelope({ ...recipe, executionMode: 'parallel' }, opts).definition.executionMode)
      .toBe('parallel')
  })

  it('omits an absent optional field rather than writing undefined', () => {
    const env = buildEnvelope({ name: 'X', steps: [] }, opts)
    expect('description' in env.definition).toBe(false)
  })

  it('strips non-shareable fields from inside a top-level step', () => {
    // The top-level allow-list alone never protected this: `steps` was copied
    // verbatim, so anything an author's step carried was published.
    const env = buildEnvelope(
      { ...recipe, steps: [{ name: 'a', prompt: 'go', id: 'local', script: './x.sh' }] },
      opts
    )
    const [step] = env.definition.steps as Record<string, unknown>[]
    expect(step).toEqual({ name: 'a', prompt: 'go' })
  })

  it('strips non-shareable fields from inside a pipeline step', () => {
    const env = buildEnvelope(
      {
        ...recipe,
        pipelines: { review: [{ name: 'r', prompt: 'p', targetProjectId: 'proj-1' }] }
      },
      opts
    )
    const pipelines = env.definition.pipelines as Record<string, Record<string, unknown>[]>
    expect(pipelines.review).toEqual([{ name: 'r', prompt: 'p' }])
  })

  it('keeps every allow-listed step field', () => {
    const env = buildEnvelope(
      {
        ...recipe,
        steps: [
          {
            name: 'a',
            prompt: 'go',
            approvalGate: { message: 'ok?' },
            supervisor: { systemPrompt: 'watch' },
            timeoutMinutes: 5
          }
        ]
      },
      opts
    )
    const [step] = env.definition.steps as Record<string, unknown>[]
    expect(step).toEqual({
      name: 'a',
      prompt: 'go',
      approvalGate: { message: 'ok?' },
      supervisor: { systemPrompt: 'watch' },
      timeoutMinutes: 5
    })
  })

  it('leaves steps absent when the recipe has none, rather than inventing an array', () => {
    const { steps: _drop, ...noSteps } = recipe
    expect('steps' in buildEnvelope(noSteps, opts).definition).toBe(false)
  })

  it('leaves pipelines absent when the recipe has none', () => {
    expect('pipelines' in buildEnvelope(recipe, opts).definition).toBe(false)
  })

  it('normalizes a non-array steps field to an empty array', () => {
    // Reaching this needs --skip-validation (checkStructure errors on it first), but
    // the envelope must still emit a shape the server can parse rather than forwarding
    // whatever the file held.
    const env = buildEnvelope({ ...recipe, steps: 'nope' }, opts)
    expect(env.definition.steps).toEqual([])
  })

  it('does not mutate the caller\'s recipe while filtering', () => {
    const source = { ...recipe, steps: [{ name: 'a', prompt: 'go', script: './x.sh' }] }
    buildEnvelope(source, opts)
    expect(source.steps[0]!.script).toBe('./x.sh')
  })

  it('exposes the six categories', () => {
    expect([...AUTOMATION_CATEGORIES]).toEqual([
      'planning',
      'development',
      'testing',
      'devops',
      'productivity',
      'other'
    ])
  })
})
