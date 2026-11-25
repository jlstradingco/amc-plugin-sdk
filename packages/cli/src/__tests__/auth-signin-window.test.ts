import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'
import { createHash } from 'node:crypto'

const TMP_ROOT = os.tmpdir()

let tmpHome: string
let TOKEN_DIR: string
let TOKEN_PATH: string

function writeToken(token: Record<string, unknown>): void {
  fs.mkdirSync(TOKEN_DIR, { recursive: true })
  fs.writeFileSync(TOKEN_PATH, JSON.stringify(token), 'utf-8')
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

interface FetchCall {
  url: string
  init: RequestInit | undefined
}

function handoff(seed: string): { verifier: string; sessionId: string } {
  const verifier = seed.repeat(64).slice(0, 64)
  return { verifier, sessionId: createHash('sha256').update(verifier, 'utf8').digest('hex') }
}

function respondWith(...replies: Array<() => unknown>) {
  const calls: FetchCall[] = []
  let index = 0
  const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
    calls.push({ url: String(url), init })
    const reply = replies[Math.min(index, replies.length - 1)]
    index += 1
    return reply()
  })
  vi.stubGlobal('fetch', fetchMock)
  return { fetchMock, calls }
}

const notFound = () => Promise.resolve({ ok: false, json: async () => ({}) })
const signedIn = () => Promise.resolve({
  ok: true,
  json: async () => ({
    token: 'browser-id-token',
    refreshToken: 'browser-refresh-token',
    uid: 'uid-9',
    github: 'octocat',
    expiresAt: new Date(Date.now() + 3_600_000).toISOString()
  })
})

beforeEach(() => {
  tmpHome = fs.mkdtempSync(path.join(TMP_ROOT, 'amc-cli-signin-'))
  TOKEN_DIR = path.join(tmpHome, '.amc')
  TOKEN_PATH = path.join(TOKEN_DIR, 'marketplace-token')
  vi.stubEnv('HOME', tmpHome)
  vi.stubEnv('USERPROFILE', tmpHome)
  vi.resetModules()
})

afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllEnvs()
  vi.unstubAllGlobals()
  fs.rmSync(tmpHome, { recursive: true, force: true })
})

describe('the sign-in window', () => {
  it('allows far longer than the two minutes a headless author was given', async () => {
    const { SIGN_IN_TIMEOUT_MS } = await import('../lib/auth.js')
    expect(SIGN_IN_TIMEOUT_MS).toBeGreaterThanOrEqual(10 * 60 * 1000)
  })

  it('polls slowly enough to leave the sign-in route its 120 requests a minute', async () => {
    const { SIGN_IN_POLL_INTERVAL_MS } = await import('../lib/auth.js')
    const requestsPerMinute = 60_000 / SIGN_IN_POLL_INTERVAL_MS
    expect(requestsPerMinute).toBeLessThanOrEqual(60)
  })
})

