import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'

// Error paths around the stored credential: a corrupt token file, a sign-out that
// cannot delete, and the sign-in URL that gets handed to a command line.
//
// Sandboxed exactly like auth-refresh.test.ts — auth.ts derives TOKEN_PATH from
// os.homedir() at MODULE scope, so both env vars are redirected at a throwaway
// directory and the module registry is reset before each dynamic import. These tests
// must never touch the developer's real ~/.amc/marketplace-token.
const TMP_ROOT = os.tmpdir()
const REAL_HOME = os.homedir()

let tmpHome: string
let TOKEN_DIR: string
let TOKEN_PATH: string

function writeRaw(contents: string): void {
  fs.mkdirSync(TOKEN_DIR, { recursive: true })
  fs.writeFileSync(TOKEN_PATH, contents, 'utf-8')
}

function writeToken(token: Record<string, unknown>): void {
  writeRaw(JSON.stringify(token))
}

function freshToken(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    token: 'id-token',
    refreshToken: 'refresh-token',
    uid: 'uid-1',
    github: 'octocat',
    expiresAt: new Date(Date.now() + 3_600_000).toISOString(),
    ...overrides
  }
}

beforeEach(() => {
  tmpHome = fs.mkdtempSync(path.join(TMP_ROOT, 'amc-cli-hard-'))
  TOKEN_DIR = path.join(tmpHome, '.amc')
  TOKEN_PATH = path.join(TOKEN_DIR, 'marketplace-token')
  vi.stubEnv('HOME', tmpHome)
  vi.stubEnv('USERPROFILE', tmpHome)
  vi.resetModules()
})

afterEach(() => {
  vi.unstubAllEnvs()
  vi.restoreAllMocks()
  expect(os.homedir()).toBe(REAL_HOME)
  fs.rmSync(tmpHome, { recursive: true, force: true })
})

describe('reading a credential file that is not what it should be', () => {
  // Every case here used to reach `Authorization: Bearer <something odd>` and come
  // back as a 401 whose real cause was a corrupt local file — the least debuggable
  // form of this failure. Reporting "signed out" instead sends the user through
  // sign-in, which repairs it.

  it('reads a well-formed token', async () => {
    writeToken(freshToken())
    const { getStoredTokenIgnoringExpiry } = await import('../lib/auth.js')
    expect(getStoredTokenIgnoringExpiry()?.github).toBe('octocat')
  })

  it('rejects a token field that is an object', async () => {
    writeToken(freshToken({ token: { nested: true } }))
    const { getStoredTokenIgnoringExpiry } = await import('../lib/auth.js')
    expect(getStoredTokenIgnoringExpiry()).toBeNull()
  })

  it('rejects a numeric token', async () => {
    writeToken(freshToken({ token: 12345 }))
    const { getStoredTokenIgnoringExpiry } = await import('../lib/auth.js')
    expect(getStoredTokenIgnoringExpiry()).toBeNull()
  })

  it('rejects an empty token', async () => {
    writeToken(freshToken({ token: '' }))
    const { getStoredTokenIgnoringExpiry } = await import('../lib/auth.js')
    expect(getStoredTokenIgnoringExpiry()).toBeNull()
  })

  it('rejects a non-string expiresAt', async () => {
    writeToken(freshToken({ expiresAt: 1234567890 }))
    const { getStoredTokenIgnoringExpiry } = await import('../lib/auth.js')
    expect(getStoredTokenIgnoringExpiry()).toBeNull()
  })

  it('rejects a JSON array', async () => {
    writeRaw('[1,2,3]')
    const { getStoredTokenIgnoringExpiry } = await import('../lib/auth.js')
    expect(getStoredTokenIgnoringExpiry()).toBeNull()
  })

  it('rejects unparseable JSON without throwing', async () => {
    writeRaw('{ half-written')
    const { getStoredTokenIgnoringExpiry } = await import('../lib/auth.js')
    expect(() => getStoredTokenIgnoringExpiry()).not.toThrow()
    expect(getStoredTokenIgnoringExpiry()).toBeNull()
  })

  it('returns null when there is no file at all', async () => {
    const { getStoredTokenIgnoringExpiry } = await import('../lib/auth.js')
    expect(getStoredTokenIgnoringExpiry()).toBeNull()
  })

  it('degrades a missing refreshToken rather than rejecting the credential', async () => {
    // A file written before refresh tokens existed is still usable until it expires.
    writeToken(freshToken({ refreshToken: undefined }))
    const { getStoredTokenIgnoringExpiry } = await import('../lib/auth.js')
    const stored = getStoredTokenIgnoringExpiry()
    expect(stored?.token).toBe('id-token')
    expect(stored?.refreshToken).toBe('')
  })

  it('degrades a missing github to "unknown" rather than undefined', async () => {
    writeToken(freshToken({ github: undefined }))
    const { getStoredTokenIgnoringExpiry } = await import('../lib/auth.js')
    expect(getStoredTokenIgnoringExpiry()?.github).toBe('unknown')
  })

  it('never returns a non-string in a field the Authorization header uses', async () => {
    writeToken(freshToken({ uid: { a: 1 }, github: 42 }))
    const { getStoredTokenIgnoringExpiry } = await import('../lib/auth.js')
    const stored = getStoredTokenIgnoringExpiry()
    expect(typeof stored?.uid).toBe('string')
    expect(typeof stored?.github).toBe('string')
  })
})

