import type { Finding } from '../lib/findings.js'
import { collectAllSteps, collectMalformedSteps } from '../lib/recipe-steps.js'

/**
 * Step-level checks that mirror AMC's own pre-flight gates (checks 3 and 4 in
 * RECIPE_AUTHORING_GUIDE §8). A recipe that fails these is published but can
 * never RUN, which is the worst outcome available — a listing that does nothing.
 *
 * Walks pipeline steps as well as top-level ones. This check used to read
 * `recipe.steps` directly while its siblings went through `collectAllSteps`, so an
 * empty prompt inside a pipeline published clean and then could not run — exactly
 * the outcome the paragraph above calls the worst available. `recipe-steps.ts` says
 * every check that reasons about steps goes through it; this one now does.
 */
export function checkSteps(recipe: Record<string, unknown>): Finding[] {
  const findings: Finding[] = []

  // An entry that is not a step at all — a stray `null`, a bare string left behind by
  // a hand edit. The step collectors SKIP these so a malformed entry cannot renumber
  // the steps around it, which meant nothing reported them and the publish envelope
  // then dropped them without a word: the automation quietly lost a step somewhere
  // between the author's file and the catalog. An error, because the shipped
  // automation would not be the one they wrote.
  for (const path of collectMalformedSteps(recipe)) {
    findings.push({
      severity: 'error',
      code: 'malformed-step',
      message: `${path} is not a step, so it would be dropped from the published automation.`,
      fix: 'Make it an object with a "name" and a "prompt", or remove the entry.'
    })
  }

  for (const { step: s, label, declaredName } of collectAllSteps(recipe)) {
    // The label already names the step — or its position, and the pipeline it came
    // from when it has one — so it carries the location without a repeated suffix.
    const at = { stepName: label }

    if (declaredName === undefined) {
      findings.push({
        severity: 'error',
        code: 'unnamed-step',
        message: `"${label}" has no name.`,
        ...at,
        fix: 'Give every step a short "name" so failures can be traced to it.'
      })
    }

    const prompt = s.prompt
    const hasPrompt = typeof prompt === 'string' && prompt.trim().length > 0
    if (!hasPrompt) {
      findings.push({
        severity: 'error',
        code: 'empty-prompt',
        message: `"${label}" has no prompt, so this automation cannot run.`,
        ...at,
        fix: 'Add a non-empty "prompt". AMC blocks the run on an empty one.'
      })
    }
  }

  return findings
}
