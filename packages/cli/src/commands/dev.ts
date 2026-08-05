import { Command } from 'commander'
import * as path from 'node:path'
import * as fs from 'node:fs'
import { execSync, spawn } from 'node:child_process'
import { createRequire } from 'node:module'
import { validateManifest } from '@agent-mc/plugin-sdk'
import { ok, fail, info, filePath, manifestNotFound, actionableError } from '../lib/output.js'
import { isTypeScriptProject } from '../lib/project.js'

const require = createRequire(import.meta.url)

export const devCommand = new Command('dev')
  .description('Launch the dev shell with hot-reload for local plugin development')
  .option('--no-build', 'Skip the initial TypeScript build')
  .action(async (opts: { build: boolean }) => {
    const cwd = process.cwd()
    const manifestPath = path.join(cwd, 'manifest.json')

    if (!fs.existsSync(manifestPath)) {
      manifestNotFound()
    }

    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'))
    const result = validateManifest(manifest)
    if (!result.valid) {
      fail('Manifest validation failed:')
      result.errors.forEach((e) => console.error(`  - ${e}`))
      process.exit(1)
    }
    ok('Manifest valid')

    // Flat-JS / webview plugins have no compile step — never run tsc for them.
    const distDir = path.join(cwd, 'dist')
    if (opts.build && isTypeScriptProject(cwd) && !fs.existsSync(distDir)) {
      info('Building TypeScript...')
      try {
        execSync('npx tsc', { cwd, stdio: 'inherit' })

        // Copy non-TS UI files
        const srcUi = path.join(cwd, 'src', 'ui')
        const distUi = path.join(cwd, 'dist', 'ui')
        if (fs.existsSync(srcUi)) {
          copyNonTsFiles(srcUi, distUi)
        }
        ok('Build complete')
      } catch {
        actionableError(
          'TypeScript compilation failed',
          'Check the errors above and fix your source files.'
        )
        process.exit(1)
      }
    }

    // Resolve the Electron BINARY. The `electron` package's main export is the
    // absolute path to the platform binary (electron.exe on Windows), so spawn
    // THAT. The previous code spawned electron/cli.js directly, which is EFTYPE
    // on Windows (a .js file is not an executable) — it crashed `amc-plugin dev`
    // on every Windows machine.
    let electronPath: string
    try {
      electronPath = require('electron') as unknown as string
    } catch {
      actionableError(
        'Electron is not installed',
        "Run 'pnpm add -D electron' in your plugin, or reinstall @agent-mc/plugin-dev-shell (which now brings Electron with it)."
      )
      process.exit(1)
    }

    // Find dev-shell entry point
    let shellEntry: string
    try {
      shellEntry = require.resolve('@agent-mc/plugin-dev-shell')
    } catch {
      actionableError(
        '@agent-mc/plugin-dev-shell not found',
        "Install it with 'pnpm add -D @agent-mc/plugin-dev-shell' or run from the SDK monorepo."
      )
      process.exit(1)
    }

    info(
      `Launching dev shell for ${filePath(manifest.plugin?.name ?? manifest.plugin?.id ?? 'plugin')}`
    )

    // Launch the Electron dev shell (spawn the binary with the shell entry).
    const child = spawn(electronPath, [shellEntry, cwd], {
      cwd,
      stdio: 'inherit',
      env: { ...process.env }
    })

    child.on('close', (code) => {
      process.exit(code ?? 0)
    })
  })

function copyNonTsFiles(src: string, dest: string): void {
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
