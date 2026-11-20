import { describe, it, expect } from 'vitest'
import * as path from 'node:path'
import {
  resolveAmcUserDataDir,
  resolveAmcPluginsDir,
  resolvePluginsDirForInstall,
  readCliToken,
  amcControlPort,
} from '../lib/amc-host.js'

describe('resolveAmcUserDataDir', () => {
  it('uses %APPDATA%/agent-mission-control on Windows', () => {
    const dir = resolveAmcUserDataDir({
      platform: 'win32',
      env: { APPDATA: 'C:\\Users\\me\\AppData\\Roaming' },
      homedir: 'C:\\Users\\me',
    })
    // win32 expectations must use path.win32 so the assertion is correct on a
    // POSIX CI runner (ambient path.join would emit forward slashes there).
    expect(dir).toBe(path.win32.join('C:\\Users\\me\\AppData\\Roaming', 'agent-mission-control'))
  })

  it('falls back to <home>/AppData/Roaming when APPDATA is unset on Windows', () => {
    const dir = resolveAmcUserDataDir({ platform: 'win32', env: {}, homedir: 'C:\\Users\\me' })
    expect(dir).toBe(path.win32.join('C:\\Users\\me', 'AppData', 'Roaming', 'agent-mission-control'))
  })

  it('uses ~/Library/Application Support/agent-mission-control on macOS', () => {
    const dir = resolveAmcUserDataDir({ platform: 'darwin', env: {}, homedir: '/Users/me' })
    expect(dir).toBe('/Users/me/Library/Application Support/agent-mission-control')
  })

  it('uses XDG_CONFIG_HOME/agent-mission-control on Linux when set', () => {
    const dir = resolveAmcUserDataDir({
      platform: 'linux',
      env: { XDG_CONFIG_HOME: '/home/me/.config' },
      homedir: '/home/me',
    })
    expect(dir).toBe('/home/me/.config/agent-mission-control')
  })

  it('falls back to ~/.config/agent-mission-control on Linux', () => {
    const dir = resolveAmcUserDataDir({ platform: 'linux', env: {}, homedir: '/home/me' })
    expect(dir).toBe('/home/me/.config/agent-mission-control')
  })
})

describe('resolveAmcPluginsDir', () => {
  it('is the userData dir plus /plugins', () => {
    const dir = resolveAmcPluginsDir({ platform: 'darwin', env: {}, homedir: '/Users/me' })
    expect(dir).toBe('/Users/me/Library/Application Support/agent-mission-control/plugins')
  })
})

describe('readCliToken', () => {
  it('prefers AMC_CLI_TOKEN from the environment', () => {
    const token = readCliToken({
      env: { AMC_CLI_TOKEN: '  env-token  ' },
      homedir: '/home/me',
      readFile: () => 'file-token',
    })
    expect(token).toBe('env-token')
  })

  it('falls back to ~/.amc/cli-token', () => {
    let readPath = ''
    const token = readCliToken({
      env: {},
      homedir: '/home/me',
      readFile: (p) => {
        readPath = p
        return 'file-token\n'
      },
    })
    expect(token).toBe('file-token')
    expect(readPath).toBe(path.join('/home/me', '.amc', 'cli-token'))
  })

  it('returns null when neither source is available', () => {
    const token = readCliToken({
      env: {},
      homedir: '/home/me',
      readFile: () => {
        throw new Error('ENOENT')
      },
    })
    expect(token).toBeNull()
  })

  it('reads the token file a named instance owns', () => {
    let readPath = ''
    const token = readCliToken({
      env: { AMC_INSTANCE_ID: 'dev2' },
      homedir: '/home/me',
      readFile: (p) => {
        readPath = p
        return 'instance-token'
      },
    })
    expect(token).toBe('instance-token')
    expect(readPath).toBe(path.join('/home/me', '.amc', 'cli-token-dev2'))
  })

  it('honours an absolute AMC_CLI_TOKEN_FILE', () => {
    const token = readCliToken({
      env: { AMC_CLI_TOKEN_FILE: '/custom/place/token' },
      homedir: '/home/me',
      readFile: (p) => {
        if (p === '/custom/place/token') return 'custom-token'
        throw new Error('ENOENT')
      },
    })
    expect(token).toBe('custom-token')
  })

  it('ignores a relative AMC_CLI_TOKEN_FILE, like the app does', () => {
    const seen: string[] = []
    const token = readCliToken({
      env: { AMC_CLI_TOKEN_FILE: 'relative/token' },
      homedir: '/home/me',
      readFile: (p) => {
        seen.push(p)
        throw new Error('ENOENT')
      },
    })
    expect(token).toBeNull()
    expect(seen).toEqual([path.join('/home/me', '.amc', 'cli-token')])
  })
})

