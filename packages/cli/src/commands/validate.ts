import { Command } from 'commander'
import * as path from 'node:path'
import * as fs from 'node:fs'
import { execSync } from 'node:child_process'
import { validateManifest, classifyPluginIcon } from '@omniscio/plugin-sdk'
import { ok, fail, warn, manifestNotFound } from '../lib/output.js'
import {
  isTypeScriptProject,
  resolveBannedScanDirs,
  collectPackageEntries,
  entryPointShips,
  entryPointState,
} from '../lib/project.js'
import { scanBannedImports } from '../lib/banned-imports.js'
import { reportCommandTables } from '../lib/command-tables.js'

function reportEntryPoint(
  cwd: string,
  label: string,
  entryPoint: string,
  compiledFromTs = false
): 'built' | 'unbuilt' | 'error' {
  const { state, source, buildDir } = entryPointState(cwd, entryPoint, compiledFromTs)
  if (state === 'missing') {
    fail(`${label} not found: ${entryPoint}`)
    return 'error'
  }
  if (state === 'stale') {
    fail(
      `${label} ${entryPoint} is missing from ${buildDir}/ although its source ${source} exists. ` +
        `Your build is out of date: run amc-plugin build.`
    )
    return 'error'
  }
  if (state === 'unbuilt') {
    warn(
      `${label} ${entryPoint} is not built yet, so validate checked its source ${source} instead. ` +
        `Run amc-plugin build before you package or publish.`
    )
  }
  return state
}

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
      const shipped = collectPackageEntries(cwd, manifest)
      if (fs.existsSync(iconFile) && !shipped.includes(manifest.plugin.icon.split('/')[0])) {
        fail(
          `Icon file ${manifest.plugin.icon} will not be shipped: the package contains only ` +
            `${shipped.join(', ')}. Move it under assets/ and update plugin.icon.`
        )
        hasErrors = true
      } else if (fs.existsSync(iconFile)) {
        ok(`Icon file present (${manifest.plugin.icon})`)
      } else {
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

    const uiPages: Array<{ label: string; entryPoint: string | undefined }> = [
      { label: 'UI entry point', entryPoint: manifest.ui?.entryPoint },
      { label: 'Widget entry point', entryPoint: manifest.ui?.widget?.entryPoint },
    ]
    for (const { label, entryPoint } of uiPages) {
      if (!entryPoint) continue
      const found = reportEntryPoint(cwd, label, entryPoint)
      if (found === 'error') {
        hasErrors = true
        continue
      }
      const { ships, entries: shipped } = entryPointShips(cwd, manifest, entryPoint)
      if (!ships) {
        fail(
          `${label} ${entryPoint} will not be shipped: the package contains only ` +
            `${shipped.join(', ')}.`
        )
        hasErrors = true
      } else if (found === 'built') {
        ok(`${label} exists (${entryPoint})`)
      }
    }

    if (manifest.backend?.entryPoint) {
      const found = reportEntryPoint(cwd, 'Backend entry point', manifest.backend.entryPoint, true)
      if (found === 'error') hasErrors = true
      else if (found === 'built') ok(`Backend entry point exists (${manifest.backend.entryPoint})`)
    }

    const flat = !isTypeScriptProject(cwd)

    if (!flat) {
      try {
        execSync('npx tsc --noEmit', { cwd, stdio: 'pipe' })
        ok('TypeScript compilation')
      } catch {
        fail('TypeScript compilation errors')
        hasErrors = true
      }
    }

    const scanDirs = resolveBannedScanDirs(cwd, manifest)
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

    if (reportCommandTables(manifest, scanDirs, cwd)) hasErrors = true

    if (hasErrors) {
      fail('Validation failed')
      process.exit(1)
    }

    ok('All checks passed')
  })
