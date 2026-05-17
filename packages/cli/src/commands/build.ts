import { Command } from 'commander'
import * as path from 'node:path'
import * as fs from 'node:fs'
import { execSync } from 'node:child_process'
import { validateManifest } from '@amc/plugin-sdk'

export const buildCommand = new Command('build')
  .description('Compile plugin TypeScript to JavaScript and validate manifest')
  .action(async () => {
    const cwd = process.cwd()
    const manifestPath = path.join(cwd, 'manifest.json')

    if (!fs.existsSync(manifestPath)) {
      console.error('No manifest.json found in current directory')
      process.exit(1)
    }

    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'))
    const result = validateManifest(manifest)
    if (!result.valid) {
      console.error('Manifest validation failed:')
      result.errors.forEach(e => console.error(`  - ${e}`))
      process.exit(1)
    }
    console.log('Manifest validated')

    console.log('Compiling TypeScript...')
    try {
      execSync('npx tsc', { cwd, stdio: 'inherit' })
    } catch {
      console.error('TypeScript compilation failed')
      process.exit(1)
    }

    const srcUi = path.join(cwd, 'src', 'ui')
    const distUi = path.join(cwd, 'dist', 'ui')
    if (fs.existsSync(srcUi)) {
      copyNonTsFiles(srcUi, distUi)
    }

    const warnings = scanBannedImports(path.join(cwd, 'dist'))
    if (warnings.length > 0) {
      console.warn('\nBanned import warnings:')
      warnings.forEach(w => console.warn(`  - ${w}`))
    }

    console.log('\nBuild complete')
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

const BANNED_PATTERNS = [
  /require\(['"]electron['"]\)/,
  /require\(['"]child_process['"]\)/,
  /require\(['"]node:child_process['"]\)/,
  /from\s+['"]electron['"]/,
  /from\s+['"]child_process['"]/,
  /from\s+['"]node:child_process['"]/,
  /require\(['"]better-sqlite3['"]\)/,
  /require\(['"]node:worker_threads['"]\)/,
]

function scanBannedImports(dir: string): string[] {
  const warnings: string[] = []
  if (!fs.existsSync(dir)) return warnings

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
