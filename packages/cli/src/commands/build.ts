import { Command } from 'commander'
import * as path from 'node:path'
import * as fs from 'node:fs'
import { execSync } from 'node:child_process'
import { validateManifest } from '@agent-mc/plugin-sdk'
import { ok, fail, warn, info, actionableError, manifestNotFound } from '../lib/output.js'
import { isTypeScriptProject, copyNonTsFiles, collectFlatPackageEntries } from '../lib/project.js'

export const buildCommand = new Command('build')
  .description('Compile plugin TypeScript to JavaScript and validate manifest')
  .action(async () => {
    const cwd = process.cwd()
    const manifestPath = path.join(cwd, 'manifest.json')

    if (!fs.existsSync(manifestPath)) {
      manifestNotFound()
    }

    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'))
    const result = validateManifest(manifest)
    if (!result.valid) {
      fail('Manifest validation failed:')
      result.errors.forEach(e => console.error(`  - ${e}`))
      process.exit(1)
    }
    ok('Manifest validated')

    // Flat-JS / webview plugins have no TypeScript compile step — their files
    // ship as-authored. Running tsc here would hang (nothing to compile).
    if (!isTypeScriptProject(cwd)) {
      info('No tsconfig.json — flat plugin, skipping TypeScript compilation')
      warnBannedImports(collectFlatPackageEntries(cwd, manifest).map(e => path.join(cwd, e)))
      ok('Build complete (flat plugin)')
      return
    }

    info('Compiling TypeScript...')
    try {
      execSync('npx tsc', { cwd, stdio: 'inherit' })
    } catch {
      actionableError('TypeScript compilation failed', 'Check the errors above and fix your source files.')
      process.exit(1)
    }

    const srcUi = path.join(cwd, 'src', 'ui')
    const distUi = path.join(cwd, 'dist', 'ui')
    if (fs.existsSync(srcUi)) {
      copyNonTsFiles(srcUi, distUi)
    }

    warnBannedImports([path.join(cwd, 'dist')])
    ok('Build complete')
  })

function warnBannedImports(dirs: string[]): void {
  const warnings = dirs.flatMap(scanBannedImports)
  if (warnings.length > 0) {
    warn('Banned import warnings:')
    warnings.forEach(w => warn(`  ${w}`))
  }
}

const BANNED_PATTERNS = [
  /require\(['"]electron['"]\)/,
  /from\s+['"]electron['"]/,
  /require\(['"]better-sqlite3['"]\)/,
  /require\(['"]node:worker_threads['"]\)/,
]

function scanBannedImports(dir: string): string[] {
  const warnings: string[] = []
  if (!fs.existsSync(dir) || !fs.statSync(dir).isDirectory()) return warnings

  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const fullPath = path.join(dir, entry.name)
    if (entry.isDirectory()) {
      warnings.push(...scanBannedImports(fullPath))
    } else if (entry.name.endsWith('.js')) {
      const content = fs.readFileSync(fullPath, 'utf-8')
      for (const pattern of BANNED_PATTERNS) {
        if (pattern.test(content)) {
          warnings.push(`${fullPath}: banned import matching ${pattern}`)
        }
      }
    }
  }
  return warnings
}
