import { Command } from 'commander'
import * as path from 'node:path'
import * as fs from 'node:fs'
import { execSync } from 'node:child_process'
import { validateManifest } from '@agent-mc/plugin-sdk'
import { ok, fail, manifestNotFound } from '../lib/output.js'

export const validateCommand = new Command('validate')
  .description('Run all validation checks without building (CI-friendly)')
  .action(async () => {
    const cwd = process.cwd()
    let hasErrors = false

    const manifestPath = path.join(cwd, 'manifest.json')
    if (!fs.existsSync(manifestPath)) {
      manifestNotFound()
    }

    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'))
    const result = validateManifest(manifest)
    if (!result.valid) {
      fail('Manifest validation')
      result.errors.forEach(e => console.error(`  - ${e}`))
      hasErrors = true
    } else {
      ok('Manifest schema')
    }

    if (manifest.sdkVersion) {
      ok(`SDK version declared (${manifest.sdkVersion})`)
    } else {
      fail('Missing sdkVersion in manifest')
      hasErrors = true
    }

    if (manifest.ui?.entryPoint) {
      const srcPath = path.join(cwd, 'src', manifest.ui.entryPoint.replace('dist/', ''))
      const distPath = path.join(cwd, manifest.ui.entryPoint)
      if (!fs.existsSync(srcPath) && !fs.existsSync(distPath)) {
        fail(`UI entry point not found: ${manifest.ui.entryPoint}`)
        hasErrors = true
      } else {
        ok('UI entry point exists')
      }
    }

    if (manifest.backend?.entryPoint) {
      const srcPath = path.join(cwd, 'src', manifest.backend.entryPoint.replace('dist/', '').replace('.js', '.ts'))
      const distPath = path.join(cwd, manifest.backend.entryPoint)
      if (!fs.existsSync(srcPath) && !fs.existsSync(distPath)) {
        fail(`Backend entry point not found: ${manifest.backend.entryPoint}`)
        hasErrors = true
      } else {
        ok('Backend entry point exists')
      }
    }

    try {
      execSync('npx tsc --noEmit', { cwd, stdio: 'pipe' })
      ok('TypeScript compilation')
    } catch {
      fail('TypeScript compilation errors')
      hasErrors = true
    }

    const distDir = path.join(cwd, 'dist')
    if (fs.existsSync(distDir)) {
      const banned = scanBannedImportsStrict(distDir)
      if (banned.length > 0) {
        fail('Banned imports detected')
        banned.forEach(b => console.error(`  - ${b}`))
        hasErrors = true
      } else {
        ok('No banned imports')
      }
    }

    if (hasErrors) {
      fail('Validation failed')
      process.exit(1)
    }

    ok('All checks passed')
  })

const BANNED_PATTERNS = [
  /require\(['"]electron['"]\)/,
  /from\s+['"]electron['"]/,
  /require\(['"]better-sqlite3['"]\)/,
  /require\(['"]node:worker_threads['"]\)/,
]

function scanBannedImportsStrict(dir: string): string[] {
  const errors: string[] = []
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const fullPath = path.join(dir, entry.name)
    if (entry.isDirectory()) {
      errors.push(...scanBannedImportsStrict(fullPath))
    } else if (entry.name.endsWith('.js')) {
      const content = fs.readFileSync(fullPath, 'utf-8')
      for (const pattern of BANNED_PATTERNS) {
        if (pattern.test(content)) {
          errors.push(`${fullPath}: ${pattern}`)
        }
      }
    }
  }
  return errors
}
