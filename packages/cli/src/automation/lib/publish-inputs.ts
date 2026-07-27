import { AUTOMATION_CATEGORIES, type AutomationCategory } from './envelope.js'
import type { Finding } from './findings.js'

/**
 * Validation of the FLAGS a publish carries, as opposed to the recipe file's contents.
 *
 * `--version` and `--category` were passed straight through to the upload. The
 * marketplace refuses a non-semver version and an unknown category with a bare 400,
 * and a rejected upload still costs one of the five attempts an account gets per
 * hour — the exact waste the local checks exist to prevent. They are also the two
 * inputs a typo reaches most easily, because unlike the recipe they are retyped on
 * every publish.
 *
 * `init` has always validated its own `--category`; `publish` and `validate` did not,
 * so the same flag was checked in one command and trusted in the other two.
 */

/**
 * Mirrored from the marketplace's `validateVersion`: three dot-separated integers,
 * nothing else. Deliberately NOT full semver — the server does not accept a
 * pre-release or build suffix, so accepting one here would just move the 400.
 */
export const VERSION_PATTERN = /^\d+\.\d+\.\d+$/

export interface InputProblem {
  /** Stable machine code, so `validate --json` can report these beside the recipe findings. */
  code: 'bad-version' | 'bad-category'
  message: string
  suggestion: string
}

export function isValidVersion(version: string): boolean {
  return VERSION_PATTERN.test(version)
}

export function isValidCategory(category: string): category is AutomationCategory {
  return (AUTOMATION_CATEGORIES as readonly string[]).includes(category)
}

/**
 * Check the publish flags. Returns every problem, so a command with both a bad
 * version and a bad category reports both rather than one per run.
 */
export function checkPublishInputs(opts: {
  version?: string
  category?: string
}): InputProblem[] {
  const problems: InputProblem[] = []

  if (opts.version !== undefined && !isValidVersion(opts.version)) {
    problems.push({
      code: 'bad-version',
      message: `"${opts.version}" is not a valid version.`,
      suggestion:
        'Use three numbers separated by dots, e.g. 1.0.0. The marketplace accepts nothing else.'
    })
  }

  if (opts.category !== undefined && !isValidCategory(opts.category)) {
    problems.push({
      code: 'bad-category',
      message: `"${opts.category}" is not a valid category.`,
      suggestion: `Use one of: ${AUTOMATION_CATEGORIES.join(', ')}.`
    })
  }

  return problems
}

/**
 * The same problems shaped as recipe findings, so `validate` can report a bad flag
 * in the same list — and the same `--json` payload — as everything else it found.
 */
export function inputProblemsAsFindings(problems: InputProblem[]): Finding[] {
  return problems.map((p) => ({
    severity: 'error' as const,
    code: p.code,
    message: p.message,
    fix: p.suggestion
  }))
}
