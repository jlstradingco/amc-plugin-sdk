import type { Finding } from '../lib/findings.js'
import { checkStructure } from './structure.js'
import { checkSteps } from './steps.js'
import { checkPortability } from './portability.js'
import { checkSecrets } from './secrets.js'
import { checkLimits } from './limits.js'
import { checkStrippedFields } from './stripped-fields.js'

export {
  checkStructure,
  checkSteps,
  checkPortability,
  checkSecrets,
  checkLimits,
  checkStrippedFields
}
export { SCHEMA_VERSION, EXECUTION_MODES } from './structure.js'

const SEVERITY_ORDER = { error: 0, warning: 1, info: 2 } as const

/**
 * Every local check, in one pass. Errors sort first so the problems that block a
 * publish read before the advisory ones.
 *
 * `sort` is stable in every engine this CLI runs on (V8 since Node 11), so findings
 * of equal severity keep the order the checks produced them in — which is the order
 * the author's file reads in. Without that, output would shuffle between runs for no
 * reason the author could see.
 */
export function runAllChecks(recipe: Record<string, unknown>): Finding[] {
  const findings = [
    ...checkStructure(recipe),
    ...checkSteps(recipe),
    ...checkPortability(recipe),
    ...checkSecrets(recipe),
    ...checkLimits(recipe),
    ...checkStrippedFields(recipe)
  ]
  return findings.sort((a, b) => SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity])
}
