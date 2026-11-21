import { Command } from 'commander'
import { execSync } from 'node:child_process'
import { ok, info, fail, label, actionableError } from '../lib/output.js'
import { createRequire } from 'node:module'
import { planUpdate } from '../lib/update-plan.js'

const require = createRequire(import.meta.url)

const NPM_LATEST_URL = 'https://registry.npmjs.org/@omniscio/plugin-cli/latest'
const PACKAGE_NAME = '@omniscio/plugin-cli'
const INSTALLABLE_VERSION = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/

export type LatestLookup =
  | { status: 'found'; version: string }
  | { status: 'absent' }
  | { status: 'unreachable' }
  | { status: 'unusable'; version: string }

export interface UpdateDeps {
  currentVersion: string
  lookupLatest: () => Promise<LatestLookup>
  install: (version: string) => void
}

export function installCommand(version: string): string {
  return `npm install -g ${PACKAGE_NAME}@${version}`
}

export function readCurrentVersion(): string {
  try {
    const pkg = require('../../package.json') as { version?: string }
    return pkg.version ?? 'unknown'
  } catch {
    return 'unknown'
  }
}

async function fetchLatest(): Promise<Response | null> {
  try {
    return await globalThis.fetch(NPM_LATEST_URL)
  } catch {
    return null
  }
}

async function lookupLatest(): Promise<LatestLookup> {
  const response = await fetchLatest()
  if (!response) return { status: 'unreachable' }
  if (!response.ok) return { status: 'absent' }
  const data = (await response.json().catch(() => null)) as { version?: unknown } | null
  const version = data?.version
  if (typeof version !== 'string' || !INSTALLABLE_VERSION.test(version)) {
    return { status: 'unusable', version: typeof version === 'string' ? version : 'missing' }
  }
  return { status: 'found', version }
}

export function defaultDeps(): UpdateDeps {
  return {
    currentVersion: readCurrentVersion(),
    lookupLatest,
    install: (version) => execSync(installCommand(version), { stdio: 'inherit' })
  }
}

function reportLookupFailure(latest: Exclude<LatestLookup, { status: 'found' }>): void {
  if (latest.status === 'absent') {
    info('Package not found on npm (private repo — install via git)')
    return
  }
  if (latest.status === 'unreachable') {
    fail('Could not reach npm registry')
    return
  }
  fail(`The npm registry reported an unusable version: ${latest.version}`)
}

function performInstall(deps: UpdateDeps, version: string): number {
  info(`Updating ${deps.currentVersion} → ${version}...`)
  try {
    deps.install(version)
    ok(`Updated to ${version}`)
    return 0
  } catch {
    actionableError('Update failed', `Try running with sudo: 'sudo ${installCommand(version)}'`)
    return 1
  }
}

export async function runUpdate(
  options: { check?: boolean },
  deps: UpdateDeps
): Promise<number> {
  label('Current version:', deps.currentVersion)
  info('Checking npm registry...')

  const latest = await deps.lookupLatest()
  if (latest.status !== 'found') {
    reportLookupFailure(latest)
    return 0
  }

  label('Latest version:', latest.version)
  const plan = planUpdate(deps.currentVersion, latest.version, Boolean(options.check))
  if (plan.action === 'up-to-date') {
    ok(plan.message)
    return 0
  }
  if (plan.action === 'newer-than-latest') {
    info(plan.message)
    return 0
  }
  if (!plan.install) {
    info(plan.message)
    return 0
  }

  return performInstall(deps, latest.version)
}

export const updateCommand = new Command('update')
  .description('Update the omniscio-plugin CLI to the latest version')
  .option('--check', 'Check for updates without installing')
  .action(async (options: { check?: boolean }) => {
    const code = await runUpdate(options, defaultDeps())
    if (code !== 0) process.exit(code)
  })
