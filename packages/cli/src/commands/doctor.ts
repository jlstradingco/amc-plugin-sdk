import { Command } from 'commander'
import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'
import { validateManifest } from '@agent-mc/plugin-sdk'
import { getBaseUrl } from '../lib/auth.js'
import { ok, fail, warn, heading } from '../lib/output.js'
import {
  checkNodeVersion,
  checkSdkVersion,
  checkManifest,
  checkHostReachable,
  checkCliToken,
  checkMarketplaceReachable,
  summarizeDoctor,
  type DoctorResult
} from '../lib/doctor-checks.js'

const DEFAULT_CLI_PORT = 19519

async function fetchWithTimeout(url: string, ms: number): Promise<Response | null> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), ms)
  try {
    return await globalThis.fetch(url, { signal: controller.signal })
  } catch {
    return null
  } finally {
    clearTimeout(timer)
  }
}

function readInstalledSdkVersion(cwd: string): string | null {
  const pkgPath = path.join(cwd, 'node_modules', '@agent-mc', 'plugin-sdk', 'package.json')
  try {
    return JSON.parse(fs.readFileSync(pkgPath, 'utf-8')).version ?? null
  } catch {
    return null
  }
}

async function fetchLatestSdkVersion(): Promise<string | null> {
  const res = await fetchWithTimeout('https://registry.npmjs.org/@agent-mc/plugin-sdk/latest', 3000)
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

    // Host reachability (any HTTP response — even 401 — means it is listening)
    const hostRes = await fetchWithTimeout(`http://127.0.0.1:${port}/`, 1500)
    const hostReachable = hostRes !== null

    // Marketplace reachability
    const mktRes = await fetchWithTimeout(`${getBaseUrl()}/getRegistry`, 3000)
    const marketplaceReachable = mktRes !== null && mktRes.ok

    const tokenExists =
      fs.existsSync(path.join(os.homedir(), '.amc', 'cli-token')) ||
      Boolean(process.env.AMC_CLI_TOKEN)
    const latestSdk = await fetchLatestSdkVersion()

    const results: DoctorResult[] = [
      checkNodeVersion(process.version),
      checkSdkVersion(readInstalledSdkVersion(cwd), latestSdk),
      checkManifest(manifest, validation),
      checkHostReachable(hostReachable, port),
      checkCliToken(tokenExists),
      checkMarketplaceReachable(marketplaceReachable)
    ]

    const summary = summarizeDoctor(results)

    if (opts.json) {
      console.log(JSON.stringify({ results, summary }, null, 2))
      if (summary.hasFailure) process.exitCode = 1
      return
    }

    heading('AMC Plugin Doctor')
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