describe('amcControlPort', () => {
  it('defaults to 19519', () => {
    expect(amcControlPort({})).toBe(19519)
  })

  it('honors a valid AMC_CLI_PORT override', () => {
    expect(amcControlPort({ AMC_CLI_PORT: '20000' })).toBe(20000)
  })

  it('ignores a non-numeric AMC_CLI_PORT', () => {
    expect(amcControlPort({ AMC_CLI_PORT: 'nope' })).toBe(19519)
  })
})

describe('resolvePluginsDirForInstall', () => {
  function jsonResponse(body: unknown, status = 200): Response {
    return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })
  }

  it('asks the running app for its userData folder and joins plugins onto it', async () => {
    let seenUrl = ''
    let seenAuth = ''
    const fetchImpl = (async (url: string | URL | Request, init?: RequestInit) => {
      seenUrl = String(url)
      seenAuth = String((init?.headers as Record<string, string> | undefined)?.Authorization ?? '')
      return jsonResponse({ ok: true, data: { path: '/data/root/profiles/u1' } })
    }) as typeof fetch

    const result = await resolvePluginsDirForInstall({ token: 'cli-token', port: 19531, fetchImpl })

    expect(result.source).toBe('app')
    expect(result.dir).toBe(path.join('/data/root/profiles/u1', 'plugins'))
    expect(seenUrl).toBe('http://127.0.0.1:19531/app/user-data-path')
    expect(seenAuth).toBe('Bearer cli-token')
  })

  it('falls back when the app answers with an error status', async () => {
    const fetchImpl = (async () => jsonResponse({ error: 'nope' }, 404)) as typeof fetch
    const result = await resolvePluginsDirForInstall({ token: 'cli-token', port: 19531, fetchImpl })

    expect(result.source).toBe('fallback')
    expect(result.dir).toBe(resolveAmcPluginsDir())
    expect(result.reason).toContain('HTTP 404')
  })

  it('falls back when the answer carries no usable folder', async () => {
    const fetchImpl = (async () => jsonResponse({ ok: true, data: {} })) as typeof fetch
    const result = await resolvePluginsDirForInstall({ token: 'cli-token', port: 19531, fetchImpl })

    expect(result.source).toBe('fallback')
    expect(result.reason).toContain('usable data folder')
  })

  it('falls back when the answer is not a folder path at all', async () => {
    const fetchImpl = (async () => jsonResponse({ ok: true, data: { path: 'relative/place' } })) as typeof fetch
    const result = await resolvePluginsDirForInstall({ token: 'cli-token', port: 19531, fetchImpl })

    expect(result.source).toBe('fallback')
    expect(result.reason).toContain('usable data folder')
  })

  it('says the app is not running when nothing accepts the connection', async () => {
    const fetchImpl = (async () => {
      throw Object.assign(new TypeError('fetch failed'), { cause: { code: 'ECONNREFUSED' } })
    }) as typeof fetch
    const result = await resolvePluginsDirForInstall({ token: 'cli-token', port: 19531, fetchImpl })

    expect(result.source).toBe('fallback')
    expect(result.reason).toBe('Omniscio is not running')
  })

  it('does not call the app at all without a control token', async () => {
    let called = false
    const fetchImpl = (async () => {
      called = true
      return jsonResponse({ ok: true, data: { path: '/data/root' } })
    }) as typeof fetch

    const result = await resolvePluginsDirForInstall({ token: null, port: 19531, fetchImpl })

    expect(called).toBe(false)
    expect(result.source).toBe('fallback')
    expect(result.dir).toBe(resolveAmcPluginsDir())
    expect(result.reason).toContain('no control token')
  })
})
