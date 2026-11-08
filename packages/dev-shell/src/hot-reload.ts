import chokidar from 'chokidar'
import { execFileSync, execSync } from 'node:child_process'
import * as path from 'node:path'

const PLUGIN_CLI_ENTRY_ENV = 'AMC_PLUGIN_CLI_ENTRY'
const FALLBACK_BUILD_COMMAND = 'npx --no-install amc-plugin build'

export function runPluginBuild(pluginDir: string, env: NodeJS.ProcessEnv = process.env): void {
  const cliEntry = env[PLUGIN_CLI_ENTRY_ENV]
  if (!cliEntry) {
    execSync(FALLBACK_BUILD_COMMAND, { cwd: pluginDir, stdio: 'pipe' })
    return
  }
  execFileSync(process.execPath, [cliEntry, 'build'], {
    cwd: pluginDir,
    stdio: 'pipe',
    env: { ...env, ELECTRON_RUN_AS_NODE: '1' }
  })
}

export interface HotReloadCallbacks {
  onUiChange(): void
  onBackendChange(): void
  onManifestChange(): void
}

export function startHotReload(pluginDir: string, callbacks: HotReloadCallbacks) {
  const srcDir = path.join(pluginDir, 'src')
  const manifestPath = path.join(pluginDir, 'manifest.json')

  let rebuildTimeout: ReturnType<typeof setTimeout> | null = null

  const rebuild = (type: 'ui' | 'backend' | 'manifest') => {
    if (rebuildTimeout) clearTimeout(rebuildTimeout)
    rebuildTimeout = setTimeout(() => {
      try {
        console.log(`[hot-reload] Recompiling (${type} change)...`)
        runPluginBuild(pluginDir)

        if (type === 'manifest') callbacks.onManifestChange()
        else if (type === 'ui') callbacks.onUiChange()
        else callbacks.onBackendChange()
      } catch (err) {
        console.error('[hot-reload] Build failed:', err)
      }
    }, 300)
  }

  const watcher = chokidar.watch([srcDir, manifestPath], {
    ignoreInitial: true,
    ignored: /node_modules|dist/,
  })

  watcher.on('change', (filePath) => {
    if (filePath === manifestPath || filePath.endsWith('manifest.json')) {
      rebuild('manifest')
    } else if (filePath.includes(path.join('src', 'ui'))) {
      rebuild('ui')
    } else if (filePath.includes(path.join('src', 'backend'))) {
      rebuild('backend')
    } else {
      rebuild('ui')
    }
  })

  return () => watcher.close()
}
