import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'
import { runPublish } from '../commands/publish.js'
import type { StoredToken } from '../../lib/auth.js'

let dir: string
const token = {
  token: 't',
  refreshToken: 'r',
  uid: 'u',
  github: 'octocat',
  expiresAt: ''
} as StoredToken

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'amc-pub-'))
})
afterEach(() => {
  fs.rmSync(dir, { recursive: true, force: true })
  vi.restoreAllMocks()
})

const write = (body: unknown): void =>
  fs.writeFileSync(path.join(dir, 'x.recipe.json'), JSON.stringify(body), 'utf-8')

const good = {
  name: 'Good',
  executionMode: 'multi-session',
  steps: [{ name: 'a', prompt: 'do the thing' }]
}

const okUpload = (): ReturnType<typeof vi.fn> =>
  vi.fn().mockResolvedValue({
    ok: true,
    json: async () => ({ submissionId: 's1', status: 'pending' })
  })

/**
 * The upload fetch, located by URL rather than by call index. Publish now issues a
 * best-effort `getMyAutomations` preflight (version planning, F025) BEFORE the
 * upload, so the upload is no longer `calls[0]`.
 */
const uploadCall = (m: ReturnType<typeof vi.fn>): unknown[] =>
  m.mock.calls.find((c) => String(c[0]).includes('/uploadAutomation'))!

/** A fetch mock that answers the version-planning preflight with `submissions`. */
const withSubmissions = (submissions: unknown[]): ReturnType<typeof vi.fn> =>
  vi.fn().mockImplementation((url: string) => {
    if (String(url).includes('/getMyAutomations')) {
      return Promise.resolve({ ok: true, json: async () => ({ submissions }) })
    }
    return Promise.resolve({ ok: true, json: async () => ({ submissionId: 's1', status: 'pending' }) })
  })

