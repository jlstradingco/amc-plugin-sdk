import { SCHEMA_VERSION } from '../checks/index.js'

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
 * Shareable top-level fields, mirroring the host envelope's shape.
 *
 * An ALLOW-list, not a deny-list: anything not named here simply does not
 * travel. That is the safe direction — a field we forget to add is a missing
 * feature, whereas a field we forget to exclude could be a local path, a project
 * id, or worse. The server re-validates against the real schema regardless.
 */
const SHAREABLE_FIELDS = [
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
]

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
