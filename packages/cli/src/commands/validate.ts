import { Command } from 'commander'
import * as path from 'node:path'
import * as fs from 'node:fs'
import { execSync } from 'node:child_process'
import { validateManifest, classifyPluginIcon } from '@agent-mc/plugin-sdk'
import { ok, fail, warn, manifestNotFound } from '../lib/output.js'
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

    // WARN, never fail: a stock glyph is a legitimate choice, just rarely the one a developer
    // meant to make. `icon` accepts a Lucide NAME (a generic glyph) or a PATH into your
    // package (your actual logo), the schema is `z.string().min(1)`, and nothing distinguished
    // them -- so 16 of the 17 plugins on the live registry shipped a stock glyph, several
    // while carrying a perfectly good logo in their own package. Exit code is unchanged.
    const iconKind = classifyPluginIcon(manifest.plugin?.icon)
    if (iconKind === 'lucide-name') {
      warn(
        `Icon "${manifest.plugin?.icon}" is a Lucide icon NAME, so Omniscio will draw a generic ` +
          `stock glyph rather than your logo.`
      )
      console.warn(
        `    To show your own logo, point plugin.icon at an image in your package ` +
          `(for example "assets/icon.svg") and keep the name as ui.sidebar.icon, ` +
          `which is the fallback glyph.`
      )
    } else if (iconKind === 'unsafe-path') {
      fail(
        `Icon "${manifest.plugin?.icon}" is not a usable path — it must be a plain, relative ` +
          `path inside your package (no "..", no leading "/", no drive letter or URL scheme).`
      )
      hasErrors = true
    } else if (iconKind === 'packaged-path') {
      const iconFile = path.join(cwd, manifest.plugin.icon)
      if (fs.existsSync(iconFile)) {
        ok(`Icon file present (${manifest.plugin.icon})`)
      } else {
        // The marketplace's extractor silently skips a missing icon and publishes anyway, so
        // catching it here is the only place it is ever visible.
        fail(`Icon file not found in the package: ${manifest.plugin.icon}`)
        hasErrors = true
      }
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
