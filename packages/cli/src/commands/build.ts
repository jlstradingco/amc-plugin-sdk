import { Command } from 'commander'
import * as path from 'node:path'
import * as fs from 'node:fs'
import { validateManifest } from '@agent-mc/plugin-sdk'
import { ok, fail, warn, info, actionableError, manifestNotFound } from '../lib/output.js'
import { isTypeScriptProject, resolveBannedScanDirs } from '../lib/project.js'
import { compilePlugin } from '../lib/compile.js'
import { scanBannedImports } from '../lib/banned-imports.js'

export const buildCommand = new Command('build')
  .description('Compile plugin TypeScript, bundle each panel script, and validate manifest')
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

    if (!isTypeScriptProject(cwd)) {
      info('No tsconfig.json — flat plugin, skipping TypeScript compilation')
      warnBannedImports(resolveBannedScanDirs(cwd, manifest))
      ok('Build complete (flat plugin)')
      return
    }

    info('Compiling TypeScript and bundling panel scripts...')
    try {
      const bundles = compilePlugin(cwd)
      bundles.forEach(b => ok(`Bundled ${path.relative(cwd, b.outfile)}`))
    } catch {
      actionableError('Build failed', 'Check the errors above and fix your source files.')
      process.exit(1)
    }

    warnBannedImports(resolveBannedScanDirs(cwd, manifest))
    ok('Build complete')
  })

function warnBannedImports(dirs: string[]): void {
  const warnings = dirs.flatMap(scanBannedImports)
  if (warnings.length > 0) {
    warn('Banned import warnings:')
    warnings.forEach(w => warn(`  ${w}`))
  }
}
