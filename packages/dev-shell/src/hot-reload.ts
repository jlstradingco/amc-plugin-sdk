import chokidar from 'chokidar'
import { execFileSync, execSync } from 'node:child_process'
import * as fs from 'node:fs'
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

export type ChangeKind = 'ui' | 'backend' | 'manifest'

const IGNORED_SEGMENTS = ['node_modules', 'dist']
const REBUILD_DEBOUNCE_MS = 300
const MANIFEST_FILE = 'manifest.json'

interface UiManifest {
  ui?: { entryPoint?: unknown; widget?: { entryPoint?: unknown } }
}

function segmentsOf(relativePath: string): string[] {
  return relativePath.split(/[\\/]+/).filter((segment) => segment.length > 0)
}

export function isIgnoredPath(relativePath: string): boolean {
  return segmentsOf(relativePath).some((segment) => IGNORED_SEGMENTS.includes(segment))
}

function hasSegmentPair(segments: string[], first: string, second: string): boolean {
  return segments.some((segment, i) => segment === first && segments[i + 1] === second)
}

function isInside(relativePath: string, uiPath: string): boolean {
  const target = segmentsOf(relativePath).join('/')
  return target === uiPath || target.startsWith(`${uiPath}/`)
}

export function classifyChange(
  relativePath: string,
  uiPaths: readonly string[] = [],
): ChangeKind | null {
  if (isIgnoredPath(relativePath)) return null
  const segments = segmentsOf(relativePath)
  if (segments.join('/') === MANIFEST_FILE) return 'manifest'
  if (uiPaths.some((uiPath) => isInside(relativePath, uiPath))) return 'ui'
  if (hasSegmentPair(segments, 'src', 'backend')) return 'backend'
  return 'ui'
}

function uiWatchPath(entry: unknown): string | null {
  if (typeof entry !== 'string' || entry.length === 0) return null
  const normalised = path.posix.normalize(entry.replace(/\\/g, '/'))
  if (normalised.startsWith('..') || path.posix.isAbsolute(normalised)) return null
  const dir = path.posix.dirname(normalised)
  const target = dir === '.' ? normalised : dir
  const first = segmentsOf(target)[0]
  return first === 'src' || isIgnoredPath(target) ? null : target
}

export function uiWatchPaths(manifest: UiManifest): string[] {
  const entries = [manifest.ui?.entryPoint, manifest.ui?.widget?.entryPoint]
  const paths = entries.map(uiWatchPath).filter((p): p is string => p !== null)
  return [...new Set(paths)]
}

function readUiManifest(manifestPath: string): UiManifest {
  try {
    return JSON.parse(fs.readFileSync(manifestPath, 'utf-8')) as UiManifest
  } catch {
    return {}
  }
}

function createRebuilder(pluginDir: string, callbacks: HotReloadCallbacks): (type: ChangeKind) => void {
  let rebuildTimeout: ReturnType<typeof setTimeout> | null = null
  return (type) => {
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
    }, REBUILD_DEBOUNCE_MS)
  }
}

export function startHotReload(pluginDir: string, callbacks: HotReloadCallbacks) {
  const manifestPath = path.join(pluginDir, MANIFEST_FILE)
  const uiPaths = uiWatchPaths(readUiManifest(manifestPath))
  const rebuild = createRebuilder(pluginDir, callbacks)
  const watched = [
    path.join(pluginDir, 'src'),
    manifestPath,
    ...uiPaths.map((uiPath) => path.join(pluginDir, uiPath)),
  ]

  const watcher = chokidar.watch(watched, {
    ignoreInitial: true,
    ignored: (candidate: string) => isIgnoredPath(path.relative(pluginDir, candidate)),
  })

  watcher.on('change', (filePath) => {
    const kind = classifyChange(path.relative(pluginDir, filePath), uiPaths)
    if (kind) rebuild(kind)
  })

  return () => watcher.close()
}
