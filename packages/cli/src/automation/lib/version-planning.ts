// Pure version planning for `amc-automation publish`.
//
// The marketplace treats a published version as IMMUTABLE: re-submitting a version
// that already exists is refused with a 409, and a refused upload still costs one of
// the five attempts an account gets per hour. The command hardcoded its `--version`
// default to a constant `1.0.0` (envelope.ts) with no check against what the author
// had already published, so a second publish that forgot `--version` re-sent `1.0.0`
// and burned a slot on a guaranteed collision.
//
// Everything here is pure and unit-testable: the command fetches the author's own
// submissions and passes their versions in.

import { compareSemver } from '../../lib/publish-preflight.js'
import type { AutomationSubmission } from '../api/automation-api.js'

/** A parsed dotted-numeric version, pre-release tag discarded. */
function parseVersion(version: string): [number, number, number] {
  const core = version.split('-')[0].split('.')
  const major = Number.parseInt(core[0] ?? '', 10)
  const minor = Number.parseInt(core[1] ?? '', 10)
  const patch = Number.parseInt(core[2] ?? '', 10)
  return [
    Number.isFinite(major) ? major : 0,
    Number.isFinite(minor) ? minor : 0,
    Number.isFinite(patch) ? patch : 0
  ]
}

/**
 * The highest version already recorded for `automationId`, across EVERY submission
 * status. Status is deliberately ignored: a pending, approved, or rejected version
 * has still consumed that version string, and the server refuses to reuse it either
 * way. Returns null when the author has never submitted this automation.
 */
export function latestSubmittedVersion(
  submissions: AutomationSubmission[],
  automationId: string
): string | null {
  const versions = submissions
    .filter((s) => s.automationId === automationId && typeof s.version === 'string')
    .map((s) => s.version)
  if (versions.length === 0) return null
  return versions.reduce((max, v) => (compareSemver(v, max) > 0 ? v : max))
}

/** Return `version` with its patch component incremented (major/minor preserved). */
export function bumpPatch(version: string): string {
  const [major, minor, patch] = parseVersion(version)
  return `${major}.${minor}.${patch + 1}`
}

/** True when `version` is already present for `automationId` in `submissions`. */
export function versionAlreadyUsed(
  submissions: AutomationSubmission[],
  automationId: string,
  version: string
): boolean {
  return submissions.some(
    (s) => s.automationId === automationId && s.version === version
  )
}

export interface PlannedVersion {
  /** The version to publish under. */
  version: string
  /** The latest version already on the registry, or null on a first release. */
  basedOn: string | null
}

/**
 * Choose the default version for a publish that did not pass `--version`.
 *
 * First release → the initial default. Otherwise the next patch above the highest
 * version the author has already submitted, so a forgotten `--version` advances the
 * series rather than colliding on the last one.
 */
export function planDefaultVersion(
  submissions: AutomationSubmission[],
  automationId: string,
  initialDefault: string
): PlannedVersion {
  const latest = latestSubmittedVersion(submissions, automationId)
  if (!latest) return { version: initialDefault, basedOn: null }
  return { version: bumpPatch(latest), basedOn: latest }
}
