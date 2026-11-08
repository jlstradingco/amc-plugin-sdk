import { Command } from 'commander'
import * as path from 'node:path'
import * as fs from 'node:fs'
import { spawn } from 'node:child_process'
import { createRequire } from 'node:module'
import { validateManifest } from '@agent-mc/plugin-sdk'
import { ok, fail, info, filePath, manifestNotFound, actionableError } from '../lib/output.js'
import { isTypeScriptProject } from '../lib/project.js'
import { compilePlugin } from '../lib/compile.js'

const PLUGIN_CLI_ENTRY_ENV = 'AMC_PLUGIN_CLI_ENTRY'

const require = createRequire(import.meta.url)

export const devCommand = new Command('dev')
  .description('Launch the dev shell with hot-reload for local plugin development')
  .option('--no-build', 'Skip the initial build')
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

    if (opts.build && isTypeScriptProject(cwd) && !fs.existsSync(path.join(cwd, 'dist'))) {
      info('Building plugin...')
      try {
        compilePlugin(cwd)
        ok('Build complete')
      } catch {
        actionableError('Build failed', 'Check the errors above and fix your source files.')
        process.exit(1)
      }
    }

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

    const child = spawn(electronPath, [shellEntry, cwd], {
      cwd,
      stdio: 'inherit',
      env: { ...process.env, [PLUGIN_CLI_ENTRY_ENV]: process.argv[1] }
    })

    child.on('close', (code) => {
      process.exit(code ?? 0)
    })
  })

