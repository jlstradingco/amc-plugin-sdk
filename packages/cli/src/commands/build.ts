import { Command } from 'commander'
import * as path from 'node:path'
import * as fs from 'node:fs'
import { execSync } from 'node:child_process'
import { validateManifest } from '@agent-mc/plugin-sdk'
import { ok, fail, warn, info, actionableError, manifestNotFound } from '../lib/output.js'
import { isTypeScriptProject, copyNonTsFiles, resolveBannedScanDirs } from '../lib/project.js'
import { scanBannedImports } from '../lib/banned-imports.js'

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
      warnBannedImports(resolveBannedScanDirs(cwd, manifest))
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

    warnBannedImports(resolveBannedScanDirs(cwd, manifest))
    ok('Build complete')
  })

// `build` reports the SAME banned-import list `validate` enforces, but only as a
// warning — the author sees it early, and `validate` is where it hard-fails. This
// used to be a private copy of the scanner, which silently drifted: it stayed
// require-only after #32 taught the shared one to catch the ESM `import … from`
// form that tsc actually emits, and it never learned `child_process` at all.
function warnBannedImports(dirs: string[]): void {
  const warnings = dirs.flatMap(scanBannedImports)
  if (warnings.length > 0) {
    warn('Banned import warnings:')
    warnings.forEach(w => warn(`  ${w}`))
  }
}
