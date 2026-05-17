import { Command } from 'commander'
import * as path from 'node:path'
import * as fs from 'node:fs'
import { execSync } from 'node:child_process'
import { validateManifest } from '@amc/plugin-sdk'

export const packageCommand = new Command('package')
  .description('Bundle plugin into a .amcplugin archive')
  .action(async () => {
    const cwd = process.cwd()

    const manifestPath = path.join(cwd, 'manifest.json')
    if (!fs.existsSync(manifestPath)) {
      console.error('No manifest.json found')
      process.exit(1)
    }

    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'))
    const result = validateManifest(manifest)
    if (!result.valid) {
      console.error('Manifest validation failed:')
      result.errors.forEach(e => console.error(`  - ${e}`))
      process.exit(1)
    }

    const distDir = path.join(cwd, 'dist')
    if (!fs.existsSync(distDir)) {
      console.log('No dist/ found, building first...')
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

    const archiver = await import('archiver').catch(() => null)

    if (archiver) {
      const archive = archiver.default('zip', { zlib: { level: 9 } })
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

    console.log(`\nPackaged: ${outputName} (${sizeMB} MB)`)

    if (stats.size > 50 * 1024 * 1024) {
      console.warn('WARNING: Package exceeds 50 MB marketplace limit')
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
