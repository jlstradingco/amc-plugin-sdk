import { describe, it, expect } from 'vitest'
import { buildTemplateRecipe, buildTemplateReadme } from '../lib/template.js'
import { runAllChecks } from '../checks/index.js'

const opts = { name: 'Daily Digest', description: 'a digest', category: 'productivity' as const }

describe('buildTemplateRecipe', () => {
  it('produces a recipe that passes every local check with ZERO findings', () => {
    // The scaffold guarantee: init -> validate must be clean, or the template is
    // wrong. This assertion is what makes that a promise rather than a hope.
    expect(runAllChecks(buildTemplateRecipe(opts))).toEqual([])
  })

  it('raises no advisory either, not just no errors', () => {
    // The zero-findings assertion above already covers this, but it is worth pinning
    // separately: an INFO line on a freshly scaffolded file would train authors to
    // ignore the advisory channel before they have ever seen it matter. The template's
    // `scope` is the interesting case — it is dropped from the envelope, and stays
    // quiet only because it is on the expected-local list.
    const findings = runAllChecks(buildTemplateRecipe(opts))
    expect(findings.filter((f) => f.severity === 'info')).toEqual([])
  })

  it('survives a name that reaches the id length limits', () => {
    // `init` derives the marketplace id from the name, and both ends of the id range
    // are reachable from a name the other checks accept.
    const long = 'A'.repeat(64)
    expect(runAllChecks(buildTemplateRecipe({ ...opts, name: long }))).toEqual([])
  })

  it('stamps the schema version and a global scope', () => {
    const r = buildTemplateRecipe(opts)
    expect(r.schemaVersion).toBe(1)
    expect(r.scope).toBe('global')
  })

  it('ships real prompts, never TODO placeholders', () => {
    const steps = buildTemplateRecipe(opts).steps as Array<Record<string, unknown>>
    expect(steps.length).toBeGreaterThanOrEqual(2)
    for (const s of steps) {
      expect(String(s.prompt).trim().length).toBeGreaterThan(20)
      expect(String(s.prompt)).not.toMatch(/TODO|FIXME|TBD/)
    }
  })

  it('names every step', () => {
    const steps = buildTemplateRecipe(opts).steps as Array<Record<string, unknown>>
    for (const s of steps) expect(String(s.name).trim().length).toBeGreaterThan(0)
  })

  it('carries the caller name and description', () => {
    const r = buildTemplateRecipe(opts)
    expect(r.name).toBe('Daily Digest')
    expect(r.description).toBe('a digest')
  })

  it('declares a valid execution mode', () => {
    expect(buildTemplateRecipe(opts).executionMode).toBe('multi-session')
  })
})

describe('buildTemplateReadme', () => {
  it('names the file and the next commands', () => {
    const readme = buildTemplateReadme({
      name: 'Daily Digest',
      fileName: 'daily-digest.recipe.json'
    })
    expect(readme).toContain('Daily Digest')
    expect(readme).toContain('daily-digest.recipe.json')
    expect(readme).toContain('amc-automation validate')
    expect(readme).toContain('amc-automation publish')
  })

  it('explains that an installed automation arrives paused', () => {
    const readme = buildTemplateReadme({ name: 'X', fileName: 'x.recipe.json' })
    expect(readme.toLowerCase()).toContain('paused')
  })
})
