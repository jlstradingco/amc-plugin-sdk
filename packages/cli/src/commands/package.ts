import { Command } from 'commander'
import * as path from 'node:path'
import * as fs from 'node:fs'
import { execSync } from 'node:child_process'
import { validateManifest } from '@amc/plugin-sdk'
import { ok, fail, info, warn, manifestNotFound } from '../lib/output.js'

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

    const distDir = path.join(cwd, 'dist')
    if (!fs.existsSync(distDir)) {
      info('No dist/ found, building first...')
      execSync('npx tsc', { cwd, stdio: 'inherit' })
      const srcUi = path.join(cwd, 'src', 'ui')
      const distUi = path.join(cwd, 'dist', 'ui')
      if (fs.existsSync(srcUi)) {
        copyNonTsFiles(srcUi, distUi)
      }
    }

    const pluginId = manifest.plugin.id
    const version = manifest.plugin.version
    const outputName = `${pluginId}-${version}.amcplugin`
    const outputPath = path.join(cwd, outputName)

    // archiver v8 uses named exports (ZipArchive, TarArchive, etc.)
    // but @types/archiver@7 still declares a default-export factory.
    // Use a type assertion to access the actual runtime API.
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
        archive.directory(distDir, 'dist')
        const assetsDir = path.join(cwd, 'assets')
        if (fs.existsSync(assetsDir)) {
          archive.directory(assetsDir, 'assets')
        }
        archive.finalize()
      })
    } else {
      const filesToInclude = ['manifest.json', 'dist/']
      const assetsDir = path.join(cwd, 'assets')
      if (fs.existsSync(assetsDir)) filesToInclude.push('assets/')

      execSync(`tar -czf "${outputName}" ${filesToInclude.join(' ')}`, { cwd, stdio: 'pipe' })
    }

    const stats = fs.statSync(outputPath)
    const sizeMB = (stats.size / 1024 / 1024).toFixed(2)

    ok(`Packaged: ${outputName} (${sizeMB} MB)`)

    if (stats.size > 50 * 1024 * 1024) {
      warn('Package exceeds 50 MB marketplace limit')
    }
  })

function copyNonTsFiles(src: string, dest: string) {
  if (!fs.existsSync(dest)) fs.mkdirSync(dest, { recursive: true })
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    const srcPath = path.join(src, entry.name)
    const destPath = path.join(dest, entry.name)
    if (entry.isDirectory()) {
      copyNonTsFiles(srcPath, destPath)
    } else if (!entry.name.endsWith('.ts')) {
      fs.copyFileSync(srcPath, destPath)
    }
  }
}
