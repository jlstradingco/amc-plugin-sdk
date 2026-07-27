import * as fs from 'node:fs'
import * as path from 'node:path'
import * as os from 'node:os'
import { randomBytes } from 'node:crypto'
import { execSync } from 'node:child_process'

const TOKEN_PATH = path.join(os.homedir(), '.amc', 'marketplace-token')

// Cloud Function base URL — override with AMC_MARKETPLACE_API_URL env var
const BASE_URL = process.env.AMC_MARKETPLACE_API_URL ?? 'https://us-central1-amc-marketplace-jls.cloudfunctions.net'
const AUTH_PAGE_URL = process.env.AMC_MARKETPLACE_AUTH_URL ?? 'https://amc-marketplace-jls.web.app'

export interface StoredToken {
  token: string
  refreshToken: string
  uid: string
  github: string
  expiresAt: string
}

// The marketplace project's Firebase Web API key. NOT a secret: Firebase web API
// keys are public project identifiers (this exact value is served to every
// visitor of the sign-in page in public/assets/auth.js). Access control is
// enforced by Firebase Auth + the functions' own `authenticate` middleware, not
// by keeping this string private.
const FIREBASE_WEB_API_KEY =
  process.env.AMC_MARKETPLACE_WEB_API_KEY ?? 'AIzaSyByrpH7y4nm0ZxLKNkZZD9gIMO19rJ_220'

const SECURE_TOKEN_URL = 'https://securetoken.googleapis.com/v1/token'

/**
 * Read the token file as-is, ignoring expiry. Returns null when absent/corrupt.
 *
 * For callers that need the stored IDENTITY rather than a usable credential:
 * `whoami` reports who you are (a local fact, no network), and `logout` must be
 * able to delete a credential precisely when it has gone stale. Anything that
 * calls the marketplace API wants `getStoredTokenOrRefresh()` instead.
 */
export function getStoredTokenIgnoringExpiry(): StoredToken | null {
  return readStoredTokenRaw()
}

/** Read the token file as-is, ignoring expiry. Returns null when absent/corrupt. */
function readStoredTokenRaw(): StoredToken | null {
  if (!fs.existsSync(TOKEN_PATH)) return null
  try {
    const raw = JSON.parse(fs.readFileSync(TOKEN_PATH, 'utf-8'))
    if (!raw.token || !raw.expiresAt) return null
    return raw as StoredToken
  } catch {
    return null
  }
}

/** True when `token` is still valid, allowing a 5-minute clock-skew buffer. */
export function isTokenFresh(token: StoredToken, now: number = Date.now()): boolean {
  const expiresAt = new Date(token.expiresAt).getTime()
  if (Number.isNaN(expiresAt)) return false
  return now <= expiresAt - 5 * 60 * 1000
}

export function getStoredToken(): StoredToken | null {
  const raw = readStoredTokenRaw()
  if (!raw) return null
  return isTokenFresh(raw) ? raw : null
}

/**
 * Exchange the stored refresh token for a fresh ID token.
 *
 * Without this the CLI made you re-authenticate through the browser roughly
 * every hour, even though the refresh token needed to avoid that has been
 * saved since the first sign-in and simply went unused. Publishing a few
 * versions over an afternoon meant several trips through GitHub OAuth.
 *
 * Returns null (never throws) when there is nothing to refresh, the network is
 * down, or the refresh token has been revoked — every caller then falls back to
 * the interactive browser flow, which is the correct recovery for all three.
 */
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

    // expires_in is seconds-as-string; default to Firebase's standard hour.
    const ttlSeconds = Number.parseInt(data.expires_in ?? '3600', 10)
    const refreshed: StoredToken = {
      ...stored,
      token: data.id_token,
      // Google may rotate the refresh token — keep the new one when offered.
      refreshToken: data.refresh_token ?? stored.refreshToken,
      expiresAt: new Date(
        Date.now() + (Number.isFinite(ttlSeconds) ? ttlSeconds : 3600) * 1000
      ).toISOString()
    }
    saveToken(refreshed)
    return refreshed
  } catch {
    return null
  }
}

/**
 * The stored token, silently renewed if it has expired. Never opens a browser.
 *
 * The read-only commands cannot call `authenticate()` — that would hijack, say,
 * `amc-plugin info` into an interactive sign-in — but reading the file directly
 * meant they reported "Not signed in" the moment the hour-long ID token lapsed,
 * even though the refresh token beside it was still good. Returns null only when
 * there is genuinely nothing usable, which is the honest "signed out" answer.
 */
export async function getStoredTokenOrRefresh(): Promise<StoredToken | null> {
  const existing = getStoredToken()
  if (existing) return existing
  return tryRefreshStoredToken()
}

export function saveToken(token: StoredToken): void {
  const dir = path.dirname(TOKEN_PATH)
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
  fs.writeFileSync(TOKEN_PATH, JSON.stringify(token, null, 2), 'utf-8')
}

export function clearToken(): void {
  if (fs.existsSync(TOKEN_PATH)) fs.unlinkSync(TOKEN_PATH)
}

/**
 * Authenticate via GitHub OAuth. Opens browser, polls for token.
 */
export async function authenticate(): Promise<StoredToken> {
  // Check for existing valid token
  const existing = getStoredToken()
  if (existing) return existing

  // Expired, but a refresh token may still be good — try that before sending the
  // user through the browser again. Silent on failure: falling through to the
  // interactive flow is the right recovery for an expired, revoked, or
  // unreachable refresh token alike.
  const refreshed = await tryRefreshStoredToken()
  if (refreshed) return refreshed

  // Generate session ID for polling. The server's getAuthSession endpoint
  // (RT-F008 hardening) rejects any id that doesn't match /^[A-Za-z0-9_-]{20,200}$/,
  // so mint 24 hex chars — matching the length the endpoint documents as expected.
  const sessionId = randomBytes(12).toString('hex')
  const authUrl = `${AUTH_PAGE_URL}?session=${sessionId}`

  console.log('\nOpening browser for GitHub sign-in...')
  console.log(`If the browser doesn't open, visit: ${authUrl}\n`)

  // Open browser (cross-platform)
  try {
    const platform = os.platform()
    if (platform === 'win32') execSync(`start "" "${authUrl}"`, { stdio: 'ignore' })
    else if (platform === 'darwin') execSync(`open "${authUrl}"`, { stdio: 'ignore' })
    else execSync(`xdg-open "${authUrl}"`, { stdio: 'ignore' })
  } catch {
    // Browser open failed — user can visit URL manually
  }

  // Poll Firestore for token via a lightweight HTTP endpoint
  console.log('Waiting for sign-in...')
  const pollUrl = `${BASE_URL}/getAuthSession?session=${sessionId}`

  for (let i = 0; i < 120; i++) { // 2 minutes max
    await sleep(1000)

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
          saveToken(storedToken)
          console.log(`\nSigned in as ${storedToken.github}`)
          return storedToken
        }
      }
    } catch {
      // Network error — keep polling
    }

    // Print a dot every 5 seconds
    if (i % 5 === 0 && i > 0) process.stdout.write('.')
  }

  throw new Error('Authentication timed out. Please try again.')
}

export function getBaseUrl(): string {
  return BASE_URL
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}
