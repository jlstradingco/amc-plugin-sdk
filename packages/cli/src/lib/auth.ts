import * as fs from 'node:fs'
import * as path from 'node:path'
import * as os from 'node:os'
import { randomBytes } from 'node:crypto'
import { spawnSync } from 'node:child_process'

const TOKEN_PATH = path.join(os.homedir(), '.amc', 'marketplace-token')

const DEFAULT_BASE_URL = 'https://amcback.jls.dev/marketplace'

export function resolveBaseUrl(raw: string | undefined = process.env.AMC_MARKETPLACE_API_URL): string {
  if (raw === undefined || raw.trim() === '') return DEFAULT_BASE_URL

  const value = raw.trim()
  let url: URL
  try {
    url = new URL(value)
  } catch {
    throw new Error(
      `AMC_MARKETPLACE_API_URL is not a valid URL: ${value}. Unset it to use the default.`
    )
  }

  const isLoopback =
    url.hostname === 'localhost' ||
    url.hostname === '127.0.0.1' ||
    url.hostname === '[::1]' ||
    url.hostname === '::1'

  const secure = url.protocol === 'https:' || (url.protocol === 'http:' && isLoopback)
  if (!secure) {
    throw new Error(
      `AMC_MARKETPLACE_API_URL must be https:// (got "${url.protocol}//${url.hostname}"). ` +
        'The CLI refuses to send your marketplace token over cleartext http. ' +
        'Use https, or plain http only to localhost for local development.'
    )
  }

  return value.replace(/\/+$/, '')
}

const BASE_URL = resolveBaseUrl()
const AUTH_PAGE_URL = process.env.AMC_MARKETPLACE_AUTH_URL ?? 'https://amc-marketplace-jls.web.app'

export interface StoredToken {
  token: string
  refreshToken: string
  uid: string
  github: string
  expiresAt: string
}

const FIREBASE_WEB_API_KEY =
  process.env.AMC_MARKETPLACE_WEB_API_KEY ?? 'AIzaSyByrpH7y4nm0ZxLKNkZZD9gIMO19rJ_220'

const SECURE_TOKEN_URL = 'https://securetoken.googleapis.com/v1/token'

const TOKEN_FRESHNESS_BUFFER_SECONDS = 5 * 60

const MIN_TOKEN_TTL_SECONDS = TOKEN_FRESHNESS_BUFFER_SECONDS + 60

export function getStoredTokenIgnoringExpiry(): StoredToken | null {
  return readStoredTokenRaw()
}

function readStoredTokenRaw(): StoredToken | null {
  if (!fs.existsSync(TOKEN_PATH)) return null
  try {
    const raw = JSON.parse(fs.readFileSync(TOKEN_PATH, 'utf-8')) as Record<string, unknown>
    if (typeof raw?.token !== 'string' || raw.token.length === 0) return null
    if (typeof raw.expiresAt !== 'string' || raw.expiresAt.length === 0) return null
    return {
      token: raw.token,
      refreshToken: typeof raw.refreshToken === 'string' ? raw.refreshToken : '',
      uid: typeof raw.uid === 'string' ? raw.uid : '',
      github: typeof raw.github === 'string' ? raw.github : 'unknown',
      expiresAt: raw.expiresAt
    }
  } catch {
    return null
  }
}

export function isTokenFresh(token: StoredToken, now: number = Date.now()): boolean {
  const expiresAt = new Date(token.expiresAt).getTime()
  if (Number.isNaN(expiresAt)) return false
  return now <= expiresAt - TOKEN_FRESHNESS_BUFFER_SECONDS * 1000
}

export function getStoredToken(): StoredToken | null {
  const raw = readStoredTokenRaw()
  if (!raw) return null
  return isTokenFresh(raw) ? raw : null
}

