import type { Finding } from '../lib/findings.js'

/** The share envelope version this CLI emits. Never guess a newer one. */
export const SCHEMA_VERSION = 1

export const EXECUTION_MODES: readonly string[] = ['multi-session', 'same-session', 'parallel']

const MAX_NAME_LEN = 100

/**
 * Shape checks only. These mirror the SHAPE of the host's envelope, never its
 * AUTHORITY — a mismatch here is a local error because it is unambiguous, not
 * because this file is the arbiter. The server decides validity (spec §4).
 */
export function checkStructure(recipe: Record<string, unknown>): Finding[] {
  const findings: Finding[] = []

  const name = recipe.name
  if (typeof name !== 'string' || name.trim().length === 0) {
    findings.push({
      severity: 'error',
      code: 'missing-name',
      message: 'The automation needs a name.',
      fix: 'Add a "name" field, e.g. "name": "Daily digest".'
    })
  } else if (name.length > MAX_NAME_LEN) {
    findings.push({
      severity: 'error',
      code: 'name-too-long',
      message: `The name is ${name.length} characters; the limit is ${MAX_NAME_LEN}.`,
      fix: 'Shorten the name.'
    })
  }

  if (!Array.isArray(recipe.steps) || recipe.steps.length === 0) {
    findings.push({
      severity: 'error',
      code: 'no-steps',
      message: 'The automation has no steps, so there is nothing to run.',
      fix: 'Add at least one step with a "prompt".'
    })
  }

  const mode = recipe.executionMode
  if (mode !== undefined && (typeof mode !== 'string' || !EXECUTION_MODES.includes(mode))) {
    findings.push({
      severity: 'error',
      code: 'bad-execution-mode',
      message: `"${String(mode)}" is not a known execution mode.`,
      fix: `Use one of: ${EXECUTION_MODES.join(', ')}.`
    })
  }

  const version = recipe.schemaVersion
  if (version !== undefined && version !== SCHEMA_VERSION) {
    findings.push({
      severity: 'error',
      code: 'bad-schema-version',
      message: `schemaVersion ${String(version)} is not supported (this CLI writes v${SCHEMA_VERSION}).`,
      fix: `Set "schemaVersion": ${SCHEMA_VERSION}, or remove the field and let the CLI add it.`
    })
  }

  return findings
}
