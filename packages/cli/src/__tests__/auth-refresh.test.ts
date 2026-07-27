import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'

// The CLI stored a refresh token from the very first sign-in and never used it,
// so publishing a few versions in an afternoon meant several trips through
// GitHub OAuth. These cover the exchange and — more importantly — that every
// failure mode stays silent and falls back to the interactive flow rather than
// crashing a publish.

const TOKEN_DIR = path.join(os.homedir(), '.amc')
const TOKEN_PATH = path.join(TOKEN_DIR, 'marketplace-token')

let backup: string | null = null

function writeToken(token: Record<string, unknown>): void {
  fs.mkdirSync(TOKEN_DIR, { recursive: true })
  fs.writeFileSync(TOKEN_PATH, JSON.stringify(token), 'utf-8')
}

function expiredToken(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    token: 'stale-id-token',
    refreshToken: 'stored-refresh-token',
    uid: 'uid-1',
    github: 'octocat',
    expiresAt: new Date(Date.now() - 60_000).toISOString(),
    ...overrides
  }
}

describe('CLI marketplace token refresh', () => {
  beforeEach(() => {
    backup = fs.existsSync(TOKEN_PATH) ? fs.readFileSync(TOKEN_PATH, 'utf-8') : null
  })

  afterEach(() => {
    vi.restoreAllMocks()
    if (backup !== null) writeToken(JSON.parse(backup))
    else if (fs.existsSync(TOKEN_PATH)) fs.unlinkSync(TOKEN_PATH)
    backup = null
  })

  describe('isTokenFresh', () => {
    it('accepts a token well inside its lifetime', async () => {
      const { isTokenFresh } = await import('../lib/auth.js')
      const token = { expiresAt: new Date(Date.now() + 3600_000).toISOString() }
      expect(isTokenFresh(token as never)).toBe(true)
    })

    it('rejects a token inside the 5-minute skew buffer', async () => {
      const { isTokenFresh } = await import('../lib/auth.js')
      const token = { expiresAt: new Date(Date.now() + 60_000).toISOString() }
      expect(isTokenFresh(token as never)).toBe(false)
    })

    it('rejects an unparseable expiry rather than treating it as valid', async () => {
      const { isTokenFresh } = await import('../lib/auth.js')
      expect(isTokenFresh({ expiresAt: 'not-a-date' } as never)).toBe(false)
    })
  })

  describe('tryRefreshStoredToken', () => {
    it('exchanges the refresh token and persists the new id token', async () => {
      writeToken(expiredToken())
      vi.stubGlobal(
        'fetch',
        vi.fn().mockResolvedValue({
          ok: true,
          json: async () => ({
            id_token: 'fresh-id-token',
            refresh_token: 'rotated-refresh-token',
            expires_in: '3600'
          })
        })
      )

      const { tryRefreshStoredToken } = await import('../lib/auth.js')
      const result = await tryRefreshStoredToken()

      expect(result?.token).toBe('fresh-id-token')
      // Identity fields carry over — a refresh is not a re-identification.
      expect(result?.github).toBe('octocat')
      expect(result?.uid).toBe('uid-1')
      // Google may rotate the refresh token; the new one must be kept.
      expect(result?.refreshToken).toBe('rotated-refresh-token')
      expect(new Date(result!.expiresAt).getTime()).toBeGreaterThan(Date.now())

      const persisted = JSON.parse(fs.readFileSync(TOKEN_PATH, 'utf-8'))
      expect(persisted.token).toBe('fresh-id-token')
    })

    it('keeps the existing refresh token when the response omits a new one', async () => {
      writeToken(expiredToken())
      vi.stubGlobal(
        'fetch',
        vi.fn().mockResolvedValue({
          ok: true,
          json: async () => ({ id_token: 'fresh-id-token', expires_in: '3600' })
        })
      )

      const { tryRefreshStoredToken } = await import('../lib/auth.js')
      const result = await tryRefreshStoredToken()
      expect(result?.refreshToken).toBe('stored-refresh-token')
    })

    it('defaults to a one-hour lifetime when expires_in is missing or junk', async () => {
      writeToken(expiredToken())
      vi.stubGlobal(
        'fetch',
        vi.fn().mockResolvedValue({
          ok: true,
          json: async () => ({ id_token: 'fresh-id-token', expires_in: 'abc' })
        })
      )

      const { tryRefreshStoredToken } = await import('../lib/auth.js')
      const result = await tryRefreshStoredToken()
      const ttlMs = new Date(result!.expiresAt).getTime() - Date.now()
      expect(ttlMs).toBeGreaterThan(3_000_000)
      expect(ttlMs).toBeLessThanOrEqual(3_600_000)
    })

    it('returns null when no token is stored', async () => {
      if (fs.existsSync(TOKEN_PATH)) fs.unlinkSync(TOKEN_PATH)
      const { tryRefreshStoredToken } = await import('../lib/auth.js')
      expect(await tryRefreshStoredToken()).toBeNull()
    })

    it('returns null when the stored token carries no refresh token', async () => {
      writeToken(expiredToken({ refreshToken: '' }))
      const { tryRefreshStoredToken } = await import('../lib/auth.js')
      expect(await tryRefreshStoredToken()).toBeNull()
    })

    it('returns null on a revoked refresh token (non-ok response)', async () => {
      writeToken(expiredToken())
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 400 }))
      const { tryRefreshStoredToken } = await import('../lib/auth.js')
      expect(await tryRefreshStoredToken()).toBeNull()
    })

    it('returns null instead of throwing when the network is down', async () => {
      writeToken(expiredToken())
      vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('ENOTFOUND')))
      const { tryRefreshStoredToken } = await import('../lib/auth.js')
      await expect(tryRefreshStoredToken()).resolves.toBeNull()
    })

    it('returns null when the response omits an id token', async () => {
      writeToken(expiredToken())
      vi.stubGlobal(
        'fetch',
        vi.fn().mockResolvedValue({ ok: true, json: async () => ({ expires_in: '3600' }) })
      )
      const { tryRefreshStoredToken } = await import('../lib/auth.js')
      expect(await tryRefreshStoredToken()).toBeNull()
    })

    it('does not clobber the stored token when the refresh fails', async () => {
      writeToken(expiredToken())
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 401 }))
      const { tryRefreshStoredToken } = await import('../lib/auth.js')
      await tryRefreshStoredToken()
      const persisted = JSON.parse(fs.readFileSync(TOKEN_PATH, 'utf-8'))
      expect(persisted.token).toBe('stale-id-token')
      expect(persisted.refreshToken).toBe('stored-refresh-token')
    })
  })

  // The refresh above only ever ran inside authenticate(), so the read-only
  // commands still reported a signed-in user as signed out the moment the
  // hour-long ID token lapsed — the exact symptom the refresh was added to end.
  describe('getStoredTokenOrRefresh', () => {
    it('returns a fresh token without touching the network', async () => {
      writeToken(expiredToken({ expiresAt: new Date(Date.now() + 3600_000).toISOString() }))
      const fetchMock = vi.fn()
      vi.stubGlobal('fetch', fetchMock)

      const { getStoredTokenOrRefresh } = await import('../lib/auth.js')
      const result = await getStoredTokenOrRefresh()

      expect(result?.token).toBe('stale-id-token')
      expect(fetchMock).not.toHaveBeenCalled()
    })

    it('renews an expired token instead of reporting signed-out', async () => {
      writeToken(expiredToken())
      vi.stubGlobal(
        'fetch',
        vi.fn().mockResolvedValue({
          ok: true,
          json: async () => ({ id_token: 'fresh-id-token', expires_in: '3600' })
        })
      )

      const { getStoredTokenOrRefresh } = await import('../lib/auth.js')
      const result = await getStoredTokenOrRefresh()

      expect(result?.token).toBe('fresh-id-token')
      expect(result?.github).toBe('octocat')
    })

    it('returns null when the refresh token is revoked', async () => {
      writeToken(expiredToken())
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 400 }))
      const { getStoredTokenOrRefresh } = await import('../lib/auth.js')
      expect(await getStoredTokenOrRefresh()).toBeNull()
    })

    it('returns null when nothing is stored', async () => {
      if (fs.existsSync(TOKEN_PATH)) fs.unlinkSync(TOKEN_PATH)
      const { getStoredTokenOrRefresh } = await import('../lib/auth.js')
      expect(await getStoredTokenOrRefresh()).toBeNull()
    })
  })

  describe('getStoredTokenIgnoringExpiry', () => {
    it('reports the identity of an expired token', async () => {
      writeToken(expiredToken())
      const { getStoredTokenIgnoringExpiry, getStoredToken } = await import('../lib/auth.js')

      // The contrast IS the bug: the expiry-checked read returns null here, and
      // whoami/logout reading through it is what made an expired token look
      // like a signed-out user.
      expect(getStoredToken()).toBeNull()
      expect(getStoredTokenIgnoringExpiry()?.github).toBe('octocat')
    })

    it('still returns null when nothing is stored', async () => {
      if (fs.existsSync(TOKEN_PATH)) fs.unlinkSync(TOKEN_PATH)
      const { getStoredTokenIgnoringExpiry } = await import('../lib/auth.js')
      expect(getStoredTokenIgnoringExpiry()).toBeNull()
    })

    it('returns null for a corrupt token file rather than throwing', async () => {
      fs.mkdirSync(TOKEN_DIR, { recursive: true })
      fs.writeFileSync(TOKEN_PATH, 'not json at all', 'utf-8')
      const { getStoredTokenIgnoringExpiry } = await import('../lib/auth.js')
      expect(getStoredTokenIgnoringExpiry()).toBeNull()
    })

    it('leaves no credential behind when logout clears an expired token', async () => {
      // Regression: logout read through the expiry check, so an expired token
      // printed "Not signed in" and returned WITHOUT clearing — stranding the
      // long-lived refresh token on disk for silent renewal to revive.
      writeToken(expiredToken())
      const { getStoredTokenIgnoringExpiry, clearToken } = await import('../lib/auth.js')

      const identity = getStoredTokenIgnoringExpiry()
      expect(identity).not.toBeNull()
      clearToken()

      expect(fs.existsSync(TOKEN_PATH)).toBe(false)
      expect(getStoredTokenIgnoringExpiry()).toBeNull()
    })
  })
})
