import { describe, it, expect, vi, afterEach } from 'vitest'
import { compareVersions, parseVersion, planUpdate } from '../lib/update-plan.js'
import {
  installCommand,
  runUpdate,
  type LatestLookup,
  type UpdateDeps
} from '../commands/update.js'

afterEach(() => {
  vi.restoreAllMocks()
})

function makeDeps(currentVersion: string, latest: LatestLookup) {
  const install = vi.fn()
  const deps: UpdateDeps = {
    currentVersion,
    lookupLatest: async () => latest,
    install
  }
  return { deps, install }
}

function captureOutput() {
  const printed: string[] = []
  const record = (...args: unknown[]) => {
    printed.push(args.join(' '))
  }
  vi.spyOn(console, 'log').mockImplementation(record)
  vi.spyOn(console, 'error').mockImplementation(record)
  vi.spyOn(console, 'warn').mockImplementation(record)
  return printed
}

describe('parseVersion', () => {
  it('reads a plain release', () => {
    expect(parseVersion('3.6.0')).toEqual({ core: [3, 6, 0], prerelease: null })
  })

  it('drops a leading v and any build metadata', () => {
    expect(parseVersion('v3.6.0+build.7')).toEqual({ core: [3, 6, 0], prerelease: null })
  })

  it('keeps the pre-release identifiers', () => {
    expect(parseVersion('3.6.0-beta.2')).toEqual({ core: [3, 6, 0], prerelease: ['beta', '2'] })
  })

  it('returns null for text that is not a version', () => {
    expect(parseVersion('banana')).toBeNull()
    expect(parseVersion('')).toBeNull()
  })
})

describe('compareVersions', () => {
  it('orders a newer local build above an older published one', () => {
    expect(compareVersions('3.6.0', '3.5.0')).toBe(1)
  })

  it('orders an older local build below the published one', () => {
    expect(compareVersions('3.4.0', '3.5.0')).toBe(-1)
  })

  it('treats identical versions as equal', () => {
    expect(compareVersions('3.5.0', '3.5.0')).toBe(0)
  })

  it('pads a short version with zeros', () => {
    expect(compareVersions('3.6', '3.6.0')).toBe(0)
    expect(compareVersions('3.6', '3.6.1')).toBe(-1)
  })

  it('ignores a leading v and build metadata', () => {
    expect(compareVersions('v3.6.0', '3.6.0')).toBe(0)
    expect(compareVersions('3.6.0+build.7', '3.6.0')).toBe(0)
  })

  it('orders a pre-release below its own release', () => {
    expect(compareVersions('3.6.0-beta.1', '3.6.0')).toBe(-1)
    expect(compareVersions('3.6.0', '3.6.0-beta.1')).toBe(1)
  })

  it('orders pre-release identifiers numerically, not as text', () => {
    expect(compareVersions('3.6.0-beta.2', '3.6.0-beta.10')).toBe(-1)
  })

  it('orders a bare pre-release below the same pre-release with a number', () => {
    expect(compareVersions('3.6.0-alpha', '3.6.0-alpha.1')).toBe(-1)
  })

  it('orders a pre-release above an older release', () => {
    expect(compareVersions('3.6.0-beta.1', '3.5.0')).toBe(1)
  })

  it('treats unparseable input as older than any real version', () => {
    expect(compareVersions('unknown', '3.5.0')).toBe(-1)
    expect(compareVersions('3.5.0', 'unknown')).toBe(1)
    expect(compareVersions('unknown', 'unknown')).toBe(0)
  })
})

describe('planUpdate', () => {
  it('reports a newer local build and never installs', () => {
    const plan = planUpdate('3.6.0', '3.5.0', false)
    expect(plan.action).toBe('newer-than-latest')
    expect(plan.install).toBe(false)
    expect(plan.message).toBe('3.6.0 is newer than npm latest 3.5.0 — nothing to do')
  })

  it('offers an older local build and installs it when not checking', () => {
    const plan = planUpdate('3.4.0', '3.5.0', false)
    expect(plan.action).toBe('update')
    expect(plan.install).toBe(true)
    expect(plan.message).toBe('Update available: 3.4.0 → 3.5.0')
  })

  it('offers without installing when checking', () => {
    const plan = planUpdate('3.4.0', '3.5.0', true)
    expect(plan.action).toBe('update')
    expect(plan.install).toBe(false)
  })

  it('reports equal versions as up to date', () => {
    const plan = planUpdate('3.5.0', '3.5.0', false)
    expect(plan.action).toBe('up-to-date')
    expect(plan.install).toBe(false)
    expect(plan.message).toBe('Already up to date')
  })
})