describe('runPublish', () => {
  it('uploads a clean automation and returns the submission id', async () => {
    write(good)
    const fetchMock = okUpload()
    vi.stubGlobal('fetch', fetchMock)

    const res = await runPublish({ cwd: dir, token, yes: true, changelog: 'first' })
    expect(res.exitCode).toBe(0)
    expect(res.submissionId).toBe('s1')
    expect(String(uploadCall(fetchMock)[0])).toContain('/uploadAutomation')
  })

  it('refuses to upload when a local check errors', async () => {
    write({ ...good, steps: [{ name: 'a', prompt: '' }] })
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)

    const res = await runPublish({ cwd: dir, token, yes: true })
    expect(res.exitCode).toBe(1)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('uploads despite non-secret warnings — advisory findings never block', async () => {
    // `requiresApps: ['jira']` with no step that calls a jira route is an
    // unused-required-app WARNING — advisory, not a secret, so it never blocks.
    write({ ...good, requiresApps: ['jira'] })
    const fetchMock = okUpload()
    vi.stubGlobal('fetch', fetchMock)

    expect((await runPublish({ cwd: dir, token, yes: true })).exitCode).toBe(0)
    expect(fetchMock).toHaveBeenCalled()
  })

  // The secret gate (F024). A possible secret is emitted as a WARNING so a false
  // positive never trips the ordinary error gate — but a published automation is
  // world-readable, so publishing a suspected credential must be a deliberate act.
  describe('secret gate', () => {
    it('aborts by default when a field looks like a secret', async () => {
      write({ ...good, description: 'ghp_AAAAAAAAAAAAAAAAAAAAAAAA' })
      const fetchMock = okUpload()
      vi.stubGlobal('fetch', fetchMock)

      const res = await runPublish({ cwd: dir, token, yes: true })
      expect(res.exitCode).toBe(1)
      expect(fetchMock).not.toHaveBeenCalled()
    })

    it('publishes a secret-flagged automation with --allow-secret', async () => {
      write({ ...good, description: 'ghp_AAAAAAAAAAAAAAAAAAAAAAAA' })
      const fetchMock = okUpload()
      vi.stubGlobal('fetch', fetchMock)

      const res = await runPublish({ cwd: dir, token, yes: true, allowSecret: true })
      expect(res.exitCode).toBe(0)
      expect(fetchMock).toHaveBeenCalled()
    })

    it('still gates a secret when --skip-validation waived the other checks', async () => {
      // --skip-validation waives advice about the recipe file, never the decision to
      // publish a credential to the world.
      write({ ...good, description: 'ghp_AAAAAAAAAAAAAAAAAAAAAAAA' })
      const fetchMock = okUpload()
      vi.stubGlobal('fetch', fetchMock)

      const res = await runPublish({ cwd: dir, token, yes: true, skipValidation: true })
      expect(res.exitCode).toBe(1)
      expect(fetchMock).not.toHaveBeenCalled()
    })

    it('gates the secret before spending the upload, even on a dry run', async () => {
      write({ ...good, description: 'ghp_AAAAAAAAAAAAAAAAAAAAAAAA' })
      const fetchMock = vi.fn()
      vi.stubGlobal('fetch', fetchMock)

      const res = await runPublish({ cwd: dir, token, yes: true, dryRun: true })
      expect(res.exitCode).toBe(1)
      expect(fetchMock).not.toHaveBeenCalled()
    })

    // F065: --changelog is a CLI flag, never merged into the recipe, so it must be
    // scanned separately — it still publishes alongside the automation.
    it('gates a secret pasted into the --changelog text', async () => {
      write(good) // the recipe itself is clean
      const fetchMock = okUpload()
      vi.stubGlobal('fetch', fetchMock)

      const res = await runPublish({
        cwd: dir,
        token,
        yes: true,
        changelog: 'Rotated ghp_AAAAAAAAAAAAAAAAAAAAAAAA into the config'
      })
      expect(res.exitCode).toBe(1)
      expect(fetchMock).not.toHaveBeenCalled()
    })

    it('publishes a secret-bearing changelog with --allow-secret', async () => {
      write(good)
      const fetchMock = okUpload()
      vi.stubGlobal('fetch', fetchMock)

      const res = await runPublish({
        cwd: dir,
        token,
        yes: true,
        allowSecret: true,
        changelog: 'Rotated ghp_AAAAAAAAAAAAAAAAAAAAAAAA into the config'
      })
      expect(res.exitCode).toBe(0)
      expect(uploadCall(fetchMock)).toBeDefined()
    })
  })

  it('uploads anyway with --skip-validation', async () => {
    write({ ...good, steps: [{ name: 'a', prompt: '' }] })
    const fetchMock = okUpload()
    vi.stubGlobal('fetch', fetchMock)

    const res = await runPublish({ cwd: dir, token, yes: true, skipValidation: true })
    expect(res.exitCode).toBe(0)
    expect(fetchMock).toHaveBeenCalled()
  })

  it('--dry-run does everything except the upload', async () => {
    write(good)
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)

    const res = await runPublish({ cwd: dir, token, yes: true, dryRun: true })
    expect(res.exitCode).toBe(0)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('aborts when --as does not match the signed-in account', async () => {
    write(good)
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)

    const res = await runPublish({ cwd: dir, token, yes: true, as: 'someone-else' })
    expect(res.exitCode).toBe(1)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('proceeds when --as matches', async () => {
    write(good)
    vi.stubGlobal('fetch', okUpload())
    expect((await runPublish({ cwd: dir, token, yes: true, as: 'octocat' })).exitCode).toBe(0)
  })

  it('surfaces a server rejection without throwing', async () => {
    write(good)
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: false,
        status: 400,
        json: async () => ({ error: true, code: 'VALIDATION_FAILED', message: 'bad envelope' })
      })
    )
    expect((await runPublish({ cwd: dir, token, yes: true })).exitCode).toBe(1)
  })

  it('reports a network failure without throwing', async () => {
    write(good)
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('ENOTFOUND')))
    expect((await runPublish({ cwd: dir, token, yes: true })).exitCode).toBe(1)
  })

  it('exits 1 when there is no recipe to publish', async () => {
    expect((await runPublish({ cwd: dir, token, yes: true })).exitCode).toBe(1)
  })

  it('derives the automation id from the recipe name', async () => {
    write({ ...good, name: 'My Cool Thing' })
    const fetchMock = okUpload()
    vi.stubGlobal('fetch', fetchMock)

    await runPublish({ cwd: dir, token, yes: true })
    const body = JSON.parse((uploadCall(fetchMock)[1] as { body: string }).body)
    expect(body.automationId).toBe('my-cool-thing')
  })

  // The silent-account trap. `--yes` was declared and documented as skipping this
  // confirmation for over a release without any confirmation existing, so every publish
  // went out unconfirmed under whatever account the browser was signed into — and a
  // published automation carries that name permanently.
  describe('identity confirmation', () => {
    it('asks before publishing when --yes was not passed', async () => {
      write(good)
      const fetchMock = okUpload()
      vi.stubGlobal('fetch', fetchMock)
      const confirmIdentity = vi.fn().mockResolvedValue(true)

      const res = await runPublish({ cwd: dir, token, confirmIdentity })

      expect(confirmIdentity).toHaveBeenCalledWith('octocat')
      expect(res.exitCode).toBe(0)
    })

    it('uploads nothing when the author declines', async () => {
      write(good)
      const fetchMock = okUpload()
      vi.stubGlobal('fetch', fetchMock)

      const res = await runPublish({
        cwd: dir,
        token,
        confirmIdentity: vi.fn().mockResolvedValue(false)
      })

      expect(res.exitCode).toBe(1)
      expect(fetchMock).not.toHaveBeenCalled()
      expect(res.submissionId).toBeUndefined()
    })

    it('skips the prompt entirely under --yes, for CI', async () => {
      write(good)
      vi.stubGlobal('fetch', okUpload())
      const confirmIdentity = vi.fn().mockResolvedValue(true)

      await runPublish({ cwd: dir, token, yes: true, confirmIdentity })

      expect(confirmIdentity).not.toHaveBeenCalled()
    })

    it('confirms before a dry run too, so --dry-run rehearses the real flow', async () => {
      write(good)
      const fetchMock = vi.fn()
      vi.stubGlobal('fetch', fetchMock)
      const confirmIdentity = vi.fn().mockResolvedValue(true)

      const res = await runPublish({ cwd: dir, token, dryRun: true, confirmIdentity })

      expect(confirmIdentity).toHaveBeenCalled()
      expect(res.exitCode).toBe(0)
      expect(fetchMock).not.toHaveBeenCalled()
    })

    it('never asks when --as already aborted the publish', async () => {
      // The abort is the stronger answer: there is nothing to confirm.
      write(good)
      vi.stubGlobal('fetch', vi.fn())
      const confirmIdentity = vi.fn().mockResolvedValue(true)

      const res = await runPublish({ cwd: dir, token, as: 'someone-else', confirmIdentity })

      expect(res.exitCode).toBe(1)
      expect(confirmIdentity).not.toHaveBeenCalled()
    })

    it('still asks when --as matches, since matching is not consenting', async () => {
      write(good)
      vi.stubGlobal('fetch', okUpload())
      const confirmIdentity = vi.fn().mockResolvedValue(true)

      await runPublish({ cwd: dir, token, as: 'octocat', confirmIdentity })

      expect(confirmIdentity).toHaveBeenCalledWith('octocat')
    })

    it('asks before local validation has been skipped away', async () => {
      // --skip-validation bypasses the recipe checks, never the identity gate.
      write({ ...good, steps: [{ name: 'a', prompt: '' }] })
      vi.stubGlobal('fetch', okUpload())
      const confirmIdentity = vi.fn().mockResolvedValue(false)

      const res = await runPublish({ cwd: dir, token, skipValidation: true, confirmIdentity })

      expect(confirmIdentity).toHaveBeenCalled()
      expect(res.exitCode).toBe(1)
    })
  })

  it('sends the declared version, category and changelog', async () => {
    write(good)
    const fetchMock = okUpload()
    vi.stubGlobal('fetch', fetchMock)

    await runPublish({
      cwd: dir,
      token,
      yes: true,
      version: '2.1.0',
      category: 'devops',
      changelog: 'what changed'
    })
    const body = JSON.parse((uploadCall(fetchMock)[1] as { body: string }).body)
    expect(body.version).toBe('2.1.0')
    expect(body.category).toBe('devops')
    expect(body.changelog).toBe('what changed')
  })

  // Version planning (F025). Publishing a second time without --version used to
  // re-send the constant 1.0.0 and 409 on a version the marketplace had already
  // taken. The command now consults the author's own submissions first.
  describe('version planning', () => {
    it('defaults to the next patch above the latest submitted version', async () => {
      write({ ...good, name: 'My Thing' })
      const fetchMock = withSubmissions([{ id: 'x', automationId: 'my-thing', version: '1.4.2' }])
      vi.stubGlobal('fetch', fetchMock)

      const res = await runPublish({ cwd: dir, token, yes: true })
      expect(res.exitCode).toBe(0)
      const body = JSON.parse((uploadCall(fetchMock)[1] as { body: string }).body)
      expect(body.version).toBe('1.4.3')
    })

    it('keeps the constant default on a first release', async () => {
      write({ ...good, name: 'Brand New' })
      const fetchMock = withSubmissions([])
      vi.stubGlobal('fetch', fetchMock)

      await runPublish({ cwd: dir, token, yes: true })
      const body = JSON.parse((uploadCall(fetchMock)[1] as { body: string }).body)
      expect(body.version).toBe('1.0.0')
    })

    it('refuses a provided version that is already published, before the upload', async () => {
      write({ ...good, name: 'My Thing' })
      const fetchMock = withSubmissions([{ id: 'x', automationId: 'my-thing', version: '1.0.0' }])
      vi.stubGlobal('fetch', fetchMock)

      const res = await runPublish({ cwd: dir, token, yes: true, version: '1.0.0' })
      expect(res.exitCode).toBe(1)
      expect(uploadCall(fetchMock)).toBeUndefined()
    })

    it('publishes anyway when the registry is unreachable — server stays authority', async () => {
      write({ ...good, name: 'My Thing' })
      const fetchMock = vi.fn().mockImplementation((url: string) => {
        if (String(url).includes('/getMyAutomations')) {
          return Promise.reject(new Error('ENOTFOUND'))
        }
        return Promise.resolve({
          ok: true,
          json: async () => ({ submissionId: 's1', status: 'pending' })
        })
      })
      vi.stubGlobal('fetch', fetchMock)

      const res = await runPublish({ cwd: dir, token, yes: true })
      expect(res.exitCode).toBe(0)
      const body = JSON.parse((uploadCall(fetchMock)[1] as { body: string }).body)
      expect(body.version).toBe('1.0.0')
    })

    it('adds an actionable hint when the server 409s on a version collision', async () => {
      write({ ...good, name: 'My Thing' })
      const info = vi.spyOn(console, 'log').mockImplementation(() => {})
      const fetchMock = vi.fn().mockImplementation((url: string) => {
        if (String(url).includes('/getMyAutomations')) {
          // Registry looked empty at plan time; a concurrent publish took the slot.
          return Promise.resolve({ ok: true, json: async () => ({ submissions: [] }) })
        }
        return Promise.resolve({
          ok: false,
          status: 409,
          json: async () => ({ error: true, code: 'VERSION_EXISTS', message: 'version already exists' })
        })
      })
      vi.stubGlobal('fetch', fetchMock)

      const res = await runPublish({ cwd: dir, token, yes: true })
      expect(res.exitCode).toBe(1)
      const printed = info.mock.calls.map((c) => String(c[0])).join('\n')
      expect(printed).toContain('--version 1.0.1')
    })
  })

  // The marketplace refuses a non-semver version and an unknown category with a bare
  // 400, and a refused upload still costs one of the five attempts an account gets per
  // hour. Both are retyped on every publish, so they are where a typo lands.
  describe('flag validation', () => {
    it('refuses a non-semver version without uploading', async () => {
      write(good)
      const fetchMock = okUpload()
      vi.stubGlobal('fetch', fetchMock)
      const res = await runPublish({ cwd: dir, token, yes: true, version: 'v1.0.0' })
      expect(res.exitCode).toBe(1)
      expect(fetchMock).not.toHaveBeenCalled()
    })

    it('refuses a two-part version', async () => {
      write(good)
      const fetchMock = okUpload()
      vi.stubGlobal('fetch', fetchMock)
      expect((await runPublish({ cwd: dir, token, yes: true, version: '1.0' })).exitCode).toBe(1)
      expect(fetchMock).not.toHaveBeenCalled()
    })

    it('refuses an unknown category without uploading', async () => {
      write(good)
      const fetchMock = okUpload()
      vi.stubGlobal('fetch', fetchMock)
      const res = await runPublish({
        cwd: dir,
        token,
        yes: true,
        category: 'malware' as never
      })
      expect(res.exitCode).toBe(1)
      expect(fetchMock).not.toHaveBeenCalled()
    })

    it('checks the flags before it reads the recipe file', async () => {
      // No recipe here at all. The flag problem is the one reported, because a typo is
      // the cheapest possible failure and should not wait on disk access.
      const fetchMock = okUpload()
      vi.stubGlobal('fetch', fetchMock)
      const res = await runPublish({ cwd: dir, token, yes: true, version: 'nope' })
      expect(res.exitCode).toBe(1)
      expect(fetchMock).not.toHaveBeenCalled()
    })

    it('is not bypassed by --skip-validation', async () => {
      // --skip-validation waives the RECIPE checks, which are advice about your file.
      // A malformed version is not advice — the server cannot accept it either way.
      write(good)
      const fetchMock = okUpload()
      vi.stubGlobal('fetch', fetchMock)
      const res = await runPublish({
        cwd: dir,
        token,
        yes: true,
        version: 'v9',
        skipValidation: true
      })
      expect(res.exitCode).toBe(1)
      expect(fetchMock).not.toHaveBeenCalled()
    })

    it('is not bypassed by --dry-run', async () => {
      write(good)
      const res = await runPublish({
        cwd: dir,
        token,
        yes: true,
        version: 'v9',
        dryRun: true
      })
      expect(res.exitCode).toBe(1)
    })

    it('lets a well-formed version and category through', async () => {
      write(good)
      const fetchMock = okUpload()
      vi.stubGlobal('fetch', fetchMock)
      const res = await runPublish({
        cwd: dir,
        token,
        yes: true,
        version: '1.2.3',
        category: 'testing'
      })
      expect(res.exitCode).toBe(0)
      expect(uploadCall(fetchMock)).toBeDefined()
    })
  })
})
