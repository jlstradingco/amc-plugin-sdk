import * as os from 'node:os'
import * as path from 'node:path'
import * as fs from 'node:fs'

// Omniscio's Electron `app.getName()` — the folder under the OS app-data root.
const APP_NAME = 'agent-mission-control'

/** The default port Omniscio's CLI control server listens on (AMC_CLI_PORT override). */
const DEFAULT_CONTROL_PORT = 19519

export interface HostEnv {
  platform?: NodeJS.Platform
  env?: NodeJS.ProcessEnv
  homedir?: string
}

/**
 * Resolve the same directory Electron's `app.getPath('userData')` yields for
 * Omniscio, per-platform, so the CLI can install a plugin straight into the running
 * app's data dir. All inputs are injectable for testing.
 */
export function resolveAmcUserDataDir(opts: HostEnv = {}): string {
  const platform = opts.platform ?? process.platform
  const env = opts.env ?? process.env
  const home = opts.homedir ?? os.homedir()

  // Build paths with the TARGET platform's separator, not the host's, so a
  // resolved macOS/Linux path is correct even when computed on Windows.
  if (platform === 'win32') {
    const appData = env.APPDATA ?? path.win32.join(home, 'AppData', 'Roaming')
    return path.win32.join(appData, APP_NAME)
  }
  if (platform === 'darwin') {
    return path.posix.join(home, 'Library', 'Application Support', APP_NAME)
  }
  const xdg = env.XDG_CONFIG_HOME ?? path.posix.join(home, '.config')
  return path.posix.join(xdg, APP_NAME)
}

/** The `plugins/` directory Omniscio's loader scans for marketplace/local plugins. */
export function resolveAmcPluginsDir(opts: HostEnv = {}): string {
  const platform = opts.platform ?? process.platform
  const sep = platform === 'win32' ? path.win32 : path.posix
  return sep.join(resolveAmcUserDataDir(opts), 'plugins')
}

export interface TokenSource {
  env?: NodeJS.ProcessEnv
  homedir?: string
  readFile?: (p: string) => string
}

/**
 * The token file name THIS instance owns: the bare `cli-token` for the primary
 * install, `cli-token-<id>` for a deliberately isolated instance (AMC_INSTANCE_ID).
 * Mirrors `instanceTokenFileName` in the app's own token ladder.
 */
export function cliTokenFileName(env: NodeJS.ProcessEnv = process.env): string {
  const id = typeof env.AMC_INSTANCE_ID === 'string' ? env.AMC_INSTANCE_ID.trim() : ''
  const isRealId = !!id && id !== '.' && id !== '..' && /^[A-Za-z0-9._-]+$/.test(id)
  return isRealId ? `cli-token-${id}` : 'cli-token'
}

function absoluteEnvPath(value: string | undefined): string | null {
  const trimmed = value?.trim()
  return trimmed && path.isAbsolute(trimmed) ? trimmed : null
}

/**
 * Read the CLI control-server bearer token, through the same ladder the app
 * writes it: `$AMC_CLI_TOKEN`, then `$AMC_CLI_TOKEN_FILE_OVERRIDE` /
 * `$AMC_CLI_TOKEN_FILE` (absolute paths only), then this instance's own file
 * under `~/.amc`. Returns null (never throws) when none is present.
 */
export function readCliToken(opts: TokenSource = {}): string | null {
  const env = opts.env ?? process.env
  const fromEnv = env.AMC_CLI_TOKEN?.trim()
  if (fromEnv) return fromEnv

  const home = opts.homedir ?? os.homedir()
  const readFile = opts.readFile ?? ((p: string) => fs.readFileSync(p, 'utf-8'))
  const candidates = [
    absoluteEnvPath(env.AMC_CLI_TOKEN_FILE_OVERRIDE),
    absoluteEnvPath(env.AMC_CLI_TOKEN_FILE),
    path.join(home, '.amc', cliTokenFileName(env)),
  ].filter((candidate): candidate is string => candidate !== null)

  for (const candidate of candidates) {
    try {
      const token = readFile(candidate).trim()
      if (token) return token
    } catch {
      continue
    }
  }
  return null
}

