import { Command } from 'commander'
import * as fs from 'node:fs'
import * as path from 'node:path'
import { validateManifest } from '@omniscio/plugin-sdk'
import { ok, fail, info, warn, filePath, manifestNotFound, actionableError } from '../lib/output.js'
import { isTypeScriptProject } from '../lib/project.js'
import { compilePlugin } from '../lib/compile.js'
import { installPluginToApp } from '../lib/install.js'
import { readCliToken, reloadPluginInAmc } from '../lib/amc-host.js'

interface InstallOptions {
  build: boolean
  reload: boolean
  watch?: boolean
}

const WATCH_IGNORE = new Set(['node_modules', '.git', 'dist', '.amcplugin'])

export const installCommand = new Command('install')
  .description('Build and install this plugin into your local Omniscio, then hot-reload it')
  .option('--no-build', 'Skip the build (install files as-authored)')
  .option('--no-reload', 'Copy files only; do not hot-reload the running Omniscio')
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

      if (opts.build && isTypeScriptProject(cwd)) {
        info('Building plugin...')
        try {
          compilePlugin(cwd)
        } catch {
          actionableError('Build failed', 'Fix the errors above and re-run.')
          return false
        }
      }

      const token = readCliToken()
      const target = await installPluginToApp(cwd, manifest, pluginId, { token })
      ok(`Installed ${filePath(pluginId)} → ${filePath(target.destDir)}`)
      if (target.source === 'fallback') {
        warn(`Could not ask a running Omniscio for its plugins folder (${target.reason}).`)
        warn(`Copied into ${filePath(path.dirname(target.destDir))} — start Omniscio and re-run install so the plugin lands in the folder it reads.`)
      }

      if (!opts.reload) return true

      if (!token) {
        warn('Omniscio control token not found (~/.amc/cli-token or $AMC_CLI_TOKEN).')
        warn(
          target.source === 'app'
            ? 'Skipping hot-reload — restart Omniscio to pick up the changes.'
            : 'Skipping hot-reload — start Omniscio and re-run install.',
        )
        return true
      }
      const reload = await reloadPluginInAmc(pluginId, {
        token,
        sourceSessionId: process.env.AMC_SESSION_ID,
      })
      if (reload.ok) {
        if (target.source === 'app') {
          ok('Hot-reloaded in Omniscio')
        } else {
          warn('Reloaded the running Omniscio, but the files went to the fallback folder — re-run install once Omniscio answers so the plugin lands in the folder it reads.')
        }
      } else {
        warn(
          `Could not hot-reload (${reload.error}). ${target.source === 'app' ? 'Files are installed — restart Omniscio to pick them up.' : 'Start Omniscio and re-run install.'}`,
        )
      }
      return true
    }

    const first = await runOnce()

    if (!opts.watch) {
      if (!first) process.exit(1)
      return
    }

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
