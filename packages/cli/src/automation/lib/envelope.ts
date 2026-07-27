// Imported from the check module directly rather than through checks/index.js:
// checks/limits.ts needs buildEnvelope from here, and going through the barrel
// would close that into an import cycle.
import { SCHEMA_VERSION } from '../checks/structure.js'
import { pickPortableSteps, pickPortablePipelines } from './portable-step.js'

export type AutomationCategory =
  | 'planning'
  | 'development'
  | 'testing'
  | 'devops'
  | 'productivity'
  | 'other'

export const AUTOMATION_CATEGORIES: readonly AutomationCategory[] = [
  'planning',
  'development',
  'testing',
  'devops',
  'productivity',
  'other'
]

/**
 * Defaults shared by `publish` and `validate --check`.
 *
 * They MUST agree: `validate --check` asks the marketplace whether this exact
 * submission would be accepted, and the server's answer covers version collisions.
 * A validate that quietly substituted a placeholder version would report "the
 * marketplace accepts this" for a publish that is about to 409.
 */
export const DEFAULT_PUBLISH_VERSION = '1.0.0'
export const DEFAULT_PUBLISH_CATEGORY: AutomationCategory = 'other'

export interface AutomationPublishRequest {
  automationId: string
  version: string
  category: AutomationCategory
  changelog: string
  definition: Record<string, unknown>
}

/**
 * Shareable TOP-LEVEL fields, mirroring the host envelope's shape.
 *
 * An ALLOW-list, not a deny-list: anything not named here simply does not
 * travel. That is the safe direction — a field we forget to add is a missing
 * feature, whereas a field we forget to exclude could be a local path, a project
 * id, or worse. The server re-validates against the real schema regardless.
 *
 * The two step-bearing entries (`steps`, `pipelines`) are NOT copied verbatim —
 * every step inside them goes through the step-level allow-list in
 * `portable-step.ts`, so the guarantee above holds all the way down rather than
 * stopping at the top level.
 *
 * `readonly`, because `checks/secrets.ts` drives its scan coverage off this list:
 * a mutation would silently narrow what gets scanned for secrets.
 */
export const SHAREABLE_FIELDS = [
  'name',
  'description',
  'silent',
  'runLabel',
  'steps',
  'pipelines',
  'runMemory',
  'maxRetries',
  'maxConcurrent',
  'maxSteps',
  'executionMode',
  'onComplete',
  'parameters',
  'supervisors',
  'totalBudget',
  'limits',
  'defaultStepTimeoutMinutes',
  'resumable',
  'resumeMaxAgeMinutes'
] as const satisfies readonly string[]

/**
 * The id shape the marketplace enforces, mirrored from its `validateAutomationId`:
 * 2-64 characters, lowercase letters / digits / hyphens, first character not a hyphen.
 *
 * Mirrored, not guessed. `deriveAutomationId` slugs a display NAME into this shape and
 * gets it right for ordinary names, but the two ends of that range are reachable from a
 * name the local checks otherwise accept: a one-character name slugs to one character,
 * and the 100-character name limit slugs past 64. Both passed `validate` clean and were
 * then refused by the server with a 400.
 */
export const AUTOMATION_ID_PATTERN = /^[a-z0-9][a-z0-9-]{1,63}$/

export const AUTOMATION_ID_MIN_LENGTH = 2
export const AUTOMATION_ID_MAX_LENGTH = 64

export function isValidAutomationId(id: string): boolean {
  return AUTOMATION_ID_PATTERN.test(id)
}

/** Kebab-case a display name into a marketplace id. */
export function deriveAutomationId(name: string): string {
  const slug = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
  return slug.length > 0 ? slug : 'automation'
}

export function buildEnvelope(
  recipe: Record<string, unknown>,
  opts: {
    automationId: string
    version: string
    category: AutomationCategory
    changelog: string
  }
): AutomationPublishRequest {
  const definition: Record<string, unknown> = {
    schemaVersion: SCHEMA_VERSION,
    kind: 'recipe'
  }

  for (const field of SHAREABLE_FIELDS) {
    if (recipe[field] !== undefined) definition[field] = recipe[field]
  }

  // The two step-bearing fields are re-derived rather than copied. Filtering them in
  // place, after the generic copy, keeps ONE loop over the top-level allow-list while
  // still guaranteeing that nothing inside a step escapes on the strength of the
  // top-level list alone.
  if (definition.steps !== undefined) definition.steps = pickPortableSteps(recipe.steps)
  if (definition.pipelines !== undefined) {
    definition.pipelines = pickPortablePipelines(recipe.pipelines)
  }

  // executionMode is required by the envelope; multi-session is AMC's own default.
  if (definition.executionMode === undefined) definition.executionMode = 'multi-session'

  return {
    automationId: opts.automationId,
    version: opts.version,
    category: opts.category,
    changelog: opts.changelog,
    definition
  }
}
