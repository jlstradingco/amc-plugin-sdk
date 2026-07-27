import type { Finding } from '../lib/findings.js'
import { SHAREABLE_FIELDS } from '../lib/envelope.js'
import { collectAllSteps } from '../lib/recipe-steps.js'
import { collectStrippedStepFields } from '../lib/portable-step.js'

/**
 * Tell the author which of their fields will not be published.
 *
 * Both allow-lists — the top-level one in `envelope.ts` and the step-level one in
 * `portable-step.ts` — drop silently by design, and silence is the right default for
 * a SAFETY mechanism. It is the wrong default for an authoring tool: a field that
 * vanishes between the file on disk and the published automation leaves the author
 * debugging its absence against a catalog they cannot see into. AMC shows the same
 * thing as its "removed" list at share time.
 *
 * INFO severity throughout. Nothing here blocks a publish — being dropped is the
 * allow-list working, not a fault.
 */

/**
 * Top-level fields AMC itself documents as intentionally dropped, mirrored from
 * `DROPPED_CONFIG_FIELDS` in the host's automation-share.ts.
 *
 * Kept SILENT. Every one of these is present on any recipe exported from AMC, so
 * naming them would put four or five advisory lines in front of an author who did
 * nothing wrong — and an advisory that always fires is one nobody reads. What is
 * worth naming is the field nobody expected, which is usually a typo.
 */
const EXPECTED_LOCAL_FIELDS = new Set<string>([
  'id',
  'createdAt',
  'updatedAt',
  'approvalStatus',
  'homeProjectId',
  'orchestratorModel',
  'agentTriggerable',
  'scope'
])

/**
 * Step fields that are dropped but already reported by a better-aimed check.
 *
 * `checkPortability` raises a named error for each of the four non-portable ones,
 * explaining what breaks for the importer. Repeating them here as "these will be
 * dropped" would be a second, vaguer line about the same mistake.
 */
const ALREADY_REPORTED_STEP_FIELDS = new Set<string>([
  'id',
  'script',
  'subRecipe',
  'promptFile',
  'targetProjectId'
])

const SHAREABLE_FIELD_SET: ReadonlySet<string> = new Set<string>(SHAREABLE_FIELDS)

function list(names: string[]): string {
  return names.map((n) => `"${n}"`).join(', ')
}

export function checkStrippedFields(recipe: Record<string, unknown>): Finding[] {
  const findings: Finding[] = []

  const topLevel = Object.keys(recipe)
    .filter((key) => !SHAREABLE_FIELD_SET.has(key))
    .filter((key) => !EXPECTED_LOCAL_FIELDS.has(key))
    // `schemaVersion` and `kind` are stamped onto the envelope by `buildEnvelope`
    // rather than copied, so they are not "dropped" in any sense the author cares
    // about — they are simply written by the CLI instead of by the file.
    .filter((key) => key !== 'schemaVersion' && key !== 'kind')
    .sort()

  if (topLevel.length > 0) {
    findings.push({
      severity: 'info',
      code: 'field-not-published',
      message: `${list(topLevel)} will not be published — the marketplace envelope does not carry ${topLevel.length === 1 ? 'it' : 'them'}.`,
      fix: 'Remove the field, or check the spelling if you meant a field that does travel.'
    })
  }

  const stepFields = collectStrippedStepFields(collectAllSteps(recipe).map((s) => s.step)).filter(
    (name) => !ALREADY_REPORTED_STEP_FIELDS.has(name)
  )

  if (stepFields.length > 0) {
    findings.push({
      severity: 'info',
      code: 'step-field-not-published',
      message: `Inside your steps, ${list(stepFields)} will not be published.`,
      fix: 'Remove the field, or check the spelling if you meant a step field that does travel.'
    })
  }

  return findings
}
