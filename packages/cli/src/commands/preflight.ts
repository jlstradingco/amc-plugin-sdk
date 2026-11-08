import { Command } from 'commander'
import * as path from 'node:path'
import * as fs from 'node:fs'
import { execFileSync } from 'node:child_process'
import chalk from 'chalk'
import { validateManifest } from '@agent-mc/plugin-sdk'
import { getRegistry } from '../lib/marketplace-api.js'
import { commandTablesPreflight } from '../lib/command-tables.js'
import {
  checkVersionAgainstRegistry,
  checkChangelog,
  checkPackageSize,
  checkDeclaredPermissions,
  checkListingCompleteness,
  checkReadmeIsStoreText,
  checkBannedImports,
  summarizePreflight,
  type PreflightResult
} from '../lib/publish-preflight.js'
import { findRootReadme, resolveBannedScanDirs } from '../lib/project.js'
import { readPluginIdentity, selectPackage } from '../lib/package-selection.js'
import { scanBannedImports } from '../lib/banned-imports.js'
import { pageScriptsResult } from '../lib/page-scripts.js'
import { ok, fail, warn, info, heading, actionableError, manifestNotFound } from '../lib/output.js'

export interface PreflightRunResult {
  results: PreflightResult[]
  hasFailure: boolean
}

export function bannedImportsResult(cwd: string, manifest: unknown): PreflightResult {
  const scanDirs = resolveBannedScanDirs(cwd, manifest as Parameters<typeof resolveBannedScanDirs>[1])
  const hits = scanDirs.flatMap(scanBannedImports).map(hit => hit.split(cwd + path.sep).join(''))
  return checkBannedImports(hits, scanDirs.length)
}

export function readmeStoreTextResult(cwd: string): PreflightResult {
  const readme = findRootReadme(cwd)
  return checkReadmeIsStoreText(readme ? fs.readFileSync(path.join(cwd, readme), 'utf-8') : null)
}

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

  let publishedVersion: string | null = null
  try {
    const registry = await getRegistry()
    publishedVersion = registry.plugins.find(p => p.id === pluginId)?.version ?? null
  } catch {
  }

  const results: PreflightResult[] = []
  results.push(checkVersionAgainstRegistry(manifestVersion, publishedVersion))
  results.push(checkChangelog(opts.changelog ?? null))
  results.push(checkDeclaredPermissions(manifest.permissions))
  results.push(commandTablesPreflight(manifest))
  results.push(checkListingCompleteness({
    hasReadme: findRootReadme(cwd) !== null,
    screenshots: manifest.plugin.screenshots,
    links: manifest.plugin.links
  }))

  results.push(readmeStoreTextResult(cwd))
  results.push(bannedImportsResult(cwd, manifest))

  let packagePath = opts.packagePath
  if (!packagePath) {
    const selection = selectPackage(cwd, { id: pluginId, version: manifestVersion })
    if (selection.kind === 'refused') {
      results.push({ name: 'Package', status: 'fail', message: selection.message, suggestion: selection.suggestion })
    }
    if (selection.kind === 'selected') packagePath = selection.path
  }
  const packageOnDisk = packagePath && fs.existsSync(packagePath) ? packagePath : undefined
  results.push(pageScriptsResult(cwd, manifest, packageOnDisk))
  if (packageOnDisk) results.push(checkPackageSize(fs.statSync(packageOnDisk).size))

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

export function locatePackage(cwd: string, explicit?: string): string {
  const identity = readPluginIdentity(cwd)
  let selection = selectPackage(cwd, identity, explicit)
  if (selection.kind === 'none') {
    info('No .amcplugin found. Running `amc-plugin package` first...')
    execFileSync(process.execPath, [process.argv[1], 'package'], { cwd, stdio: 'inherit' })
    selection = selectPackage(cwd, identity)
  }
  if (selection.kind === 'selected') return selection.path
  if (selection.kind === 'refused') actionableError(selection.message, selection.suggestion)
  else fail('Could not find or create .amcplugin package')
  process.exit(1)
}

export const preflightCommand = new Command('preflight')
  .description('Run publish readiness checks without uploading')
  .option('--changelog <text>', 'Changelog for this version (checked for presence)')
  .option('--package <path>', 'The .amcplugin to check; required when the folder holds more than one')
  .action(async (opts: { changelog?: string; package?: string }) => {
    const cwd = process.cwd()
    const packagePath = locatePackage(cwd, opts.package)

    const { results, hasFailure } = await runPreflight(cwd, { changelog: opts.changelog, packagePath })
    renderPreflight(results)

    if (hasFailure) {
      fail('Preflight failed — resolve the issues above before publishing.')
      process.exit(1)
    }
    ok('Preflight passed — ready to publish.')
  })
