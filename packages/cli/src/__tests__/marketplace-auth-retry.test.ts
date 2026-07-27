import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'
import type { StoredToken } from '../lib/auth.js'

// Token freshness is checked before a command runs, never during it — so a
// long upload, a skewed clock, or a server-side revocation could still meet a
// 401 mid-flight and fail the publish outright while a working refresh token
// sat on disk. These cover the renew-and-retry-once path and, just as
// importantly, that it does not retry forever or mask the original rejection.

const TMP_ROOT = os.tmpdir()

let tmpHome: string
let TOKEN_PATH: string

function writeToken(overrides: Record<string, unknown> = {}): void {
  fs.mkdirSync(path.dirname(TOKEN_PATH), { recursive: true })
  fs.writeFileSync(
    TOKEN_PATH,
    JSON.stringify({
      token: 'stale-id-token',
      refreshToken: 'stored-refresh-token',
      uid: 'uid-1',
      github: 'octocat',
      expiresAt: new Date(Date.now() - 60_000).toISOString(),
      ...overrides
    }),
    'utf-8'
  )
}

const TOKEN: StoredToken = {
  token: 'in-flight-id-token',
  refreshToken: 'stored-refresh-token',
  uid: 'uid-1',
  github: 'octocat',
  expiresAt: new Date(Date.now() + 3600_000).toISOString()
}

/**
 * A minimal Response stand-in — only `status`, `ok`, `json` and `clone` are consumed.
 *
 * `clone()` matters: `isRenewableRejection` inspects a 403's body to decide whether a
 * renewal could help, and the ORIGINAL must still be readable by `handleResponse`
 * afterwards. A stand-in without it would pass the retry tests while the real code
 * threw on every 403.
 */
function reply(status: number, body: unknown = {}): Response {
  const res = {
    ok: status >= 200 && status < 300,
    status,
    statusText: '',
    json: async () => body,
    clone: () => reply(status, body)
  }
  return res as Response
}

/** The Authorization header of the Nth fetch call. */
function bearerOf(mock: ReturnType<typeof vi.fn>, call: number): string {
  const init = mock.mock.calls[call][1] as { headers: Record<string, string> }
  return init.headers.Authorization
}