describe('clearToken', () => {
  it('removes the credential and reports success', async () => {
    writeToken(freshToken())
    const { clearToken } = await import('../lib/auth.js')
    expect(clearToken()).toBe(true)
    expect(fs.existsSync(TOKEN_PATH)).toBe(false)
  })

  it('reports success when there was nothing to remove', async () => {
    const { clearToken } = await import('../lib/auth.js')
    expect(clearToken()).toBe(true)
  })

  it('reports failure instead of throwing when the unlink fails', async () => {
    // On Windows a file held open by another AMC process raises EBUSY; unguarded,
    // that turned `logout` into a stack trace with the credential still on disk.
    writeToken(freshToken())
    const { clearToken } = await import('../lib/auth.js')
    vi.spyOn(fs, 'unlinkSync').mockImplementation(() => {
      throw Object.assign(new Error('EBUSY: resource busy or locked'), { code: 'EBUSY' })
    })
    expect(() => clearToken()).not.toThrow()
    expect(clearToken()).toBe(false)
  })
})

describe('buildAuthUrl', () => {
  it('appends the session id to the default auth page', async () => {
    const { buildAuthUrl } = await import('../lib/auth.js')
    const url = new URL(buildAuthUrl('abc123'))
    expect(url.searchParams.get('session')).toBe('abc123')
    expect(url.protocol).toBe('https:')
  })

  it('honours a configured base url', async () => {
    const { buildAuthUrl } = await import('../lib/auth.js')
    expect(buildAuthUrl('s1', 'https://example.test/signin')).toBe(
      'https://example.test/signin?session=s1'
    )
  })

  it('preserves an existing query on the base url', async () => {
    const { buildAuthUrl } = await import('../lib/auth.js')
    const url = new URL(buildAuthUrl('s1', 'https://example.test/signin?theme=dark'))
    expect(url.searchParams.get('theme')).toBe('dark')
    expect(url.searchParams.get('session')).toBe('s1')
  })

  // The value used to be interpolated into `start "" "<url>"`. A quote would close
  // that quote and run whatever followed.
  describe('a base url that could break out of a command line', () => {
    it('percent-encodes a double quote rather than emitting it raw', async () => {
      const { buildAuthUrl } = await import('../lib/auth.js')
      const out = buildAuthUrl('s1', 'https://example.test/a"b')
      expect(out).not.toContain('"')
      expect(out).toContain('%22')
    })

    it('percent-encodes a space', async () => {
      const { buildAuthUrl } = await import('../lib/auth.js')
      expect(buildAuthUrl('s1', 'https://example.test/a b')).not.toMatch(/ /)
    })

    it('percent-encodes a newline', async () => {
      const { buildAuthUrl } = await import('../lib/auth.js')
      expect(buildAuthUrl('s1', 'https://example.test/a\nb')).not.toMatch(/\n/)
    })

    it('rejects a value that is not a url at all', async () => {
      const { buildAuthUrl } = await import('../lib/auth.js')
      expect(() => buildAuthUrl('s1', 'not a url & calc.exe')).toThrow(/not a valid URL/)
    })

    it('rejects a non-http scheme', async () => {
      const { buildAuthUrl } = await import('../lib/auth.js')
      expect(() => buildAuthUrl('s1', 'file:///etc/passwd')).toThrow(/http\(s\) URL/)
      expect(() => buildAuthUrl('s1', 'javascript:alert(1)')).toThrow(/http\(s\) URL/)
    })

    it('names the environment variable in the error, so the fix is obvious', async () => {
      const { buildAuthUrl } = await import('../lib/auth.js')
      expect(() => buildAuthUrl('s1', 'nope')).toThrow(/AMC_MARKETPLACE_AUTH_URL/)
    })

    it('allows plain http, for a local marketplace under development', async () => {
      const { buildAuthUrl } = await import('../lib/auth.js')
      expect(buildAuthUrl('s1', 'http://localhost:5000')).toContain('http://localhost:5000/')
    })
  })
})
