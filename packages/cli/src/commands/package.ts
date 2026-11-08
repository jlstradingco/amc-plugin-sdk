import { Command } from 'commander'
import * as path from 'node:path'
import * as fs from 'node:fs'
import { execSync } from 'node:child_process'
import { validateManifest } from '@agent-mc/plugin-sdk'
import { ok, fail, info, warn, actionableError, manifestNotFound } from '../lib/output.js'
import { isTypeScriptProject, collectPackageEntries } from '../lib/project.js'
import { compilePlugin } from '../lib/compile.js'
import { pageScriptsResult } from '../lib/page-scripts.js'

export const packageCommand = new Command('package')
  .description('Bundle plugin into a .amcplugin archive')
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

    const flat = !isTypeScriptProject(cwd)

    if (!flat && !fs.existsSync(path.join(cwd, 'dist'))) {
      info('No dist/ found, building first...')
      try {
        compilePlugin(cwd)
      } catch {
        actionableError('Build failed', 'Check the errors above and fix your source files.')
        process.exit(1)
      }
    }

    const pageScripts = pageScriptsResult(cwd, manifest)
    if (pageScripts.status === 'fail') {
      actionableError(`${pageScripts.name}: ${pageScripts.message}`, pageScripts.suggestion ?? '')
      process.exit(1)
    }

    const rootEntries = collectPackageEntries(cwd, manifest)

    const pluginId = manifest.plugin.id
    const version = manifest.plugin.version
    const outputName = `${pluginId}-${version}.amcplugin`
    const outputPath = path.join(cwd, outputName)

    const archiverMod = await import('archiver').catch(() => null) as
      | { ZipArchive: new (opts: { zlib: { level: number } }) => import('archiver').Archiver }
      | null

    if (archiverMod) {
      const archive = new archiverMod.ZipArchive({ zlib: { level: 9 } })
      const output = fs.createWriteStream(outputPath)

      await new Promise<void>((resolve, reject) => {
        output.on('close', resolve)
        archive.on('error', reject)
        archive.pipe(output)
        archive.file(manifestPath, { name: 'manifest.json' })
        for (const entry of rootEntries) {
          const full = path.join(cwd, entry)
          if (fs.statSync(full).isDirectory()) {
            archive.directory(full, entry)
          } else {
            archive.file(full, { name: entry })
          }
        }
        archive.finalize()
      })
    } else {
      execSync(`tar -czf "${outputName}" manifest.json ${rootEntries.join(' ')}`, { cwd, stdio: 'pipe' })
    }

    const stats = fs.statSync(outputPath)
    const sizeMB = (stats.size / 1024 / 1024).toFixed(2)

    ok(`Packaged: ${outputName} (${sizeMB} MB)`)

    if (stats.size > 50 * 1024 * 1024) {
      warn('Package exceeds 50 MB marketplace limit')
    }
  })