describe('waitForSignIn', () => {
  it('returns the credential as soon as the browser sign-in lands, then consumes the session', async () => {
    const { calls } = respondWith(notFound, notFound, signedIn)
    const { waitForSignIn } = await import('../lib/auth.js')
    const minted = handoff('a')

    const token = await waitForSignIn(minted, { timeoutMs: 5_000, intervalMs: 10, onWait: () => {} })

    expect(token.token).toBe('browser-id-token')
    expect(token.github).toBe('octocat')
    expect(calls.length).toBe(4)
    expect(calls[0].url).not.toContain('session=')
    expect((calls[0].init?.headers as Record<string, string>)['x-auth-verifier']).toBe(minted.verifier)
    expect(calls[3].init?.method).toBe('POST')
  })

  it('saves the credential before returning it, so a run that dies is still signed in', async () => {
    respondWith(signedIn)
    const { waitForSignIn } = await import('../lib/auth.js')

    await waitForSignIn(handoff('b'), { timeoutMs: 5_000, intervalMs: 10, onWait: () => {} })

    const persisted = JSON.parse(fs.readFileSync(TOKEN_PATH, 'utf-8'))
    expect(persisted.token).toBe('browser-id-token')
    if (os.platform() !== 'win32') {
      expect(fs.statSync(TOKEN_PATH).mode & 0o777).toBe(0o600)
    }
  })

  it('consumes nothing when the credential could not be saved', async () => {
    fs.writeFileSync(TOKEN_DIR, 'not a directory', 'utf-8')
    const { calls } = respondWith(signedIn)
    const { waitForSignIn } = await import('../lib/auth.js')

    await expect(
      waitForSignIn(handoff('i'), { timeoutMs: 150, intervalMs: 20, onWait: () => {} })
    ).rejects.toThrow(/could not be saved to .*marketplace-token/)

    expect(calls.some((call) => call.init?.method === 'POST')).toBe(false)
  })

  it('keeps polling through a network error rather than ending the wait', async () => {
    respondWith(
      () => Promise.reject(new Error('ECONNRESET')),
      () => Promise.reject(new Error('ETIMEDOUT')),
      signedIn
    )
    const { waitForSignIn } = await import('../lib/auth.js')

    const token = await waitForSignIn(handoff('c'), { timeoutMs: 5_000, intervalMs: 10, onWait: () => {} })
    expect(token.token).toBe('browser-id-token')
  })

  it('keeps polling after a 404, because the page has not created the session yet', async () => {
    const { calls } = respondWith(notFound, notFound, notFound, signedIn)
    const { waitForSignIn } = await import('../lib/auth.js')

    await waitForSignIn(handoff('d'), { timeoutMs: 5_000, intervalMs: 10, onWait: () => {} })
    expect(calls.filter((call) => call.url.includes('getAuthSession'))).toHaveLength(5)
  })

  it('fails with the window it waited, naming the way forward, when no sign-in arrives', async () => {
    const { fetchMock } = respondWith(notFound)
    const { waitForSignIn } = await import('../lib/auth.js')

    const startedAt = Date.now()
    await expect(
      waitForSignIn(handoff('e'), { timeoutMs: 200, intervalMs: 20, onWait: () => {} })
    ).rejects.toThrow(/not completed within .*Run the command again/)

    const waited = Date.now() - startedAt
    expect(waited).toBeGreaterThanOrEqual(180)
    expect(waited).toBeLessThan(5_000)
    expect(fetchMock).toHaveBeenCalled()
  })

  it('saves nothing when the window closes without a sign-in', async () => {
    respondWith(notFound)
    const { waitForSignIn } = await import('../lib/auth.js')

    await expect(
      waitForSignIn(handoff('f'), { timeoutMs: 120, intervalMs: 20, onWait: () => {} })
    ).rejects.toThrow()
    expect(fs.existsSync(TOKEN_PATH)).toBe(false)
  })

  it('reports progress on every poll, so a long wait is visible', async () => {
    respondWith(notFound, notFound, signedIn)
    const { waitForSignIn } = await import('../lib/auth.js')
    const ticks: Array<{ elapsedMs: number; remainingMs: number }> = []

    await waitForSignIn(handoff('g'), {
      timeoutMs: 5_000,
      intervalMs: 10,
      onWait: (tick) => ticks.push(tick)
    })

    expect(ticks.length).toBe(2)
    expect(ticks[1].elapsedMs).toBeGreaterThanOrEqual(ticks[0].elapsedMs)
    expect(ticks[1].remainingMs).toBeGreaterThan(0)
  })

  it('names an unsaveable credential instead of reporting a sign-in that never happened', async () => {
    fs.writeFileSync(TOKEN_DIR, 'not a directory', 'utf-8')
    respondWith(signedIn)
    const { waitForSignIn } = await import('../lib/auth.js')

    await expect(
      waitForSignIn(handoff('h'), { timeoutMs: 150, intervalMs: 20, onWait: () => {} })
    ).rejects.toThrow(/could not be saved to .*marketplace-token/)
  })

  it('still signs in when the marketplace does not answer the consume', async () => {
    const calls: FetchCall[] = []
    vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => {
      calls.push({ url: String(url), init })
      if (init?.method === 'POST') throw new Error('ECONNRESET')
      return signedIn()
    }))
    const { waitForSignIn } = await import('../lib/auth.js')

    const token = await waitForSignIn(handoff('j'), { timeoutMs: 5_000, intervalMs: 10, onWait: () => {} })
    expect(token.token).toBe('browser-id-token')
    expect(calls.some((call) => call.init?.method === 'POST')).toBe(true)
  })
})

describe('authenticate', () => {
  it('reuses a stored credential without opening a browser or polling', async () => {
    writeToken(freshToken())
    const { fetchMock } = respondWith(signedIn)
    const openBrowser = vi.fn()
    const { authenticate } = await import('../lib/auth.js')

    const token = await authenticate({ openBrowser })
    expect(token.token).toBe('id-token')
    expect(openBrowser).not.toHaveBeenCalled()
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('opens the sign-in page for the handoff it then polls, without touching a real browser', async () => {
    const { calls } = respondWith(signedIn)
    const openBrowser = vi.fn()
    const { authenticate } = await import('../lib/auth.js')

    const token = await authenticate({ openBrowser, timeoutMs: 5_000, intervalMs: 10, onWait: () => {} })

    expect(token.token).toBe('browser-id-token')
    expect(openBrowser).toHaveBeenCalledTimes(1)
    const opened = new URL(openBrowser.mock.calls[0][0])
    const session = opened.searchParams.get('session')
    expect(session).toMatch(/^[A-Za-z0-9_-]{20,200}$/)

    const polled = calls.find((call) => call.url.includes('getAuthSession'))
    const verifier = (polled?.init?.headers as Record<string, string>)['x-auth-verifier']
    expect(createHash('sha256').update(verifier, 'utf8').digest('hex')).toBe(session)
  })

  it('prints the link and the wait up front, which is all a headless author has', async () => {
    respondWith(signedIn)
    const lines: string[] = []
    vi.spyOn(console, 'log').mockImplementation((...args: unknown[]) => {
      lines.push(args.join(' '))
    })
    const { authenticate } = await import('../lib/auth.js')

    await authenticate({ openBrowser: () => {}, timeoutMs: 5_000, intervalMs: 10, onWait: () => {} })

    const printed = lines.join('\n')
    expect(printed).toContain('If the browser doesn')
    expect(printed).toMatch(/session=[A-Za-z0-9_-]{20,}/)
    expect(printed).toContain('any device')
    expect(printed).toMatch(/up to 5s/)
  })
})
