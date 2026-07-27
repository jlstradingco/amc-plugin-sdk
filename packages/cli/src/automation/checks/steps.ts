import type { Finding } from '../lib/findings.js'

/**
 * Step-level checks that mirror AMC's own pre-flight gates (checks 3 and 4 in
 * RECIPE_AUTHORING_GUIDE §8). A recipe that fails these is published but can
 * never RUN, which is the worst outcome available — a listing that does nothing.
 */
export function checkSteps(recipe: Record<string, unknown>): Finding[] {
  const steps = recipe.steps
  if (!Array.isArray(steps)) return []

  const findings: Finding[] = []

  steps.forEach((step, index) => {
    if (typeof step !== 'object' || step === null) return
    const s = step as Record<string, unknown>
    const name = typeof s.name === 'string' && s.name.trim() ? s.name : undefined

    if (!name) {
      findings.push({
        severity: 'error',
        code: 'unnamed-step',
        message: `Step ${index + 1} has no name.`,
        fix: 'Give every step a short "name" so failures can be traced to it.'
      })
    }

    const prompt = s.prompt
    const hasPrompt = typeof prompt === 'string' && prompt.trim().length > 0
    if (!hasPrompt) {
      findings.push({
        severity: 'error',
        code: 'empty-prompt',
        message: `Step ${index + 1} has no prompt, so this automation cannot run.`,
        ...(name ? { stepName: name } : {}),
        fix: 'Add a non-empty "prompt". AMC blocks the run on an empty one.'
      })
    }
  })

  return findings
}