/** The control-server port, honoring an integer AMC_CLI_PORT override. */
export function amcControlPort(env: NodeJS.ProcessEnv = process.env): number {
  const raw = env.AMC_CLI_PORT
  const n = raw ? Number(raw) : NaN
  return Number.isInteger(n) && n > 0 ? n : DEFAULT_CONTROL_PORT
}

export interface PluginsDirLookup {
  dir: string
  source: 'app' | 'fallback'
  reason?: string
}

export interface PluginsDirLookupOptions {
  token?: string | null
  port?: number
  fetchImpl?: typeof fetch
  fallbackDir?: string
}

const APP_DATA_LOOKUP_TIMEOUT_MS = 2000

function lookupFailureReason(err: unknown): string {
  if (err instanceof Error && err.name === 'TimeoutError') return 'Omniscio did not answer in time'
  const code = (err as { cause?: { code?: string } } | null)?.cause?.code
  if (code === 'ECONNREFUSED') return 'Omniscio is not running'
  return err instanceof Error ? err.message : String(err)
}

/**
 * Where to copy a plugin, asked of the RUNNING Omniscio over the CLI control
 * server's `/app/user-data-path` route — the same `getUserDataDir()` its loader
 * reads, so per-account profiles resolve to the bound profile folder. Falls back
 * to `resolveAmcPluginsDir()` (or `fallbackDir`, for tests) with a reason when no
 * app answers.
 */
export async function resolvePluginsDirForInstall(
  opts: PluginsDirLookupOptions = {},
): Promise<PluginsDirLookup> {
  const fallback = (reason: string): PluginsDirLookup => ({
    dir: opts.fallbackDir ?? resolveAmcPluginsDir(),
    source: 'fallback',
    reason,
  })

  const token = opts.token !== undefined ? opts.token : readCliToken()
  if (!token) return fallback('no control token (~/.amc/cli-token or $AMC_CLI_TOKEN)')

  const port = opts.port ?? amcControlPort()
  const doFetch = opts.fetchImpl ?? fetch

  try {
    const res = await doFetch(`http://127.0.0.1:${port}/app/user-data-path`, {
      headers: { Authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(APP_DATA_LOOKUP_TIMEOUT_MS),
    })
    if (!res.ok) return fallback(`Omniscio answered HTTP ${res.status}`)
    const body = (await res.json().catch(() => null)) as { data?: { path?: unknown } } | null
    const userDataDir = body?.data?.path
    if (typeof userDataDir !== 'string' || userDataDir.trim() === '' || !path.isAbsolute(userDataDir)) {
      return fallback('Omniscio did not return a usable data folder')
    }
    return { dir: path.join(userDataDir, 'plugins'), source: 'app' }
  } catch (err) {
    return fallback(lookupFailureReason(err))
  }
}

export interface ReloadResult {
  ok: boolean
  status?: number
  error?: string
}

/**
 * Hot-reload a just-installed plugin in the running Omniscio via the CLI control
 * server (`POST /plugins/:id/reload`). Bearer-authed; sends the caller's
 * session id for provenance when present.
 */
export async function reloadPluginInAmc(
  pluginId: string,
  opts: { token: string; port?: number; sourceSessionId?: string } = { token: '' },
): Promise<ReloadResult> {
  const port = opts.port ?? amcControlPort()
  const headers: Record<string, string> = {
    Authorization: `Bearer ${opts.token}`,
    'Content-Type': 'application/json',
  }
  if (opts.sourceSessionId) headers['X-AMC-Source-Session-Id'] = opts.sourceSessionId

  try {
    const res = await fetch(`http://127.0.0.1:${port}/plugins/${encodeURIComponent(pluginId)}/reload`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ pluginId }),
    })
    if (!res.ok) {
      const body = (await res.json().catch(() => null)) as { error?: string } | null
      return { ok: false, status: res.status, error: body?.error ?? `HTTP ${res.status}` }
    }
    return { ok: true, status: res.status }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) }
  }
}
