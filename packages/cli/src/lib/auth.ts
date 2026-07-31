import * as fs from 'node:fs'
import * as path from 'node:path'
import * as os from 'node:os'
import { randomBytes } from 'node:crypto'
import { spawnSync } from 'node:child_process'

const TOKEN_PATH = path.join(os.homedir(), '.amc', 'marketplace-token')

// Marketplace API base URL — override with the AMC_MARKETPLACE_API_URL env var.
//
// The API moved off Firebase Cloud Functions into amc-back, where it is mounted on the shared
// `amc-backend` Cloud Run service at /marketplace. Every Cloud Function name is preserved verbatim
// as a path segment (`/marketplace/getAuthSession`), so this constant is the whole cutover and no
// call site below changed.
//
// The Cloud Functions are still deployed against the same Firestore, so an older published CLI
// pointing at the previous URL keeps working until they are switched off.
const BASE_URL = process.env.AMC_MARKETPLACE_API_URL ?? 'https://amcback.jls.dev/marketplace'
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

/** Clock-skew allowance applied by `isTokenFresh`, in seconds. */
const TOKEN_FRESHNESS_BUFFER_SECONDS = 5 * 60

/**
 * Shortest lifetime a renewed token is allowed to claim. A token that expires
 * inside the freshness buffer is born unusable, so anything shorter is treated
 * as a bad server response rather than honoured literally.
 */
const MIN_TOKEN_TTL_SECONDS = TOKEN_FRESHNESS_BUFFER_SECONDS + 60

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
    const raw = JSON.parse(fs.readFileSync(TOKEN_PATH, 'utf-8')) as Record<string, unknown>
    // Type-checked, not merely truthy. A half-written or hand-edited file could carry
    // an object or a number where a string belongs, and the cast below would let it
    // through to `Authorization: Bearer [object Object]` — a 401 whose real cause is a
    // corrupt local file, which is the least debuggable form of this failure. Treating
    // it as "no token" instead sends the user through sign-in, which repairs it.
    if (typeof raw?.token !== 'string' || raw.token.length === 0) return null
    if (typeof raw.expiresAt !== 'string' || raw.expiresAt.length === 0) return null
    return {
      token: raw.token,
      // The optional fields degrade rather than reject: an old file written before
      // refresh tokens existed is still a usable credential until it expires.
      refreshToken: typeof raw.refreshToken === 'string' ? raw.refreshToken : '',
      uid: typeof raw.uid === 'string' ? raw.uid : '',
      github: typeof raw.github === 'string' ? raw.github : 'unknown',
      expiresAt: raw.expiresAt
    }
  } catch {
    return null
  }
}

/** True when `token` is still valid, allowing a 5-minute clock-skew buffer. */
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
    // Floored at the freshness buffer: a zero/negative/absurdly-short TTL would
    // mint a token `isTokenFresh` rejects on sight, so every later command would
    // burn a refresh round trip and still consider itself signed out.
    const parsedTtl = Number.parseInt(data.expires_in ?? '3600', 10)
    const ttlSeconds = Number.isFinite(parsedTtl)
      ? Math.max(parsedTtl, MIN_TOKEN_TTL_SECONDS)
      : 3600
    const refreshed: StoredToken = {
      ...stored,
      token: data.id_token,
      // Google may rotate the refresh token — keep the new one when offered.
      refreshToken: data.refresh_token ?? stored.refreshToken,
      expiresAt: new Date(Date.now() + ttlSeconds * 1000).toISOString()
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
  // 0700/0600: the file holds a refresh token, which silent renewal turns into
  // an indefinitely reusable marketplace credential — anyone who can read it can
  // publish as you. Default modes leave it world-readable on POSIX. `mode` on
  // mkdir/writeFile only applies at CREATE time, so chmod the file as well to
  // tighten one written by an older CLI. No-op on Windows, which ignores mode.
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true, mode: 0o700 })
  fs.writeFileSync(TOKEN_PATH, JSON.stringify(token, null, 2), { encoding: 'utf-8', mode: 0o600 })
  try {
    fs.chmodSync(TOKEN_PATH, 0o600)
  } catch {
    // Filesystems without POSIX modes (Windows, some network mounts) — the
    // credential is still written, which is what the caller asked for.
  }
}

/**
 * Delete the stored credential. Returns false when a file was there and could not be
 * removed, so the caller can say so rather than claiming a sign-out that did not happen.
 *
 * The unlink is guarded because it genuinely fails: on Windows a file held open by
 * another AMC process raises EBUSY, and a read-only home raises EPERM. Unguarded, that
 * turned `logout` — the command a user reaches for when they are worried about a
 * credential — into an unhandled exception and a stack trace, with the token still on
 * disk and no clear statement that it still was.
 */
export function clearToken(): boolean {
  if (!fs.existsSync(TOKEN_PATH)) return true
  try {
    fs.unlinkSync(TOKEN_PATH)
    return true
  } catch {
    return false
  }
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
  const authUrl = buildAuthUrl(sessionId)

  console.log('\nOpening browser for GitHub sign-in...')
  console.log(`If the browser doesn't open, visit: ${authUrl}\n`)

  openInBrowser(authUrl)

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

/**
 * Build the sign-in URL, normalized so it is safe to hand to a command line.
 *
 * `AUTH_PAGE_URL` comes from `AMC_MARKETPLACE_AUTH_URL`, and the value used to be
 * interpolated straight into a shell string (`start "" "<url>"`). A value containing a
 * quote would close that quote and run whatever followed. Setting the variable already
 * implies a good deal of access, so this was never the weakest link — but "the attacker
 * needed some access already" is not a reason to leave a shell injection in the one
 * command that opens a browser and mints a credential.
 *
 * Parsing through `URL` fixes it at the source: the constructor rejects a value that is
 * not a URL at all, and `toString()` percent-encodes quotes, spaces and newlines, so
 * nothing that survives can terminate an argument.
 *
 * @throws if the configured auth URL is not a valid http(s) URL.
 */
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

/**
 * Hand a URL to the platform's browser opener. Never throws: a machine with no
 * graphical browser is an ordinary case, and the URL was printed above for the user to
 * open by hand.
 *
 * Arguments are passed as an ARGV array rather than a shell string wherever the
 * platform allows it, so the URL is never re-parsed by a shell. `start` is a `cmd`
 * builtin and cannot be spawned directly, so Windows still goes through `cmd /c` — with
 * a URL that `buildAuthUrl` has already normalized past the characters that would
 * matter there.
 */
function openInBrowser(url: string): void {
  try {
    const platform = os.platform()
    if (platform === 'win32') {
      // The empty string is `start`'s title argument; without it a quoted URL is
      // treated as the window title and no browser opens.
      spawnSync('cmd', ['/c', 'start', '', url], { stdio: 'ignore' })
    } else if (platform === 'darwin') {
      spawnSync('open', [url], { stdio: 'ignore' })
    } else {
      spawnSync('xdg-open', [url], { stdio: 'ignore' })
    }
  } catch {
    // No browser, no display, or the opener is missing — the URL is on screen.
  }
}

/** Where the credential lives, for messages that ask the user to act on the file. */
export function getTokenPath(): string {
  return TOKEN_PATH
}

export function getBaseUrl(): string {
  return BASE_URL
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}
