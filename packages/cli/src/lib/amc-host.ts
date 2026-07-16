import * as os from 'node:os'
import * as path from 'node:path'
import * as fs from 'node:fs'

// AMC's Electron `app.getName()` — the folder under the OS app-data root.
const APP_NAME = 'agent-mission-control'

/** The default port AMC's CLI control server listens on (AMC_CLI_PORT override). */
const DEFAULT_CONTROL_PORT = 19519

export interface HostEnv {
  platform?: NodeJS.Platform
  env?: NodeJS.ProcessEnv
  homedir?: string
}

/**
 * Resolve the same directory Electron's `app.getPath('userData')` yields for
 * AMC, per-platform, so the CLI can install a plugin straight into the running
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

/** The `plugins/` directory AMC's loader scans for marketplace/local plugins. */
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
 * Read the CLI control-server bearer token — `$AMC_CLI_TOKEN` wins, else the
 * `~/.amc/cli-token` file AMC writes. Returns null (never throws) when absent.
 */
export function readCliToken(opts: TokenSource = {}): string | null {
  const env = opts.env ?? process.env
  const fromEnv = env.AMC_CLI_TOKEN?.trim()
  if (fromEnv) return fromEnv

  const home = opts.homedir ?? os.homedir()
  const readFile = opts.readFile ?? ((p: string) => fs.readFileSync(p, 'utf-8'))
  try {
    return readFile(path.join(home, '.amc', 'cli-token')).trim() || null
  } catch {
    return null
  }
}

/** The control-server port, honoring an integer AMC_CLI_PORT override. */
export function amcControlPort(env: NodeJS.ProcessEnv = process.env): number {
  const raw = env.AMC_CLI_PORT
  const n = raw ? Number(raw) : NaN
  return Number.isInteger(n) && n > 0 ? n : DEFAULT_CONTROL_PORT
}

export interface ReloadResult {
  ok: boolean
  status?: number
  error?: string
}

/**
 * Hot-reload a just-installed plugin in the running AMC via the CLI control
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
