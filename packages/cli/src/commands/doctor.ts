import { Command } from 'commander'
import * as fs from 'node:fs'
import * as path from 'node:path'
import { validateManifest } from '@omniscio/plugin-sdk'
import { getBaseUrl } from '../lib/auth.js'
import { ok, fail, warn, heading } from '../lib/output.js'
import {
  checkNodeVersion,
  checkSdkVersion,
  checkManifest,
  checkHostProbe,
  checkMarketplaceReachable,
  summarizeDoctor,
  type DoctorResult,
  type InstalledSdk
} from '../lib/doctor-checks.js'
import { SDK_PACKAGE_NAMES, firstResolved } from '../lib/package-names.js'
import { readCliToken } from '../lib/amc-host.js'

const DEFAULT_CLI_PORT = 19519

interface FetchOutcome {
  res: Response | null
  failure: string | null
}

function errorCode(err: unknown): string | null {
  const seen = new Set<unknown>()
  let current: unknown = err
  while (current && typeof current === 'object' && !seen.has(current)) {
    seen.add(current)
    const code = (current as { code?: unknown }).code
    if (typeof code === 'string' && code.length > 0) return code
    current = (current as { cause?: unknown }).cause
  }
  return null
}

function describeFetchFailure(err: unknown, ms: number): string {
  if (err instanceof Error && (err.name === 'AbortError' || err.name === 'TimeoutError')) {
    return `timed out after ${ms}ms`
  }
  const code = errorCode(err)
  if (code) return err instanceof Error ? `${code} (${err.message})` : code
  return err instanceof Error ? err.message : String(err)
}

async function fetchWithTimeout(url: string, ms: number, token?: string): Promise<FetchOutcome> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), ms)
  try {
    const res = await globalThis.fetch(url, {
      signal: controller.signal,
      ...(token ? { headers: { Authorization: `Bearer ${token}` } } : {})
    })
    return { res, failure: null }
  } catch (err) {
    return { res: null, failure: describeFetchFailure(err, ms) }
  } finally {
    clearTimeout(timer)
  }
}

function readPackageVersion(cwd: string, name: string): string | null {
  const pkgPath = path.join(cwd, 'node_modules', ...name.split('/'), 'package.json')
  try {
    return JSON.parse(fs.readFileSync(pkgPath, 'utf-8')).version ?? null
  } catch {
    return null
  }
}

function readInstalledSdk(cwd: string): InstalledSdk | null {
  const found = firstResolved(SDK_PACKAGE_NAMES, (name) => readPackageVersion(cwd, name))
  return found ? { name: found.name, version: found.value } : null
}

async function fetchLatestSdkVersion(): Promise<string | null> {
  const { res } = await fetchWithTimeout(
    `https://registry.npmjs.org/${SDK_PACKAGE_NAMES[0]}/latest`,
    3000
  )
  if (!res || !res.ok) return null
  try {
    return (await res.json() as { version?: string }).version ?? null
  } catch {
    return null
  }
}

export const doctorCommand = new Command('doctor')
  .description('Diagnose the local environment for plugin development')
  .option('--json', 'Output results as JSON')
  .action(async (opts: { json?: boolean }) => {
    const cwd = process.cwd()
    const port = Number(process.env.AMC_CLI_PORT) || DEFAULT_CLI_PORT

    // Manifest
    const manifestPath = path.join(cwd, 'manifest.json')
    let manifest: unknown | null = null
    let validation: { valid: boolean; errors: string[] } | null = null
    if (fs.existsSync(manifestPath)) {
      try {
        manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'))
        validation = validateManifest(manifest)
      } catch {
        manifest = {}
        validation = { valid: false, errors: ['manifest.json is not valid JSON'] }
      }
    }

    const token = readCliToken()
    const hostFetch = await fetchWithTimeout(
      `http://127.0.0.1:${port}/projects`,
      1500,
      token ?? undefined
    )
    const hostProbe = {
      reachable: hostFetch.res !== null,
      status: hostFetch.res ? hostFetch.res.status : null,
      hasToken: Boolean(token)
    }

    // Marketplace reachability
    const mktFetch = await fetchWithTimeout(`${getBaseUrl()}/getRegistry`, 3000)
    const marketplaceReachable = mktFetch.res !== null && mktFetch.res.ok
    const marketplaceFailure =
      mktFetch.failure ??
      (mktFetch.res && !mktFetch.res.ok ? `HTTP ${mktFetch.res.status}` : null)

    const latestSdk = await fetchLatestSdkVersion()

    const results: DoctorResult[] = [
      checkNodeVersion(process.version),
      checkSdkVersion(readInstalledSdk(cwd), latestSdk),
      checkManifest(manifest, validation),
      checkHostProbe(hostProbe, port),
      checkMarketplaceReachable(marketplaceReachable, marketplaceFailure)
    ]

    const summary = summarizeDoctor(results)

    if (opts.json) {
      console.log(JSON.stringify({ results, summary }, null, 2))
      if (summary.hasFailure) process.exitCode = 1
      return
    }

    heading('Omniscio Plugin Doctor')
    for (const r of results) {
      const line = `${r.name}: ${r.message}`
      if (r.status === 'pass') ok(line)
      else if (r.status === 'warn') warn(line)
      else fail(line)
      if (r.suggestion && r.status !== 'pass') console.log(`    → ${r.suggestion}`)
    }

    console.log('')
    const { pass, warn: warnCount, fail: failCount } = summary.counts
    const tally = `${pass} passed, ${warnCount} warning${warnCount === 1 ? '' : 's'}, ${failCount} failed`
    if (summary.hasFailure) {
      fail(tally)
      process.exitCode = 1
    } else if (warnCount > 0) {
      warn(tally)
    } else {
      ok(tally)
    }
  })
