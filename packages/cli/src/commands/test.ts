import { Command } from 'commander'
import * as fs from 'node:fs'
import * as path from 'node:path'
import { spawnSync } from 'node:child_process'
import { info, actionableError, manifestNotFound } from '../lib/output.js'

/** Resolve the local vitest binary if the plugin has it installed. */
function findLocalVitest(cwd: string): string | null {
  const bin = process.platform === 'win32' ? 'vitest.CMD' : 'vitest'
  const candidate = path.join(cwd, 'node_modules', '.bin', bin)
  return fs.existsSync(candidate) ? candidate : null
}

export const testCommand = new Command('test')
  .description('Run the plugin test suite with vitest')
  .option('--watch', 'Run vitest in watch mode')
  .argument('[patterns...]', 'Optional test file patterns to filter')
  .action((patterns: string[], opts: { watch?: boolean }) => {
    const cwd = process.cwd()

    if (!fs.existsSync(path.join(cwd, 'manifest.json'))) {
      manifestNotFound()
    }

    const mode = opts.watch ? 'watch' : 'run'
    const forwarded = [mode, ...patterns]

    const local = findLocalVitest(cwd)
    let command: string
    let args: string[]
    if (local) {
      command = local
      args = forwarded
    } else {
      // Fall back to npx; it will fetch vitest if the project lacks it.
      command = process.platform === 'win32' ? 'npx.cmd' : 'npx'
      args = ['vitest', ...forwarded]
    }

    info(`Running tests (${mode})...`)
    const result = spawnSync(command, args, { cwd, stdio: 'inherit' })

    if (result.error) {
      actionableError(
        'Could not run vitest',
        "Add it to your plugin: 'pnpm add -D vitest', then re-run 'amc-plugin test'."
      )
      process.exit(1)
    }

    process.exit(result.status ?? 0)
  })