describe('marketplace API token renewal', () => {
  beforeEach(() => {
    tmpHome = fs.mkdtempSync(path.join(TMP_ROOT, 'amc-cli-retry-'))
    TOKEN_PATH = path.join(tmpHome, '.amc', 'marketplace-token')
    vi.stubEnv('HOME', tmpHome)
    vi.stubEnv('USERPROFILE', tmpHome)
    vi.resetModules()
  })

  afterEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllEnvs()
    fs.rmSync(tmpHome, { recursive: true, force: true })
  })

  it('does not touch the refresh endpoint when the call succeeds', async () => {
    writeToken()
    const fetchMock = vi.fn().mockResolvedValue(reply(200, { submissions: [] }))
    vi.stubGlobal('fetch', fetchMock)

    const { getMyPlugins } = await import('../lib/marketplace-api.js')
    await getMyPlugins(TOKEN)

    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('renews and retries once on a 401, then succeeds', async () => {
    writeToken()
    const fetchMock = vi
      .fn()
      // 1. the original call, rejected
      .mockResolvedValueOnce(reply(401))
      // 2. the securetoken refresh
      .mockResolvedValueOnce(reply(200, { id_token: 'renewed-id-token', expires_in: '3600' }))
      // 3. the retry
      .mockResolvedValueOnce(reply(200, { submissions: [{ id: 's1' }] }))
    vi.stubGlobal('fetch', fetchMock)

    const { getMyPlugins } = await import('../lib/marketplace-api.js')
    const result = await getMyPlugins(TOKEN)

    expect(result.submissions).toHaveLength(1)
    expect(fetchMock).toHaveBeenCalledTimes(3)
    // The retry must carry the RENEWED token, not the one that was just refused.
    expect(bearerOf(fetchMock, 0)).toBe('Bearer in-flight-id-token')
    expect(bearerOf(fetchMock, 2)).toBe('Bearer renewed-id-token')
  })

  it('does NOT retry the marketplace 403, which no fresh token can fix', async () => {
    // FORBIDDEN means "that namespace belongs to another developer" (or "you are not an
    // admin") — a decision about who you are, not about how old your token is. Retrying
    // re-sent the entire request, which for uploadPlugin is up to 50MB of package bytes
    // sent a second time for a guaranteed failure, plus a second slot against the hourly
    // upload limit.
    writeToken()
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        reply(403, { error: true, code: 'FORBIDDEN', message: '"x" is owned by another developer' })
      )
    vi.stubGlobal('fetch', fetchMock)

    const { getMyPlugins } = await import('../lib/marketplace-api.js')

    await expect(getMyPlugins(TOKEN)).rejects.toThrow(/owned by another developer/)
    // One call: no renewal round trip, no second request.
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('does not retry an unexplained 403', async () => {
    // A proxy or gateway 403 with no JSON body is treated as the permanent kind.
    writeToken()
    const fetchMock = vi.fn().mockResolvedValueOnce({
      ok: false,
      status: 403,
      statusText: 'Forbidden',
      json: async () => {
        throw new Error('not JSON')
      },
      clone: () => ({
        json: async () => {
          throw new Error('not JSON')
        }
      })
    })
    vi.stubGlobal('fetch', fetchMock)

    const { getMyPlugins } = await import('../lib/marketplace-api.js')

    await expect(getMyPlugins(TOKEN)).rejects.toThrow()
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('does retry a 403 that identifies itself as an auth-freshness problem', async () => {
    // Belt and braces: if a proxy or a future server revision answers AUTH_REQUIRED with
    // the wrong status, a renewal genuinely could fix it.
    writeToken()
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        reply(403, { error: true, code: 'AUTH_REQUIRED', message: 'Invalid or expired token' })
      )
      .mockResolvedValueOnce(reply(200, { id_token: 'renewed-id-token', expires_in: '3600' }))
      .mockResolvedValueOnce(reply(200, { submissions: [] }))
    vi.stubGlobal('fetch', fetchMock)

    const { getMyPlugins } = await import('../lib/marketplace-api.js')
    await getMyPlugins(TOKEN)

    expect(fetchMock).toHaveBeenCalledTimes(3)
    expect(bearerOf(fetchMock, 2)).toBe('Bearer renewed-id-token')
  })

  it('leaves the original 403 body readable after inspecting a clone', async () => {
    // The regression this guards: reading the body to classify the rejection would consume
    // it, so handleResponse would lose the server's own message and report a bare HTTP 403.
    writeToken()
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        reply(403, { error: true, code: 'FORBIDDEN', message: 'the specific server reason' })
      )
    vi.stubGlobal('fetch', fetchMock)

    const { getMyPlugins } = await import('../lib/marketplace-api.js')
    await expect(getMyPlugins(TOKEN)).rejects.toThrow('the specific server reason')
  })

  it('surfaces the original rejection when renewal fails', async () => {
    writeToken()
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(reply(401, { error: true, code: 'UNAUTHENTICATED', message: 'nope' }))
      // refresh itself is refused — the token was revoked, not merely expired
      .mockResolvedValueOnce(reply(400))
    vi.stubGlobal('fetch', fetchMock)

    const { getMyPlugins, MarketplaceApiError } = await import('../lib/marketplace-api.js')

    await expect(getMyPlugins(TOKEN)).rejects.toBeInstanceOf(MarketplaceApiError)
    // No third call: one renewal attempt, never a loop.
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it('retries only once when the renewed token is refused too', async () => {
    writeToken()
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(reply(401))
      .mockResolvedValueOnce(reply(200, { id_token: 'renewed-id-token', expires_in: '3600' }))
      // the retry is refused as well — this must NOT trigger another renewal
      .mockResolvedValueOnce(reply(401, { error: true, code: 'UNAUTHENTICATED', message: 'nope' }))
    vi.stubGlobal('fetch', fetchMock)

    const { getMyPlugins } = await import('../lib/marketplace-api.js')

    await expect(getMyPlugins(TOKEN)).rejects.toThrow()
    expect(fetchMock).toHaveBeenCalledTimes(3)
  })

  it('does not retry a non-auth failure', async () => {
    writeToken()
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(reply(500, { error: true, code: 'INTERNAL', message: 'boom' }))
    vi.stubGlobal('fetch', fetchMock)

    const { getMyPlugins } = await import('../lib/marketplace-api.js')

    await expect(getMyPlugins(TOKEN)).rejects.toThrow()
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('rebuilds the upload body on retry rather than replaying a consumed one', async () => {
    writeToken()
    const pkg = path.join(tmpHome, 'plugin.amcplugin')
    fs.writeFileSync(pkg, 'fake-package-bytes')

    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(reply(401))
      .mockResolvedValueOnce(reply(200, { id_token: 'renewed-id-token', expires_in: '3600' }))
      .mockResolvedValueOnce(reply(200, { submissionId: 'sub-1', status: 'pending' }))
    vi.stubGlobal('fetch', fetchMock)

    const { uploadPackage } = await import('../lib/marketplace-api.js')
    const result = await uploadPackage(TOKEN, pkg, 'a changelog')

    expect(result.submissionId).toBe('sub-1')
    // Each upload attempt must carry its own FormData instance.
    const firstBody = (fetchMock.mock.calls[0][1] as { body: unknown }).body
    const retryBody = (fetchMock.mock.calls[2][1] as { body: unknown }).body
    expect(firstBody).toBeInstanceOf(FormData)
    expect(retryBody).toBeInstanceOf(FormData)
    expect(retryBody).not.toBe(firstBody)
  })
})
