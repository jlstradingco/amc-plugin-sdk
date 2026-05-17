import chokidar from 'chokidar'
import { execSync } from 'node:child_process'
import * as path from 'node:path'
import * as fs from 'node:fs'

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
        execSync('npx tsc', { cwd: pluginDir, stdio: 'pipe' })

        const srcUi = path.join(pluginDir, 'src', 'ui')
        const distUi = path.join(pluginDir, 'dist', 'ui')
        if (fs.existsSync(srcUi)) {
          if (!fs.existsSync(distUi)) fs.mkdirSync(distUi, { recursive: true })
          for (const entry of fs.readdirSync(srcUi)) {
            if (!entry.endsWith('.ts')) {
              fs.copyFileSync(path.join(srcUi, entry), path.join(distUi, entry))
            }
          }
        }

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