export async function tryRefreshStoredToken(): Promise<StoredToken | null> {
  const stored = readStoredTokenRaw()
  if (!stored?.refreshToken) return null

  try {
    const res = await globalThis.fetch(`${SECURE_TOKEN_URL}?key=${FIREBASE_WEB_API_KEY}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'refresh_token',
        refresh_token: stored.refreshToken
      }).toString()
    })
    if (!res.ok) return null

    const data = (await res.json()) as {
      id_token?: string
      refresh_token?: string
      expires_in?: string
    }
    if (!data.id_token) return null

    const parsedTtl = Number.parseInt(data.expires_in ?? '3600', 10)
    const ttlSeconds = Number.isFinite(parsedTtl)
      ? Math.max(parsedTtl, MIN_TOKEN_TTL_SECONDS)
      : 3600
    const refreshed: StoredToken = {
      ...stored,
      token: data.id_token,
      refreshToken: data.refresh_token ?? stored.refreshToken,
      expiresAt: new Date(Date.now() + ttlSeconds * 1000).toISOString()
    }
    saveToken(refreshed)
    return refreshed
  } catch {
    return null
  }
}

export async function getStoredTokenOrRefresh(): Promise<StoredToken | null> {
  const existing = getStoredToken()
  if (existing) return existing
  return tryRefreshStoredToken()
}

export function saveToken(token: StoredToken): void {
  const dir = path.dirname(TOKEN_PATH)
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true, mode: 0o700 })
  fs.writeFileSync(TOKEN_PATH, JSON.stringify(token, null, 2), { encoding: 'utf-8', mode: 0o600 })
  try {
    fs.chmodSync(TOKEN_PATH, 0o600)
  } catch {
    return
  }
}

export function clearToken(): boolean {
  if (!fs.existsSync(TOKEN_PATH)) return true
  try {
    fs.unlinkSync(TOKEN_PATH)
    return true
  } catch {
    return false
  }
}

export const SIGN_IN_TIMEOUT_MS = 15 * 60 * 1000

export const SIGN_IN_POLL_INTERVAL_MS = 2 * 1000

const SIGN_IN_DOT_INTERVAL_MS = 10 * 1000
const SIGN_IN_REMINDER_INTERVAL_MS = 2 * 60 * 1000

export interface SignInTick {
  elapsedMs: number
  remainingMs: number
}

export interface SignInOptions {
  timeoutMs?: number
  intervalMs?: number
  openBrowser?: (url: string) => void
  onWait?: (tick: SignInTick) => void
}

export async function waitForSignIn(
  sessionId: string,
  options: SignInOptions = {}
): Promise<StoredToken> {
  const timeoutMs = options.timeoutMs ?? SIGN_IN_TIMEOUT_MS
  const intervalMs = options.intervalMs ?? SIGN_IN_POLL_INTERVAL_MS
  const onWait = options.onWait ?? signInProgress()
  const pollUrl = `${BASE_URL}/getAuthSession?session=${sessionId}`
  const startedAt = Date.now()
  const deadline = startedAt + timeoutMs
  let saveError: Error | null = null

  while (Date.now() < deadline) {
    await sleep(Math.max(0, Math.min(intervalMs, deadline - Date.now())))

    try {
      const res = await globalThis.fetch(pollUrl)
      if (res.ok) {
        const data = await res.json() as { token?: string; refreshToken?: string; uid?: string; github?: string; expiresAt?: string }
        if (data.token) {
          const storedToken: StoredToken = {
            token: data.token,
            refreshToken: data.refreshToken ?? '',
            uid: data.uid ?? '',
            github: data.github ?? 'unknown',
            expiresAt: data.expiresAt ?? new Date(Date.now() + 3600 * 1000).toISOString()
          }
          try {
            saveToken(storedToken)
            return storedToken
          } catch (err) {
            saveError = err instanceof Error ? err : new Error(String(err))
          }
        }
      }
    } catch {
    }

    onWait({ elapsedMs: Date.now() - startedAt, remainingMs: Math.max(0, deadline - Date.now()) })
  }

  if (saveError) {
    throw new Error(`Signed in, but the credential could not be saved to ${TOKEN_PATH}: ${saveError.message}`)
  }

  throw new Error(
    `Sign-in was not completed within ${formatWait(timeoutMs)}. ` +
      'Run the command again for a fresh link, and open it on any device that has a browser.'
  )
}

export async function authenticate(options: SignInOptions = {}): Promise<StoredToken> {
  const existing = getStoredToken()
  if (existing) return existing

  const refreshed = await tryRefreshStoredToken()
  if (refreshed) return refreshed

  const sessionId = randomBytes(12).toString('hex')
  const authUrl = buildAuthUrl(sessionId)
  const timeoutMs = options.timeoutMs ?? SIGN_IN_TIMEOUT_MS

  console.log('\nOpening browser for GitHub sign-in...')
  console.log(`If the browser doesn't open, visit: ${authUrl}`)
  console.log(
    `On a machine without a browser, open that link on any device — the CLI waits up to ${formatWait(timeoutMs)}.\n`
  )

  const openBrowser = options.openBrowser ?? openInBrowser
  openBrowser(authUrl)

  console.log('Waiting for sign-in... (press Ctrl+C to cancel)')
  const storedToken = await waitForSignIn(sessionId, options)
  console.log(`\nSigned in as ${storedToken.github}`)
  return storedToken
}

function signInProgress(): (tick: SignInTick) => void {
  let dotsAt = 0
  let reminderAt = 0

  return ({ elapsedMs, remainingMs }) => {
    if (elapsedMs - reminderAt >= SIGN_IN_REMINDER_INTERVAL_MS) {
      reminderAt = elapsedMs
      dotsAt = elapsedMs
      process.stdout.write(`\nStill waiting for sign-in — ${formatWait(remainingMs)} left.\n`)
      return
    }
    if (elapsedMs - dotsAt >= SIGN_IN_DOT_INTERVAL_MS) {
      dotsAt = elapsedMs
      process.stdout.write('.')
    }
  }
}

function formatWait(ms: number): string {
  const totalSeconds = Math.max(0, Math.round(ms / 1000))
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = totalSeconds % 60
  return minutes === 0 ? `${seconds}s` : `${minutes}m ${String(seconds).padStart(2, '0')}s`
}

export function buildAuthUrl(sessionId: string, base: string = AUTH_PAGE_URL): string {
  let url: URL
  try {
    url = new URL(base)
  } catch {
    throw new Error(
      `AMC_MARKETPLACE_AUTH_URL is not a valid URL: ${base}. Unset it to use the default.`
    )
  }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') {
    throw new Error(
      `AMC_MARKETPLACE_AUTH_URL must be an http(s) URL, got "${url.protocol}". Unset it to use the default.`
    )
  }
  url.searchParams.set('session', sessionId)
  return url.toString()
}

function openInBrowser(url: string): void {
  try {
    const platform = os.platform()
    if (platform === 'win32') {
      spawnSync('cmd', ['/c', 'start', '', url], { stdio: 'ignore' })
    } else if (platform === 'darwin') {
      spawnSync('open', [url], { stdio: 'ignore' })
    } else {
      spawnSync('xdg-open', [url], { stdio: 'ignore' })
    }
  } catch {
    return
  }
}

export function getTokenPath(): string {
  return TOKEN_PATH
}

export function getBaseUrl(): string {
  return BASE_URL
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}
