import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'

// `amc-plugin login` / `omniscio-plugin login` is the sign-in step on its own, for an
// author who needs the marketplace credential without publishing — the packaged app's
// My Plugins tab borrows this exact file and has no sign-in of its own.
//
// Sandboxed like auth-refresh.test.ts: auth.ts derives TOKEN_PATH from os.homedir() at
// MODULE scope, so both env vars are redirected at a throwaway directory and the module
// registry is reset before each dynamic import. These tests must never touch a real
// ~/.amc/marketplace-token, and the browser opener is mocked so a run cannot launch one.

vi.mock('node:child_process', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:child_process')>()
  return { ...actual, spawnSync: vi.fn() }
})

const TMP_ROOT = os.tmpdir()
const REAL_HOME = os.homedir()
const REAL_USERPROFILE = process.env.USERPROFILE

let tmpHome: string
let TOKEN_DIR: string
let TOKEN_PATH: string
let logged: string[]
let errored: string[]

const FRESH_TOKEN = {
  token: 'id-token-123',
  refreshToken: 'refresh-123',
  uid: 'uid-1',
  github: 'janedoe',
  expiresAt: new Date(Date.now() + 60 * 60 * 1000).toISOString()
}

function writeToken(token: Record<string, unknown>): string {
  fs.mkdirSync(TOKEN_DIR, { recursive: true })
  const text = JSON.stringify(token)
  fs.writeFileSync(TOKEN_PATH, text, 'utf-8')
  return text
}

function tokenOnDisk(): Record<string, unknown> | null {
  try {
    return JSON.parse(fs.readFileSync(TOKEN_PATH, 'utf-8'))
  } catch {
    return null
  }
}

async function runLogin(): Promise<void> {
  vi.resetModules()
  const { runLogin: login } = await import('../commands/login.js')
  await login()
}

describe('omniscio-plugin login', () => {
  beforeEach(() => {
    tmpHome = fs.mkdtempSync(path.join(TMP_ROOT, 'amc-login-'))
    TOKEN_DIR = path.join(tmpHome, '.amc')
    TOKEN_PATH = path.join(TOKEN_DIR, 'marketplace-token')
    process.env.HOME = tmpHome
    process.env.USERPROFILE = tmpHome
    delete process.env.AMC_MARKETPLACE_API_URL
    logged = []
    errored = []
    vi.spyOn(console, 'log').mockImplementation((...args: unknown[]) => {
      logged.push(args.map(String).join(' '))
    })
    vi.spyOn(console, 'error').mockImplementation((...args: unknown[]) => {
      errored.push(args.map(String).join(' '))
    })
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
    process.env.HOME = REAL_HOME
    if (REAL_USERPROFILE === undefined) delete process.env.USERPROFILE
    else process.env.USERPROFILE = REAL_USERPROFILE
    process.exitCode = 0
    fs.rmSync(tmpHome, { recursive: true, force: true })
  })

  it('reports the account it already has, without a browser or a write', async () => {
    const before = writeToken(FRESH_TOKEN)
    const fetchMock = vi.fn(() => {
      throw new Error('login must not touch the network when a fresh credential is stored')
    })
    vi.stubGlobal('fetch', fetchMock)

    await runLogin()

    expect(logged.join('\n')).toContain('Signed in as janedoe')
    expect(logged.join('\n')).toContain('marketplace-token')
    expect(logged.join('\n')).toContain('omniscio-plugin logout')
    expect(fetchMock).not.toHaveBeenCalled()
    expect(fs.readFileSync(TOKEN_PATH, 'utf-8')).toBe(before)
    expect(process.exitCode ?? 0).toBe(0)
  })

  it('signs in through the shared flow and saves the credential where the app reads it', async () => {
    const fetchMock = vi.fn(async (_url: string) => ({
      ok: true,
      json: async () => ({
        token: 'minted-token',
        refreshToken: 'minted-refresh',
        uid: 'uid-9',
        github: 'octocat',
        expiresAt: new Date(Date.now() + 60 * 60 * 1000).toISOString()
      })
    }))
    vi.stubGlobal('fetch', fetchMock)

    const pending = runLogin()
    await vi.advanceTimersByTimeAsync(5000)
    await pending

    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(fetchMock.mock.calls[0]?.[0]).toMatch(/\/getAuthSession\?session=[A-Za-z0-9_-]{20,200}$/)
    expect(tokenOnDisk()).toMatchObject({ token: 'minted-token', refreshToken: 'minted-refresh', github: 'octocat' })
    expect(logged.join('\n')).toContain('Signed in as octocat')
    expect(logged.join('\n')).toContain('Credential saved to')
    expect(process.exitCode ?? 0).toBe(0)
  })

  it('fails with a plain sentence and a non-zero exit when the sign-in never completes', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false, json: async () => ({}) })))

    const pending = runLogin()
    await vi.advanceTimersByTimeAsync(901_000)
    await pending

    expect(errored.join('\n')).toContain('Sign-in was not completed within')
    expect(errored.join('\n')).toContain("omniscio-plugin login' again")
    expect(tokenOnDisk()).toBeNull()
    expect(process.exitCode).toBe(1)
  })

  it('names the credential path when the write fails, instead of reporting a timeout', async () => {
    // A file where the credential's directory belongs makes every write throw, and it
    // keeps throwing — the exact case the old flow reported as "Authentication timed out"
    // after two minutes of polling for a sign-in that had in fact succeeded.
    fs.mkdirSync(tmpHome, { recursive: true })
    fs.writeFileSync(TOKEN_DIR, 'not a directory', 'utf-8')
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({
        ok: true,
        json: async () => ({
          token: 'minted-token',
          refreshToken: 'minted-refresh',
          uid: 'uid-9',
          github: 'octocat',
          expiresAt: new Date(Date.now() + 60 * 60 * 1000).toISOString()
        })
      }))
    )

    const pending = runLogin()
    await vi.advanceTimersByTimeAsync(901_000)
    await pending

    const said = errored.join('\n')
    expect(said).toContain('could not be saved')
    expect(said).toContain('marketplace-token')
    expect(said).not.toContain('Authentication timed out')
    expect(process.exitCode).toBe(1)
  })
})
