import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'

const TMP_ROOT = os.tmpdir()

let tmpHome: string
let TOKEN_PATH: string

function idTokenWithGithubId(githubId: string): string {
  const payload = Buffer.from(
    JSON.stringify({ firebase: { identities: { 'github.com': [githubId] } } })
  ).toString('base64url')
  return `header.${payload}.signature`
}

function storedToken(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    token: 'stored-id-token',
    refreshToken: 'stored-refresh-token',
    uid: 'firebase-uid-1',
    github: '62183258',
    expiresAt: new Date(Date.now() + 3600_000).toISOString(),
    ...overrides
  }
}

function githubReply(id: number, login: string): Record<string, unknown> {
  return { ok: true, status: 200, json: async () => ({ id, login }) }
}

function readPersisted(): Record<string, unknown> {
  return JSON.parse(fs.readFileSync(TOKEN_PATH, 'utf-8'))
}

describe('resolveGithubLogin', () => {
  beforeEach(() => {
    tmpHome = fs.mkdtempSync(path.join(TMP_ROOT, 'amc-cli-identity-'))
    TOKEN_PATH = path.join(tmpHome, '.amc', 'marketplace-token')
    vi.stubEnv('HOME', tmpHome)
    vi.stubEnv('USERPROFILE', tmpHome)
    vi.resetModules()
  })

  afterEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
    vi.unstubAllEnvs()
    fs.rmSync(tmpHome, { recursive: true, force: true })
  })

  it('returns a settled login with no network call and no rewrite', async () => {
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
    const { resolveGithubLogin } = await import('../lib/auth.js')

    const login = await resolveGithubLogin(storedToken({ github: 'wistfulvariable' }) as never)

    expect(login).toBe('wistfulvariable')
    expect(fetchMock).not.toHaveBeenCalled()
    expect(fs.existsSync(TOKEN_PATH)).toBe(false)
  })

  it('turns a stored numeric GitHub id into the login and saves it', async () => {
    const fetchMock = vi.fn().mockResolvedValue(githubReply(62183258, 'wistfulvariable'))
    vi.stubGlobal('fetch', fetchMock)
    const { resolveGithubLogin } = await import('../lib/auth.js')

    const login = await resolveGithubLogin(storedToken() as never)

    expect(login).toBe('wistfulvariable')
    expect(String(fetchMock.mock.calls[0]![0])).toBe('https://api.github.com/user/62183258')
    const persisted = readPersisted()
    expect(persisted.github).toBe('wistfulvariable')
    expect(persisted.token).toBe('stored-id-token')
    expect(persisted.refreshToken).toBe('stored-refresh-token')
    expect(persisted.uid).toBe('firebase-uid-1')
  })

  it('uses the ID token provider id when the file holds only a placeholder', async () => {
    const fetchMock = vi.fn().mockResolvedValue(githubReply(62183258, 'wistfulvariable'))
    vi.stubGlobal('fetch', fetchMock)
    const { resolveGithubLogin } = await import('../lib/auth.js')

    const login = await resolveGithubLogin(
      storedToken({ github: 'unknown', token: idTokenWithGithubId('62183258') }) as never
    )

    expect(login).toBe('wistfulvariable')
    expect(String(fetchMock.mock.calls[0]![0])).toBe('https://api.github.com/user/62183258')
  })

  it('refuses a reply that names a different account', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(githubReply(999, 'someoneelse')))
    const { resolveGithubLogin } = await import('../lib/auth.js')

    expect(await resolveGithubLogin(storedToken() as never)).toBeNull()
    expect(fs.existsSync(TOKEN_PATH)).toBe(false)
  })

  it('refuses a numeric login from the reply', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(githubReply(62183258, '62183258')))
    const { resolveGithubLogin } = await import('../lib/auth.js')

    expect(await resolveGithubLogin(storedToken() as never)).toBeNull()
  })

  it('leaves the credential untouched when the lookup fails', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 403 }))
    const { resolveGithubLogin } = await import('../lib/auth.js')

    expect(await resolveGithubLogin(storedToken() as never)).toBeNull()
    expect(fs.existsSync(TOKEN_PATH)).toBe(false)
  })

  it('leaves the credential untouched when the network throws', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('ENOTFOUND api.github.com')))
    const { resolveGithubLogin } = await import('../lib/auth.js')

    expect(await resolveGithubLogin(storedToken() as never)).toBeNull()
    expect(fs.existsSync(TOKEN_PATH)).toBe(false)
  })

  it('gives up when there is no numeric id anywhere', async () => {
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
    const { resolveGithubLogin } = await import('../lib/auth.js')

    expect(await resolveGithubLogin(storedToken({ github: 'unknown' }) as never)).toBeNull()
    expect(fetchMock).not.toHaveBeenCalled()
  })
})

describe('githubIdFromIdToken', () => {
  it('reads the GitHub account id from the provider identities', async () => {
    const { githubIdFromIdToken } = await import('../lib/auth.js')
    expect(githubIdFromIdToken(idTokenWithGithubId('62183258'))).toBe('62183258')
  })

  it('returns null for a token with no GitHub identity', async () => {
    const { githubIdFromIdToken } = await import('../lib/auth.js')
    const payload = Buffer.from(JSON.stringify({ firebase: { identities: {} } })).toString(
      'base64url'
    )
    expect(githubIdFromIdToken(`header.${payload}.signature`)).toBeNull()
  })

  it('returns null for a malformed token rather than throwing', async () => {
    const { githubIdFromIdToken } = await import('../lib/auth.js')
    expect(githubIdFromIdToken('not-a-jwt')).toBeNull()
    expect(githubIdFromIdToken('header.not-base64-json.signature')).toBeNull()
  })
})

describe('isGithubHandle', () => {
  it('accepts a real login', async () => {
    const { isGithubHandle } = await import('../lib/auth.js')
    expect(isGithubHandle('wistfulvariable')).toBe(true)
    expect(isGithubHandle('octo-cat')).toBe(true)
  })

  it('rejects the numeric id, the placeholder and non-handles', async () => {
    const { isGithubHandle } = await import('../lib/auth.js')
    expect(isGithubHandle('62183258')).toBe(false)
    expect(isGithubHandle('unknown')).toBe(false)
    expect(isGithubHandle('John Lasater')).toBe(false)
    expect(isGithubHandle('-leading')).toBe(false)
    expect(isGithubHandle(null)).toBe(false)
  })
})
