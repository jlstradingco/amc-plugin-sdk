import { Command } from 'commander'
import * as fs from 'node:fs'
import * as path from 'node:path'
import { execSync } from 'node:child_process'
import { validateManifest } from '@agent-mc/plugin-sdk'
import { ok, fail, info, warn, filePath, manifestNotFound, actionableError } from '../lib/output.js'
import { isTypeScriptProject, copyNonTsFiles } from '../lib/project.js'
import { copyPluginToDir } from '../lib/install.js'
import { resolveAmcPluginsDir, readCliToken, reloadPluginInAmc } from '../lib/amc-host.js'

interface InstallOptions {
  build: boolean
  reload: boolean
  watch?: boolean
}

/** Directory names that must never trigger a --watch re-install. */
const WATCH_IGNORE = new Set(['node_modules', '.git', 'dist', '.amcplugin'])

export const installCommand = new Command('install')
  .description('Build and install this plugin into your local AMC, then hot-reload it')
  .option('--no-build', 'Skip the TypeScript build (install files as-authored)')
  .option('--no-reload', 'Copy files only; do not hot-reload the running AMC')
  .option('-w, --watch', 'Re-install + hot-reload on every source change')
  .action(async (opts: InstallOptions) => {
    const cwd = process.cwd()
    const manifestPath = path.join(cwd, 'manifest.json')
    if (!fs.existsSync(manifestPath)) manifestNotFound()

    const runOnce = async (): Promise<boolean> => {
      const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'))
      const result = validateManifest(manifest)
      if (!result.valid) {
        fail('Manifest validation failed:')
        result.errors.forEach((e) => console.error(`  - ${e}`))
        return false
      }
      const pluginId = manifest.plugin.id as string

      // Build (TS only — flat plugins ship as-authored) unless --no-build.
      if (opts.build && isTypeScriptProject(cwd)) {
        info('Building TypeScript...')
        try {
          execSync('npx tsc', { cwd, stdio: 'inherit' })
          const srcUi = path.join(cwd, 'src', 'ui')
          const distUi = path.join(cwd, 'dist', 'ui')
          if (fs.existsSync(srcUi)) copyNonTsFiles(srcUi, distUi)
        } catch {
          actionableError('TypeScript compilation failed', 'Fix the errors above and re-run.')
          return false
        }
      }

      const destDir = path.join(resolveAmcPluginsDir(), pluginId)
      copyPluginToDir(cwd, manifest, destDir)
      ok(`Installed ${filePath(pluginId)} → ${filePath(destDir)}`)

      if (!opts.reload) return true

      const token = readCliToken()
      if (!token) {
        warn('AMC control token not found (~/.amc/cli-token or $AMC_CLI_TOKEN).')
        warn('Skipping hot-reload — restart AMC to pick up the changes.')
        return true
      }
      const reload = await reloadPluginInAmc(pluginId, {
        token,
        sourceSessionId: process.env.AMC_SESSION_ID,
      })
      if (reload.ok) {
        ok('Hot-reloaded in AMC')
      } else {
        warn(`Could not hot-reload (${reload.error}). Files are installed — restart AMC to pick them up.`)
      }
      return true
    }

    const first = await runOnce()

    if (!opts.watch) {
      if (!first) process.exit(1)
      return
    }

    // --watch: recursive fs.watch with a short debounce, ignoring build output.
    info('Watching for changes — press Ctrl+C to stop')
    let timer: NodeJS.Timeout | null = null
    let running = false
    const trigger = () => {
      if (timer) clearTimeout(timer)
      timer = setTimeout(async () => {
        if (running) return
        running = true
        try {
          info('Change detected — reinstalling...')
          await runOnce()
        } finally {
          running = false
        }
      }, 150)
    }

    fs.watch(cwd, { recursive: true }, (_event, filename) => {
      if (!filename) return
      const top = filename.split(/[/\\]/)[0]
      if (WATCH_IGNORE.has(top) || filename.endsWith('.amcplugin')) return
      trigger()
    })
  })
