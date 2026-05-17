import { Command } from 'commander'
import * as path from 'node:path'
import * as fs from 'node:fs'
import { execSync } from 'node:child_process'
import { validateManifest } from '@amc/plugin-sdk'

export const validateCommand = new Command('validate')
  .description('Run all validation checks without building (CI-friendly)')
  .action(async () => {
    const cwd = process.cwd()
    let hasErrors = false

    const manifestPath = path.join(cwd, 'manifest.json')
    if (!fs.existsSync(manifestPath)) {
      console.error('FAIL: No manifest.json found')
      process.exit(1)
    }

    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'))
    const result = validateManifest(manifest)
    if (!result.valid) {
      console.error('FAIL: Manifest validation')
      result.errors.forEach(e => console.error(`  - ${e}`))
      hasErrors = true
    } else {
      console.log('PASS: Manifest schema')
    }

    if (manifest.sdkVersion) {
      console.log(`PASS: SDK version declared (${manifest.sdkVersion})`)
    } else {
      console.error('FAIL: Missing sdkVersion in manifest')
      hasErrors = true
    }

    if (manifest.ui?.entryPoint) {
      const srcPath = path.join(cwd, 'src', manifest.ui.entryPoint.replace('dist/', ''))
      const distPath = path.join(cwd, manifest.ui.entryPoint)
      if (!fs.existsSync(srcPath) && !fs.existsSync(distPath)) {
        console.error(`FAIL: UI entry point not found: ${manifest.ui.entryPoint}`)
        hasErrors = true
      } else {
        console.log('PASS: UI entry point exists')
      }
    }

    if (manifest.backend?.entryPoint) {
      const srcPath = path.join(cwd, 'src', manifest.backend.entryPoint.replace('dist/', '').replace('.js', '.ts'))
      const distPath = path.join(cwd, manifest.backend.entryPoint)
      if (!fs.existsSync(srcPath) && !fs.existsSync(distPath)) {
        console.error(`FAIL: Backend entry point not found: ${manifest.backend.entryPoint}`)
        hasErrors = true
      } else {
        console.log('PASS: Backend entry point exists')
      }
    }

    try {
      execSync('npx tsc --noEmit', { cwd, stdio: 'pipe' })
      console.log('PASS: TypeScript compilation')
    } catch {
      console.error('FAIL: TypeScript compilation errors')
      hasErrors = true
    }

    const distDir = path.join(cwd, 'dist')
    if (fs.existsSync(distDir)) {
      const banned = scanBannedImportsStrict(distDir)
      if (banned.length > 0) {
        console.error('FAIL: Banned imports detected')
        banned.forEach(b => console.error(`  - ${b}`))
        hasErrors = true
      } else {
        console.log('PASS: No banned imports')
      }
    }

    if (hasErrors) {
      console.error('\nValidation FAILED')
      process.exit(1)
    }

    console.log('\nAll checks PASSED')
  })

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
