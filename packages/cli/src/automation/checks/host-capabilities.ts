import type { Finding } from '../lib/findings.js'
import { collectAllSteps } from '../lib/recipe-steps.js'
import { CROSS_APP_MATRIX, type SdkCrossAppSurface } from '../data/cross-app-matrix.js'

/**
 * Does this automation declare the AMC apps it actually uses?
 *
 * THE PROBLEM THIS CATCHES. A published automation runs on the INSTALLER's machine,
 * where Jira may never have been connected and Supermail may not be set up. Until
 * `requiresApps` existed there was no way to say so: AMC's portability model knew
 * only about dependencies on the AUTHORING machine (a local script, a file on disk),
 * all of which are fatal, and had no vocabulary for a satisfiable dependency on the
 * host. So a cross-app listing declared nothing, published, installed cleanly, and
 * then died partway through its first run with a raw 400 the installer could not act
 * on.
 *
 * This check reads what the step prompts actually tell the agent to CALL and holds
 * `requiresApps` to it, in both directions:
 *
 *   under-declared — an error. Invisible until it breaks on someone else's machine.
 *   over-declared  — a warning. Not dangerous on its own, but it trains installers to
 *                    ignore the requirements list, which devalues the honest ones.
 *
 * WHY IT RUNS LOCALLY. A third-party author has no access to AMC's internal route
 * table, so before this they had no way to know which apps their own prompts touched.
 * The matrix snapshot in ../data makes the check possible offline, before an upload
 * slot is spent.
 */

/** Route paths mentioned in a block of text. Mirrors AMC's `extractRoutePaths`. */
export function extractRoutePaths(text: string): string[] {
  const found = new Set<string>()
  for (const m of text.matchAll(/\/[a-z][a-z0-9-]*(?:\/[A-Za-z0-9_:.*-]+)*/g)) {
    const raw = m[0].replace(/[.,;:)\]}'"`]+$/, '')
    if (raw.length > 1) found.add(raw)
  }
  return [...found].sort()
}

/**
 * Which surfaces does this text reference? Longest-prefix wins, so
 * `/supermail/threads/:id/archive` resolves to `supermail` and not to a surface that
 * merely shares a shorter root.
 */
export function surfacesReferencedBy(
  text: string,
  matrix: SdkCrossAppSurface[] = CROSS_APP_MATRIX
): string[] {
  const hits = new Set<string>()
  for (const path of extractRoutePaths(text)) {
    let best: { surface: string; length: number } | null = null
    for (const surface of matrix) {
      for (const prefix of surface.pathPrefixes) {
        const isMatch = path === prefix || path.startsWith(`${prefix}/`)
        if (isMatch && (!best || prefix.length > best.length)) {
          best = { surface: surface.surface, length: prefix.length }
        }
      }
    }
    if (best) hits.add(best.surface)
  }
  return [...hits].sort()
}

/** Everything the automation's agent will read — description plus every step prompt. */
function automationText(recipe: Record<string, unknown>): string {
  const parts: string[] = []
  if (typeof recipe.description === 'string') parts.push(recipe.description)
  for (const { step } of collectAllSteps(recipe)) {
    if (typeof step.prompt === 'string') parts.push(step.prompt)
  }
  return parts.join('\n')
}

export function checkHostCapabilities(
  recipe: Record<string, unknown>,
  matrix: SdkCrossAppSurface[] = CROSS_APP_MATRIX
): Finding[] {
  const findings: Finding[] = []

  const rawDeclared = Array.isArray(recipe.requiresApps) ? recipe.requiresApps : []
  const declared = rawDeclared.filter((a): a is string => typeof a === 'string')
  const declaredSet = new Set(declared)
  const known = new Set(matrix.map((s) => s.surface))

  // A name that is not a surface would silently never match anything, so the author
  // would believe they had declared a requirement that the marketplace ignores.
  for (const app of declared) {
    if (!known.has(app)) {
      findings.push({
        severity: 'error',
        code: 'unknown-required-app',
        message: `"requiresApps" names "${app}", which is not an AMC app.`,
        fix:
          'Use the surface slug exactly — for example "jira", "supermail", "kms". ' +
          'A name that is not a surface is silently ignored, so the requirement would ' +
          'never be shown or checked.'
      })
    }
  }

  const used = surfacesReferencedBy(automationText(recipe), matrix)

  for (const app of used) {
    if (declaredSet.has(app)) continue
    findings.push({
      severity: 'error',
      code: 'undeclared-required-app',
      message: `A step calls ${app}, but "requiresApps" does not list it.`,
      fix:
        `Add "${app}" to "requiresApps". Without it, the marketplace cannot warn people ` +
        `before they install, and anyone whose ${app} is not connected will hit a failure ` +
        'partway through the run instead of a clean message.'
    })
  }

  const usedSet = new Set(used)
  for (const app of declared) {
    if (!known.has(app)) continue // already reported as unknown
    if (usedSet.has(app)) continue
    findings.push({
      severity: 'warning',
      code: 'unused-required-app',
      message: `"requiresApps" lists ${app}, but no step appears to call it.`,
      fix:
        `Remove "${app}" unless a step really needs it. Requiring something the ` +
        'automation never uses teaches people to ignore the requirements list.'
    })
  }

  // An automation that names apps it cannot preflight will still work, but it cannot
  // fail cleanly — worth telling the author while they can still restructure it.
  for (const app of declared) {
    const surface = matrix.find((s) => s.surface === app)
    if (!surface || surface.status !== null) continue
    findings.push({
      severity: 'info',
      code: 'unpreflightable-required-app',
      message: `${app} cannot be checked before the run on the installer's machine.`,
      fix:
        `AMC has no readiness check for ${app} yet, so GET /capabilities/probe cannot ` +
        'confirm it up front. Your automation will still run — but make its first step ' +
        `handle ${app} being unavailable, rather than assuming it is there.`
    })
  }

  return findings
}
