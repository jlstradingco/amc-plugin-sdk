import { Command } from 'commander'
import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'
import { spawnSync } from 'node:child_process'
import { info, actionableError, manifestNotFound } from '../lib/output.js'

const PLUGIN_CONFIG_FILENAMES = [
  'vitest.config.ts',
  'vitest.config.mts',
  'vitest.config.cts',
  'vitest.config.js',
  'vitest.config.mjs',
  'vitest.config.cjs',
  'vite.config.ts',
  'vite.config.mts',
  'vite.config.cts',
  'vite.config.js',
  'vite.config.mjs',
  'vite.config.cjs',
]

export const FALLBACK_CONFIG_SOURCE = 'export default {}\n'

const FALLBACK_CONFIG_NAME = 'vitest.config.mjs'
const FALLBACK_TEMP_PREFIX = 'omniscio-plugin-test-'
const HELD_SIGNALS: NodeJS.Signals[] = ['SIGINT', 'SIGTERM']

export interface VitestInvocation {
  args: string[]
  tempDir: string | null
}

function findLocalVitest(cwd: string): string | null {
  const bin = process.platform === 'win32' ? 'vitest.CMD' : 'vitest'
  const candidate = path.join(cwd, 'node_modules', '.bin', bin)
  return fs.existsSync(candidate) ? candidate : null
}

export function findPluginConfig(pluginDir: string): string | null {
  for (const name of PLUGIN_CONFIG_FILENAMES) {
    const candidate = path.join(pluginDir, name)
    if (fs.existsSync(candidate)) return candidate
  }
  return null
}

interface ConfigSource {
  configPath: string
  tempDir: string | null
}

function createFallbackConfig(): ConfigSource {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), FALLBACK_TEMP_PREFIX))
  const configPath = path.join(tempDir, FALLBACK_CONFIG_NAME)
  try {
    fs.writeFileSync(configPath, FALLBACK_CONFIG_SOURCE)
    return { configPath, tempDir }
  } catch (error) {
    removeTempDir(tempDir)
    throw error
  }
}

export function buildVitestInvocation(
  pluginDir: string,
  mode: 'run' | 'watch',
  patterns: string[]
): VitestInvocation {
  const ownConfig = findPluginConfig(pluginDir)
  const source = ownConfig ? { configPath: ownConfig, tempDir: null } : createFallbackConfig()
  const args = [mode, '--root', pluginDir, '--config', source.configPath, ...patterns]
  return { args, tempDir: source.tempDir }
}

export function cleanupInvocation(invocation: VitestInvocation): void {
  if (invocation.tempDir) removeTempDir(invocation.tempDir)
}

function removeTempDir(tempDir: string): void {
  try {
    fs.rmSync(tempDir, { recursive: true, force: true })
  } catch {
    return
  }
}

function holdTermination(): () => void {
  const ignore = () => undefined
  for (const signal of HELD_SIGNALS) process.on(signal, ignore)
  return () => {
    for (const signal of HELD_SIGNALS) process.off(signal, ignore)
  }
}

function exitCodeFor(result: { status: number | null; signal: NodeJS.Signals | null }): number {
  if (result.status !== null) return result.status
  if (!result.signal) return 1
  return 128 + (os.constants.signals[result.signal] ?? 0)
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

    let invocation: VitestInvocation
    try {
      invocation = buildVitestInvocation(cwd, mode, patterns)
    } catch {
      actionableError(
        'Could not create a temporary vitest config',
        "Make sure your system temp folder is writable, then run 'omniscio-plugin test' again."
      )
      process.exit(1)
    }

    const local = findLocalVitest(cwd)
    const command = local ?? (process.platform === 'win32' ? 'npx.cmd' : 'npx')
    const args = local ? invocation.args : ['vitest', ...invocation.args]

    info(`Running tests (${mode})...`)
    const releaseTermination = holdTermination()
    const result = spawnSync(command, args, { cwd, stdio: 'inherit' })
    cleanupInvocation(invocation)
    releaseTermination()

    if (result.error) {
      actionableError(
        'Could not run vitest',
        "Add it to your plugin: 'pnpm add -D vitest', then re-run 'omniscio-plugin test'."
      )
      process.exit(1)
    }

    process.exit(exitCodeFor(result))
  })
