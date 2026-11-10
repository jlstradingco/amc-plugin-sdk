/**
 * Pure evaluators for `omniscio-plugin doctor`. Each takes already-gathered raw
 * inputs and returns a structured result — no fs / network / process access —
 * so they are fully unit-testable. The command module (doctor.ts) does the
 * gathering and passes the values in.
 */

import { SDK_PACKAGE_NAMES } from './package-names.js'

const [CURRENT_SDK_PACKAGE] = SDK_PACKAGE_NAMES

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

export interface InstalledSdk {
  name: string
  version: string
}

export function checkSdkVersion(installed: InstalledSdk | null, latest: string | null): DoctorResult {
  if (!installed) {
    return {
      name: 'Plugin SDK',
      status: 'warn',
      message: `${CURRENT_SDK_PACKAGE} is not installed in this project`,
      suggestion: `Run 'pnpm add ${CURRENT_SDK_PACKAGE}' inside your plugin.`
    }
  }
  if (installed.name !== CURRENT_SDK_PACKAGE) {
    return {
      name: 'Plugin SDK',
      status: 'warn',
      message: `${installed.name} ${installed.version} installed — the SDK is now published as ${CURRENT_SDK_PACKAGE}`,
      suggestion: `Run 'pnpm remove ${installed.name}' and 'pnpm add ${CURRENT_SDK_PACKAGE}', then change your imports to the new name. Your plugin keeps working until you do.`
    }
  }
  if (latest && compareSemver(installed.version, latest) < 0) {
    return {
      name: 'Plugin SDK',
      status: 'warn',
      message: `${installed.name} ${installed.version} installed — ${latest} is available`,
      suggestion: `Run 'pnpm update ${installed.name}' to upgrade.`
    }
  }
  return { name: 'Plugin SDK', status: 'pass', message: `${installed.name} ${installed.version}` }
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
      suggestion: "Run this from a plugin project, or 'omniscio-plugin create <name>' to scaffold one."
    }
  }
  if (!validation || !validation.valid) {
    return {
      name: 'Manifest',
      status: 'fail',
      message: 'manifest.json is invalid',
      suggestion: validation?.errors[0] ?? "Run 'omniscio-plugin validate' for details."
    }
  }
  return { name: 'Manifest', status: 'pass', message: 'manifest.json is valid' }
}

export interface HostProbe {
  reachable: boolean
  status: number | null
  hasToken: boolean
}

export function checkHostProbe(probe: HostProbe, port: number): DoctorResult {
  if (!probe.reachable) {
    return {
      name: 'Omniscio host',
      status: 'warn',
      message: `No running Omniscio on 127.0.0.1:${port}`,
      suggestion: 'Start Omniscio to enable local install and hot-reload.'
    }
  }
  if (!probe.hasToken) {
    return {
      name: 'Omniscio host',
      status: 'fail',
      message: `Reachable on 127.0.0.1:${port}, but no CLI token was found (checked ~/.amc/cli-token and $AMC_CLI_TOKEN)`,
      suggestion:
        'Open Settings -> CLI Control, copy the token, and save it to ~/.amc/cli-token or export AMC_CLI_TOKEN.'
    }
  }
  if (probe.status !== null && probe.status >= 200 && probe.status < 300) {
    return {
      name: 'Omniscio host',
      status: 'pass',
      message: `Reachable on 127.0.0.1:${port} and the CLI token was accepted`
    }
  }
  if (probe.status === 401 || probe.status === 403) {
    return {
      name: 'Omniscio host',
      status: 'fail',
      message: `Reachable on 127.0.0.1:${port}, but the CLI token was rejected (HTTP ${probe.status})`,
      suggestion: 'Re-run Settings -> CLI Control -> Regenerate and save the new token.'
    }
  }
  return {
    name: 'Omniscio host',
    status: 'warn',
    message: `Reachable on 127.0.0.1:${port}, but the token check answered HTTP ${probe.status ?? 'nothing'}`,
    suggestion: 'Retry in a moment; if it persists, check the Omniscio log.'
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
