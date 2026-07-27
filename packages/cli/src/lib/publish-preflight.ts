// Pure, side-effect-free preflight checks for `amc-plugin publish`.
// The command module gathers the raw inputs (manifest, registry, package size)
// and passes them in; everything here is unit-testable without fs/network.

export type PreflightStatus = 'pass' | 'warn' | 'fail'

export interface PreflightResult {
  name: string
  status: PreflightStatus
  message: string
  suggestion?: string
}

const VALID_PERMISSIONS = new Set([
  'storage',
  'sessions',
  'ai',
  'network',
  'cron',
  'cli',
  'notifications',
  'rss',
  'auth',
  'auth.session',
  'recording',
  'inbox',
  'navigation',
  'tts'
])

const MB = 1024 * 1024
const HARD_LIMIT_MB = 50
const WARN_LIMIT_MB = 25

// Returns -1, 0, or 1 comparing dotted numeric versions (ignores pre-release tags).
export function compareSemver(a: string, b: string): number {
  const parse = (v: string) => v.split('-')[0].split('.').map(n => Number.parseInt(n, 10) || 0)
  const pa = parse(a)
  const pb = parse(b)
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const da = pa[i] ?? 0
    const db = pb[i] ?? 0
    if (da > db) return 1
    if (da < db) return -1
  }
  return 0
}

export function checkVersionAgainstRegistry(
  manifestVersion: string,
  publishedVersion: string | null
): PreflightResult {
  const name = 'Version'
  if (!publishedVersion) {
    return { name, status: 'pass', message: `First release — ${manifestVersion} is not yet on the marketplace` }
  }
  const cmp = compareSemver(manifestVersion, publishedVersion)
  if (cmp > 0) {
    return { name, status: 'pass', message: `${manifestVersion} is newer than the published ${publishedVersion}` }
  }
  if (cmp === 0) {
    return {
      name,
      status: 'fail',
      message: `${manifestVersion} is already published — marketplace versions are immutable`,
      suggestion: 'Bump the version in manifest.json before publishing.'
    }
  }
  return {
    name,
    status: 'fail',
    message: `${manifestVersion} is older than the published ${publishedVersion}`,
    suggestion: 'Bump the version in manifest.json above the latest published version.'
  }
}

export function checkChangelog(changelog: string | null | undefined): PreflightResult {
  const name = 'Changelog'
  if (!changelog || changelog.trim().length === 0) {
    return {
      name,
      status: 'warn',
      message: 'No changelog provided for this version',
      suggestion: 'Pass --changelog "<what changed>" so reviewers and users know what is new.'
    }
  }
  return { name, status: 'pass', message: 'Changelog provided' }
}

export function checkPackageSize(bytes: number): PreflightResult {
  const name = 'Package size'
  const mb = bytes / MB
  const label = `${mb.toFixed(2)} MB`
  if (mb > HARD_LIMIT_MB) {
    return {
      name,
      status: 'fail',
      message: `Package is ${label}, over the ${HARD_LIMIT_MB} MB marketplace limit`,
      suggestion: `Reduce the package under ${HARD_LIMIT_MB} MB — exclude source maps, tests, and large assets.`
    }
  }
  if (mb > WARN_LIMIT_MB) {
    return {
      name,
      status: 'warn',
      message: `Package is ${label}, approaching the ${HARD_LIMIT_MB} MB limit`,
      suggestion: 'Consider trimming bundled assets to keep the download small.'
    }
  }
  return { name, status: 'pass', message: `Package is ${label}` }
}

export function checkDeclaredPermissions(permissions: string[] | undefined): PreflightResult {
  const name = 'Permissions'
  if (!permissions || permissions.length === 0) {
    return { name, status: 'pass', message: 'No special permissions declared' }
  }

  const unknown = permissions.filter(p => !VALID_PERMISSIONS.has(p))
  if (unknown.length > 0) {
    return {
      name,
      status: 'fail',
      message: `Unknown permission(s): ${unknown.join(', ')}`,
      suggestion: `Valid permissions are: ${[...VALID_PERMISSIONS].join(', ')}.`
    }
  }

  const seen = new Set<string>()
  const duplicates = permissions.filter(p => (seen.has(p) ? true : (seen.add(p), false)))
  if (duplicates.length > 0) {
    return {
      name,
      status: 'warn',
      message: `Duplicate permission(s): ${[...new Set(duplicates)].join(', ')}`,
      suggestion: 'Remove the duplicate entries from manifest.json permissions.'
    }
  }

  return { name, status: 'pass', message: `Declares: ${permissions.join(', ')}` }
}

export function summarizePreflight(results: PreflightResult[]): {
  counts: Record<PreflightStatus, number>
  hasFailure: boolean
} {
  const counts: Record<PreflightStatus, number> = { pass: 0, warn: 0, fail: 0 }
  for (const r of results) counts[r.status]++
  return { counts, hasFailure: counts.fail > 0 }
}
