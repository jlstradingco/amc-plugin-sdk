import type { Finding } from '../lib/findings.js'
import { checkStructure } from './structure.js'
import { checkSteps } from './steps.js'
import { checkPortability } from './portability.js'
import { checkSecrets } from './secrets.js'

export { checkStructure, checkSteps, checkPortability, checkSecrets }
export { SCHEMA_VERSION, EXECUTION_MODES } from './structure.js'

const SEVERITY_ORDER = { error: 0, warning: 1, info: 2 } as const

/**
 * Every local check, in one pass. Errors sort first so the problems that block a
 * publish read before the advisory ones.
 */
export function runAllChecks(recipe: Record<string, unknown>): Finding[] {
  const findings = [
    ...checkStructure(recipe),
    ...checkSteps(recipe),
    ...checkPortability(recipe),
    ...checkSecrets(recipe)
  ]
  return findings.sort((a, b) => SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity])
}
