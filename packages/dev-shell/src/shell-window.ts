import { app, BrowserWindow } from 'electron'
import * as path from 'node:path'
import * as fs from 'node:fs'
import { fileURLToPath } from 'node:url'
import { createMockContext } from './mock-context.js'
import { startHotReload } from './hot-reload.js'

// This package is ESM ("type": "module"), where Node does not define __dirname.
// Derive it from import.meta.url so path.join(__dirname, 'shell.html') resolves
// the bundled shell HTML at runtime (previously threw "__dirname is not defined"
// and the window never rendered — on every platform, not just Windows).
const __dirname = path.dirname(fileURLToPath(import.meta.url))

const pluginDir = process.argv[2] || process.cwd()
const manifestPath = path.join(pluginDir, 'manifest.json')

if (!fs.existsSync(manifestPath)) {
  console.error(`No manifest.json found at ${pluginDir}`)
  process.exit(1)
}

const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'))
const pluginName = manifest.plugin?.name ?? manifest.plugin?.id ?? 'Unknown Plugin'
const pluginVersion = manifest.plugin?.version ?? '0.0.0'

let mainWindow: BrowserWindow | null = null

app.whenReady().then(() => {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    title: `AMC Plugin Dev Shell - ${pluginName} v${pluginVersion}`,
    webPreferences: {
      webviewTag: true,
      contextIsolation: true,
      nodeIntegration: false,
    },
  })

  const shellHtmlPath = path.join(__dirname, 'shell.html')
  mainWindow.loadFile(shellHtmlPath, {
    query: {
      pluginDir,
      pluginName,
      pluginVersion,
      entryPoint: manifest.ui?.entryPoint ?? '',
    },
  })

  if (manifest.backend?.entryPoint) {
    const backendPath = path.join(pluginDir, manifest.backend.entryPoint)
    if (fs.existsSync(backendPath)) {
      // Dev config: `amc-dev-settings.json` next to the plugin seeds
      // ctx.settings so settings-gated logic runs; `.amc-dev/` holds the
      // persisted KV store so plugin state survives a dev-shell restart.
      const settingsFile = path.join(pluginDir, 'amc-dev-settings.json')
      let devSettings: Record<string, unknown> = {}
      if (fs.existsSync(settingsFile)) {
        try {
          devSettings = JSON.parse(fs.readFileSync(settingsFile, 'utf-8'))
          console.log(`[dev-shell] Loaded dev settings from ${settingsFile}`)
        } catch (err) {
          console.error(`[dev-shell] Failed to parse ${settingsFile}:`, err)
        }
      }

      const mockCtx = createMockContext({
        pluginId: manifest.plugin.id,
        pluginVersion,
        logToConsole: true,
        dataDir: path.join(pluginDir, '.amc-dev'),
        settings: devSettings,
      })

      try {
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        const mod = require(backendPath)
        const activateFn = mod.default || mod
        const backend = activateFn(mockCtx)
        if (backend.onEnable) backend.onEnable()
        console.log(`[dev-shell] Backend activated for ${manifest.plugin.id}`)
      } catch (err) {
        console.error('[dev-shell] Backend activation failed:', err)
      }
    }
  }

  startHotReload(pluginDir, {
    onUiChange() {
      console.log('[dev-shell] UI changed - reloading webview')
      mainWindow?.webContents.send('reload-webview')
    },
    onBackendChange() {
      console.log('[dev-shell] Backend changed - restart dev shell to apply')
    },
    onManifestChange() {
      console.log('[dev-shell] Manifest changed - re-validating')
    },
  })
})

app.on('window-all-closed', () => app.quit())
