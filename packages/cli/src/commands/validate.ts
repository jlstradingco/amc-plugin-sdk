import { Command } from 'commander'
import * as path from 'node:path'
import * as fs from 'node:fs'
import { execSync } from 'node:child_process'
import { validateManifest } from '@agent-mc/plugin-sdk'
import { ok, fail, manifestNotFound } from '../lib/output.js'
import { isTypeScriptProject, collectFlatPackageEntries } from '../lib/project.js'
import { scanBannedImports } from '../lib/banned-imports.js'

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

    const flat = !isTypeScriptProject(cwd)

    // Flat-JS / webview plugins have no compile step — running tsc would hang.
    if (!flat) {
      try {
        execSync('npx tsc --noEmit', { cwd, stdio: 'pipe' })
        ok('TypeScript compilation')
      } catch {
        fail('TypeScript compilation errors')
        hasErrors = true
      }
    }

    // Scan for banned imports: TS plugins in dist/, flat plugins in their
    // as-authored entry dirs.
    const scanDirs = flat
      ? collectFlatPackageEntries(cwd, manifest).map(e => path.join(cwd, e))
      : [path.join(cwd, 'dist')].filter(d => fs.existsSync(d))
    if (scanDirs.length > 0) {
      const banned = scanDirs.flatMap(scanBannedImports)
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
