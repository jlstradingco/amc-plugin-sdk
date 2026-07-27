import type { Finding } from '../lib/findings.js'
import {
  buildEnvelope,
  deriveAutomationId,
  isValidAutomationId,
  AUTOMATION_ID_MIN_LENGTH,
  AUTOMATION_ID_MAX_LENGTH,
  DEFAULT_PUBLISH_VERSION,
  DEFAULT_PUBLISH_CATEGORY
} from '../lib/envelope.js'

/**
 * The marketplace's hard limits, mirrored so a publish that will be refused fails
 * LOCALLY with an explanation instead of remotely with a bare 400.
 *
 * Kept deliberately narrow: these are the three limits whose server-side rejection
 * arrives as an opaque status the author cannot act on. Everything softer stays the
 * server's call (spec §4) — the point is not to re-implement the validator, it is to
 * stop burning an upload slot on a submission that never had a chance.
 */
const MAX_STEPS = 200
const MAX_DEFINITION_BYTES = 256 * 1024

export function checkLimits(recipe: Record<string, unknown>): Finding[] {
  const findings: Finding[] = []

  // ── The derived id ────────────────────────────────────────────────────────
  // The author never types the id, so a rejection naming it is baffling on its own.
  // Every finding here names the NAME as the thing to change, because it is.
  const name = typeof recipe.name === 'string' ? recipe.name : ''
  if (name.trim().length > 0) {
    const id = deriveAutomationId(name)
    if (!isValidAutomationId(id)) {
      if (id.length < AUTOMATION_ID_MIN_LENGTH) {
        findings.push({
          severity: 'error',
          code: 'automation-id-too-short',
          message: `"${name}" becomes the marketplace id "${id}", which is too short (the minimum is ${AUTOMATION_ID_MIN_LENGTH} characters).`,
          fix: 'Use a longer name — the id is built from its letters and digits.'
        })
      } else if (id.length > AUTOMATION_ID_MAX_LENGTH) {
        findings.push({
          severity: 'error',
          code: 'automation-id-too-long',
          message: `"${name}" becomes a ${id.length}-character marketplace id; the limit is ${AUTOMATION_ID_MAX_LENGTH}.`,
          fix: `Shorten the name to about ${AUTOMATION_ID_MAX_LENGTH} characters of letters, digits and spaces.`
        })
      } else {
        // Belt and braces: deriveAutomationId should make every other case
        // unreachable, but a mirrored pattern that silently stopped agreeing with
        // the deriver is exactly the drift worth catching out loud.
        findings.push({
          severity: 'error',
          code: 'automation-id-invalid',
          message: `"${name}" becomes the marketplace id "${id}", which the marketplace will not accept.`,
          fix: 'Use a name with ordinary letters and digits in it.'
        })
      }
    }
  }

  // ── Step count ────────────────────────────────────────────────────────────
  const steps = Array.isArray(recipe.steps) ? recipe.steps : []
  if (steps.length > MAX_STEPS) {
    findings.push({
      severity: 'error',
      code: 'too-many-steps',
      message: `This automation has ${steps.length} steps; the marketplace accepts at most ${MAX_STEPS}.`,
      fix: 'Split it into several automations, or collapse steps that always run together.'
    })
  }

  // ── Definition size ───────────────────────────────────────────────────────
  // Measured on the ENVELOPE, not the raw recipe: only the shareable fields travel,
  // so measuring the file on disk would over-report and reject a publishable recipe.
  const envelope = buildEnvelope(recipe, {
    automationId: 'size-probe',
    version: DEFAULT_PUBLISH_VERSION,
    category: DEFAULT_PUBLISH_CATEGORY,
    changelog: ''
  })
  const bytes = Buffer.byteLength(JSON.stringify(envelope.definition), 'utf8')
  if (bytes > MAX_DEFINITION_BYTES) {
    const kb = Math.round(bytes / 1024)
    const limitKb = MAX_DEFINITION_BYTES / 1024
    findings.push({
      severity: 'error',
      code: 'definition-too-large',
      message: `The shareable part of this automation is ${kb} KB; the marketplace limit is ${limitKb} KB.`,
      fix: 'Shorten the longest prompts, or move reference material out of the steps.'
    })
  }

  return findings
}
