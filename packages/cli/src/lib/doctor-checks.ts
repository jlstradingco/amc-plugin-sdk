/**
 * Pure evaluators for `amc-plugin doctor`. Each takes already-gathered raw
 * inputs and returns a structured result — no fs / network / process access —
 * so they are fully unit-testable. The command module (doctor.ts) does the
 * gathering and passes the values in.
 */

export type DoctorStatus = 'pass' | 'warn' | 'fail'

export interface DoctorResult {
  name: string
  status: DoctorStatus
  message: string
  suggestion?: string
}

const MIN_NODE_MAJOR = 18
const RECOMMENDED_NODE_MAJOR = 20

/** Compare two dotted numeric versions. Returns -1, 0, or 1. */
export function compareSemver(a: string, b: string): number {
  const pa = a.replace(/^v/, '').split('.').map((n) => parseInt(n, 10) || 0)
  const pb = b.replace(/^v/, '').split('.').map((n) => parseInt(n, 10) || 0)
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const na = pa[i] ?? 0
    const nb = pb[i] ?? 0
    if (na !== nb) return na > nb ? 1 : -1
  }
  return 0
}

export function checkNodeVersion(version: string): DoctorResult {
  const major = parseInt(version.replace(/^v/, '').split('.')[0], 10)
  if (Number.isNaN(major)) {
    return {
      name: 'Node.js',
      status: 'warn',
      message: `Could not parse Node version "${version}"`
    }
  }
  if (major < MIN_NODE_MAJOR) {
    return {
      name: 'Node.js',
      status: 'fail',
      message: `Node ${version} is too old (need >= ${MIN_NODE_MAJOR})`,
      suggestion: `Upgrade to Node ${RECOMMENDED_NODE_MAJOR}+ from https://nodejs.org`
    }
  }
  if (major < RECOMMENDED_NODE_MAJOR) {
    return {
      name: 'Node.js',
      status: 'warn',
      message: `Node ${version} works, but ${RECOMMENDED_NODE_MAJOR}+ is recommended`
    }
  }
  return { name: 'Node.js', status: 'pass', message: `Node ${version}` }
}

export function checkSdkVersion(installed: string | null, latest: string | null): DoctorResult {
  if (!installed) {
    return {
      name: 'Plugin SDK',
      status: 'warn',
      message: '@agent-mc/plugin-sdk is not installed in this project',
      suggestion: "Run 'pnpm add @agent-mc/plugin-sdk' inside your plugin."
    }
  }
  if (latest && compareSemver(installed, latest) < 0) {
    return {
      name: 'Plugin SDK',
      status: 'warn',
      message: `@agent-mc/plugin-sdk ${installed} installed — ${latest} is available`,
      suggestion: "Run 'pnpm update @agent-mc/plugin-sdk' to upgrade."
    }
  }
  return { name: 'Plugin SDK', status: 'pass', message: `@agent-mc/plugin-sdk ${installed}` }
}

export function checkManifest(
  manifest: unknown | null,
  validation: { valid: boolean; errors: string[] } | null
): DoctorResult {
  if (manifest === null) {
    return {
      name: 'Manifest',
      status: 'warn',
      message: 'No manifest.json in the current directory',
      suggestion: "Run this from a plugin project, or 'amc-plugin create <name>' to scaffold one."
    }
  }
  if (!validation || !validation.valid) {
    return {
      name: 'Manifest',
      status: 'fail',
      message: 'manifest.json is invalid',
      suggestion: validation?.errors[0] ?? "Run 'amc-plugin validate' for details."
    }
  }
  return { name: 'Manifest', status: 'pass', message: 'manifest.json is valid' }
}

export function checkHostReachable(reachable: boolean, port: number): DoctorResult {
  if (reachable) {
    return { name: 'AMC host', status: 'pass', message: `Reachable on 127.0.0.1:${port}` }
  }
  return {
    name: 'AMC host',
    status: 'warn',
    message: `No running AMC on 127.0.0.1:${port}`,
    suggestion: 'Start Agent Mission Control to enable local install and hot-reload.'
  }
}

export function checkCliToken(exists: boolean): DoctorResult {
  if (exists) {
    return { name: 'AMC CLI token', status: 'pass', message: 'AMC CLI token available' }
  }
  return {
    name: 'AMC CLI token',
    status: 'warn',
    message: 'No AMC CLI token (checked ~/.amc/cli-token and $AMC_CLI_TOKEN)',
    suggestion: 'Needed to install / hot-reload into a running AMC.'
  }
}

export function checkMarketplaceReachable(reachable: boolean): DoctorResult {
  if (reachable) {
    return { name: 'Marketplace API', status: 'pass', message: 'Reachable' }
  }
  return {
    name: 'Marketplace API',
    status: 'warn',
    message: 'Could not reach the marketplace API',
    suggestion: 'Check your network connection; publishing requires it.'
  }
}

export function summarizeDoctor(results: DoctorResult[]): {
  counts: Record<DoctorStatus, number>
  hasFailure: boolean
} {
  const counts: Record<DoctorStatus, number> = { pass: 0, warn: 0, fail: 0 }
  for (const r of results) counts[r.status]++
  return { counts, hasFailure: counts.fail > 0 }
}
