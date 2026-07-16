import { describe, it, expect } from 'vitest'
import * as path from 'node:path'
import {
  resolveAmcUserDataDir,
  resolveAmcPluginsDir,
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
