import { fail, warn, info, ok } from '../../lib/output.js'

export type Severity = 'error' | 'warning' | 'info'

/**
 * One thing a local check noticed. `fix` is the remedy — a finding without a
 * remedy is a dead end for the author, so every error-severity finding should
 * carry one.
 */
export interface Finding {
  severity: Severity
  /** Stable machine code, e.g. 'empty-prompt'. Used by --json and by tests. */
  code: string
  message: string
  /** Present when the finding is scoped to one step. */
  stepName?: string
  fix?: string
}

/** Only errors gate a publish. Warnings are advisory by design (spec §4). */
export function hasErrors(findings: Finding[]): boolean {
  return findings.some((f) => f.severity === 'error')
}

/**
 * The stable code every secret-scan match carries (see `checks/secrets.ts`).
 * Named once here so the publish command's secret gate and the scanner cannot
 * drift apart on the string.
 */
export const POSSIBLE_SECRET_CODE = 'possible-secret'

/**
 * True when any finding is a possible-secret match.
 *
 * Kept separate from {@link hasErrors} on purpose: a possible secret is emitted as
 * a WARNING so a false positive never hard-blocks the ordinary error gate, but a
 * *published* automation is world-readable, so `publish` treats a suspected secret
 * as its own deliberate decision point rather than a line to scroll past.
 */
export function hasPossibleSecrets(findings: Finding[]): boolean {
  return findings.some((f) => f.code === POSSIBLE_SECRET_CODE)
}

/** Just the possible-secret findings, for a targeted report before the gate aborts. */
export function possibleSecretFindings(findings: Finding[]): Finding[] {
  return findings.filter((f) => f.code === POSSIBLE_SECRET_CODE)
}

export function findingsToJson(findings: Finding[]): {
  ok: boolean
  errors: Finding[]
  warnings: Finding[]
  info: Finding[]
} {
  const errors = findings.filter((f) => f.severity === 'error')
  return {
    ok: errors.length === 0,
    errors,
    warnings: findings.filter((f) => f.severity === 'warning'),
    info: findings.filter((f) => f.severity === 'info')
  }
}

function line(f: Finding): string {
  // The location suffix is dropped when the message already names the step. Several
  // checks lead with the step name because the sentence reads better that way, and
  // repeating it turned every portability finding into
  //   "ship" runs a local script ... (step "ship")
  const alreadyNamed = f.stepName !== undefined && f.message.includes(f.stepName)
  const where = f.stepName && !alreadyNamed ? ` (step "${f.stepName}")` : ''
  return `${f.message}${where}`
}

export function reportFindings(findings: Finding[]): void {
  if (findings.length === 0) {
    ok('No problems found')
    return
  }
  for (const f of findings) {
    if (f.severity === 'error') fail(line(f))
    else if (f.severity === 'warning') warn(line(f))
    else info(line(f))
    if (f.fix) console.log(`  → ${f.fix}`)
  }
}
