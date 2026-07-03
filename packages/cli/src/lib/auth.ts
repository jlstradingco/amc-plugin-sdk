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

export function getStoredToken(): StoredToken | null {
  if (!fs.existsSync(TOKEN_PATH)) return null
  try {
    const raw = JSON.parse(fs.readFileSync(TOKEN_PATH, 'utf-8'))
    if (!raw.token || !raw.expiresAt) return null

    // Check expiry (with 5-minute buffer)
    const expiresAt = new Date(raw.expiresAt).getTime()
    if (Date.now() > expiresAt - 5 * 60 * 1000) {
      return null // Expired
    }

    return raw as StoredToken
  } catch {
    return null
  }
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
