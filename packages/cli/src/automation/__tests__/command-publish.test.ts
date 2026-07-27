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

describe('runPublish', () => {
  it('uploads a clean automation and returns the submission id', async () => {
    write(good)
    const fetchMock = okUpload()
    vi.stubGlobal('fetch', fetchMock)

    const res = await runPublish({ cwd: dir, token, yes: true, changelog: 'first' })
    expect(res.exitCode).toBe(0)
    expect(res.submissionId).toBe('s1')
    expect(String(fetchMock.mock.calls[0]![0])).toContain('/uploadAutomation')
  })

  it('refuses to upload when a local check errors', async () => {
    write({ ...good, steps: [{ name: 'a', prompt: '' }] })
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)

    const res = await runPublish({ cwd: dir, token, yes: true })
    expect(res.exitCode).toBe(1)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('uploads despite warnings — advisory findings never block', async () => {
    write({ ...good, description: 'ghp_AAAAAAAAAAAAAAAAAAAAAAAA' })
    const fetchMock = okUpload()
    vi.stubGlobal('fetch', fetchMock)

    expect((await runPublish({ cwd: dir, token, yes: true })).exitCode).toBe(0)
    expect(fetchMock).toHaveBeenCalled()
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
    const body = JSON.parse(fetchMock.mock.calls[0]![1].body as string)
    expect(body.automationId).toBe('my-cool-thing')
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
    const body = JSON.parse(fetchMock.mock.calls[0]![1].body as string)
    expect(body.version).toBe('2.1.0')
    expect(body.category).toBe('devops')
    expect(body.changelog).toBe('what changed')
  })
})
