import type { Finding } from '../lib/findings.js'
import { collectAllSteps } from '../lib/recipe-steps.js'

/**
 * Does this recipe depend on anything the importer will not have?
 *
 * A simplified re-implementation of AMC's assessRecipePortability — the SPIRIT, not
 * the letter. The server decides whether a publish succeeds; this exists to fail the
 * hopeless cases locally rather than spend an upload slot discovering them.
 *
 * DELIBERATELY STRICTER THAN THE SERVER on one axis, and it is worth being explicit
 * about it. Both AMC's own share gate and the marketplace validator walk the
 * top-level `steps` array only, so a script or sub-recipe step inside a PIPELINE is
 * accepted by both — while `pipelines` rides the publish envelope's allow-list, so
 * the step really does travel, and really is unrunnable for whoever imports it. The
 * choice here is to block it: an automation that installs and then cannot run is a
 * worse outcome for the importer than a publish the author has to think about, and
 * `--skip-validation` remains the documented way past a local error.
 *
 * The consequence to keep in mind when reading a finding from this module: an error
 * here does NOT imply the server would have refused the submission.
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

  for (const { step: s, label } of collectAllSteps(recipe)) {
    const at = { stepName: label }

    if (s.kind === 'sub-recipe' || s.subRecipe) {
      findings.push({
        severity: 'error',
        code: 'sub-recipe-step',
        message: `"${label}" calls another recipe, which the person importing will not have.`,
        ...at,
        fix: 'Inline the sub-recipe steps, or split it into its own published automation.'
      })
    }

    if (s.kind === 'script' || s.script) {
      findings.push({
        severity: 'error',
        code: 'script-step',
        message: `"${label}" runs a local script that only exists on your machine.`,
        ...at,
        fix: 'Replace it with a prompt step, or drop it before publishing.'
      })
    }

    if (s.promptFile) {
      findings.push({
        severity: 'error',
        code: 'prompt-file',
        message: `"${label}" reads its prompt from a file on disk.`,
        ...at,
        fix: 'Inline the prompt text into the step so it travels with the automation.'
      })
    }

    if (s.targetProjectId) {
      findings.push({
        severity: 'error',
        code: 'target-project',
        message: `"${label}" is pinned to a specific local project.`,
        ...at,
        fix: 'Remove "targetProjectId" so the importer picks their own project.'
      })
    }
  }

  return findings
}