describe('installCommand', () => {
  it('names the exact version instead of the moving latest tag', () => {
    expect(installCommand('3.5.0')).toBe('npm install -g @omniscio/plugin-cli@3.5.0')
  })
})

describe('runUpdate', () => {
  it('never installs when the local build is newer than npm latest', async () => {
    const printed = captureOutput()
    const { deps, install } = makeDeps('3.6.0', { status: 'found', version: '3.5.0' })

    const code = await runUpdate({}, deps)

    expect(code).toBe(0)
    expect(install).not.toHaveBeenCalled()
    expect(printed.join('\n')).toContain('3.6.0 is newer than npm latest 3.5.0')
  })

  it('never installs when the local build is newer and --check is passed', async () => {
    captureOutput()
    const { deps, install } = makeDeps('3.6.0', { status: 'found', version: '3.5.0' })

    await runUpdate({ check: true }, deps)

    expect(install).not.toHaveBeenCalled()
  })

  it('does not install on --check when the registry is ahead', async () => {
    const printed = captureOutput()
    const { deps, install } = makeDeps('3.4.0', { status: 'found', version: '3.5.0' })

    const code = await runUpdate({ check: true }, deps)

    expect(code).toBe(0)
    expect(install).not.toHaveBeenCalled()
    expect(printed.join('\n')).toContain('Update available: 3.4.0 → 3.5.0')
  })

  it('installs the exact version the check approved', async () => {
    const printed = captureOutput()
    const { deps, install } = makeDeps('3.4.0', { status: 'found', version: '3.5.0' })

    const code = await runUpdate({}, deps)

    expect(code).toBe(0)
    expect(install).toHaveBeenCalledTimes(1)
    expect(install).toHaveBeenCalledWith('3.5.0')
    expect(printed.join('\n')).toContain('Updated to 3.5.0')
  })

  it('does nothing when the versions match', async () => {
    const printed = captureOutput()
    const { deps, install } = makeDeps('3.5.0', { status: 'found', version: '3.5.0' })

    const code = await runUpdate({}, deps)

    expect(code).toBe(0)
    expect(install).not.toHaveBeenCalled()
    expect(printed.join('\n')).toContain('Already up to date')
  })

  it('reports a package that is not on npm without installing', async () => {
    const printed = captureOutput()
    const { deps, install } = makeDeps('3.5.0', { status: 'absent' })

    const code = await runUpdate({}, deps)

    expect(code).toBe(0)
    expect(install).not.toHaveBeenCalled()
    expect(printed.join('\n')).toContain('Package not found on npm')
  })

  it('refuses an unusable registry version without installing', async () => {
    const printed = captureOutput()
    const { deps, install } = makeDeps('3.4.0', { status: 'unusable', version: 'banana' })

    const code = await runUpdate({}, deps)

    expect(code).toBe(0)
    expect(install).not.toHaveBeenCalled()
    expect(printed.join('\n')).toContain('unusable version: banana')
  })

  it('reports an unreachable registry without installing', async () => {
    const printed = captureOutput()
    const { deps, install } = makeDeps('3.4.0', { status: 'unreachable' })

    const code = await runUpdate({}, deps)

    expect(code).toBe(0)
    expect(install).not.toHaveBeenCalled()
    expect(printed.join('\n')).toContain('Could not reach npm registry')
  })

  it('returns a failure code when the install itself fails', async () => {
    captureOutput()
    const deps: UpdateDeps = {
      currentVersion: '3.4.0',
      lookupLatest: async () => ({ status: 'found', version: '3.5.0' }),
      install: () => {
        throw new Error('EACCES')
      }
    }

    expect(await runUpdate({}, deps)).toBe(1)
  })
})
