import { Command } from 'commander'
import * as path from 'node:path'
import * as fs from 'node:fs'
import { execSync } from 'node:child_process'
import chalk from 'chalk'
import { validateManifest } from '@agent-mc/plugin-sdk'
import { getRegistry } from '../lib/marketplace-api.js'
import {
  checkVersionAgainstRegistry,
  checkChangelog,
  checkPackageSize,
  checkDeclaredPermissions,
  summarizePreflight,
  type PreflightResult
} from '../lib/publish-preflight.js'
import { ok, fail, warn, info, heading, manifestNotFound } from '../lib/output.js'

export interface PreflightRunResult {
  results: PreflightResult[]
  hasFailure: boolean
}

// Gathers all raw inputs (manifest, published version, package size) and runs
// the pure preflight checks. Shared by the standalone `preflight` command and
// the `publish` preflight gate.
export async function runPreflight(
  cwd: string,
  opts: { changelog?: string; packagePath?: string } = {}
): Promise<PreflightRunResult> {
  const manifestPath = path.join(cwd, 'manifest.json')
  if (!fs.existsSync(manifestPath)) manifestNotFound()

  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'))
  const validation = validateManifest(manifest)
  if (!validation.valid) {
    return {
      hasFailure: true,
      results: [
        {
          name: 'Manifest',
          status: 'fail',
          message: `manifest.json is invalid: ${validation.errors[0] ?? 'unknown error'}`,
          suggestion: "Run 'amc-plugin validate' to see all manifest errors."
        }
      ]
    }
  }

  const pluginId: string = manifest.plugin.id
  const manifestVersion: string = manifest.plugin.version

  // Published version from the marketplace registry (null = never published).
  let publishedVersion: string | null = null
  try {
    const registry = await getRegistry()
    publishedVersion = registry.plugins.find(p => p.id === pluginId)?.version ?? null
  } catch {
    // Registry unreachable — skip the immutable-version guard rather than block.
  }

  const results: PreflightResult[] = []
  results.push(checkVersionAgainstRegistry(manifestVersion, publishedVersion))
  results.push(checkChangelog(opts.changelog ?? null))
  results.push(checkDeclaredPermissions(manifest.permissions))

  const packagePath = opts.packagePath ?? findPackage(cwd)
  if (packagePath && fs.existsSync(packagePath)) {
    results.push(checkPackageSize(fs.statSync(packagePath).size))
  }

  const { hasFailure } = summarizePreflight(results)
  return { results, hasFailure }
}

export function renderPreflight(results: PreflightResult[]): void {
  heading('Publish Preflight')
  for (const r of results) {
    if (r.status === 'pass') ok(`${r.name}: ${r.message}`)
    else if (r.status === 'warn') warn(`${r.name}: ${r.message}`)
    else fail(`${r.name}: ${r.message}`)
    if (r.suggestion && r.status !== 'pass') console.log(chalk.dim(`  → ${r.suggestion}`))
  }
  console.log()
}

function findPackage(dir: string): string | null {
  const files = fs.readdirSync(dir)
  const amcFile = files.find(f => f.endsWith('.amcplugin'))
  if (amcFile) return path.join(dir, amcFile)

  const distDir = path.join(dir, 'dist')
  if (fs.existsSync(distDir)) {
    const distFiles = fs.readdirSync(distDir)
    const distAmcFile = distFiles.find(f => f.endsWith('.amcplugin'))
    if (distAmcFile) return path.join(distDir, distAmcFile)
  }
  return null
}

export const preflightCommand = new Command('preflight')
  .description('Run publish readiness checks without uploading')
  .option('--changelog <text>', 'Changelog for this version (checked for presence)')
  .action(async (opts: { changelog?: string }) => {
    const cwd = process.cwd()

    // Build a package if one is not present so the size check has something to measure.
    let packagePath: string | undefined = findPackage(cwd) ?? undefined
    if (!packagePath) {
      info('No .amcplugin found. Running `amc-plugin package` first...')
      execSync('npx amc-plugin package', { cwd, stdio: 'inherit' })
      packagePath = findPackage(cwd) ?? undefined
    }

    const { results, hasFailure } = await runPreflight(cwd, { changelog: opts.changelog, packagePath })
    renderPreflight(results)

    if (hasFailure) {
      fail('Preflight failed — resolve the issues above before publishing.')
      process.exit(1)
    }
    ok('Preflight passed — ready to publish.')
  })
