import type { Finding } from '../lib/findings.js'

/**
 * Does this recipe depend on anything the importer will not have?
 *
 * A simplified re-implementation of AMC's assessRecipePortability — the SPIRIT,
 * not the letter. It is deliberately NOT a mirror: the server decides whether a
 * publish succeeds, so the worst this can do is miss a warning (spec §4). Every
 * finding names a remedy, because "not portable" without one is a dead end.
 */
export function checkPortability(recipe: Record<string, unknown>): Finding[] {
  const findings: Finding[] = []

  if (recipe.scope === 'project') {
    findings.push({
      severity: 'error',
      code: 'project-scope',
      message: 'This automation is tied to one local project, so it cannot be shared.',
      fix: 'Set "scope": "global" (or remove the field) and drop any per-project pins.'
    })
  }

  const steps = Array.isArray(recipe.steps) ? recipe.steps : []
  for (const [index, step] of steps.entries()) {
    if (typeof step !== 'object' || step === null) continue
    const s = step as Record<string, unknown>
    const name = typeof s.name === 'string' && s.name.trim() ? s.name : `step ${index + 1}`
    const at = { stepName: name }

    if (s.kind === 'sub-recipe' || s.subRecipe) {
      findings.push({
        severity: 'error',
        code: 'sub-recipe-step',
        message: `"${name}" calls another recipe, which the person importing will not have.`,
        ...at,
        fix: 'Inline the sub-recipe steps, or split it into its own published automation.'
      })
    }

    if (s.kind === 'script' || s.script) {
      findings.push({
        severity: 'error',
        code: 'script-step',
        message: `"${name}" runs a local script that only exists on your machine.`,
        ...at,
        fix: 'Replace it with a prompt step, or drop it before publishing.'
      })
    }

    if (s.promptFile) {
      findings.push({
        severity: 'error',
        code: 'prompt-file',
        message: `"${name}" reads its prompt from a file on disk.`,
        ...at,
        fix: 'Inline the prompt text into the step so it travels with the automation.'
      })
    }

    if (s.targetProjectId) {
      findings.push({
        severity: 'error',
        code: 'target-project',
        message: `"${name}" is pinned to a specific local project.`,
        ...at,
        fix: 'Remove "targetProjectId" so the importer picks their own project.'
      })
    }
  }

  return findings
}
