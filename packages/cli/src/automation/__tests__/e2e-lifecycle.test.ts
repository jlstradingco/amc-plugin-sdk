import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'
import { runInit } from '../commands/init.js'
import { runValidate } from '../commands/validate.js'
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
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'amc-e2e-'))
})
afterEach(() => {
  fs.rmSync(dir, { recursive: true, force: true })
  vi.restoreAllMocks()
})

describe('automation lifecycle E2E', () => {
  it('init -> validate -> publish --dry-run completes clean', async () => {
    const { recipePath } = runInit({ name: 'Daily Digest', cwd: dir })
    expect(fs.existsSync(recipePath)).toBe(true)

    const validated = await runValidate({ cwd: dir })
    expect(validated.exitCode).toBe(0)
    expect(validated.findings).toEqual([])

    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
    const published = await runPublish({ cwd: dir, token, yes: true, dryRun: true })
    expect(published.exitCode).toBe(0)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('a scaffolded automation actually uploads, with a well-formed envelope', async () => {
    runInit({ name: 'Daily Digest', cwd: dir })
    // A real publish lists the author's own submissions BEFORE uploading, to default
    // the version off the registry, so the upload is not the first fetch. Answer each
    // endpoint in its own shape — a blanket mock makes `getMyAutomations` parse an
    // upload receipt as a submissions list, which no server would ever return.
    const fetchMock = vi.fn().mockImplementation((url: string) =>
      Promise.resolve(
        String(url).endsWith('/getMyAutomations')
          ? { ok: true, json: async () => ({ submissions: [] }) }
          : { ok: true, json: async () => ({ submissionId: 'sub-1', status: 'pending' }) }
      )
    )
    vi.stubGlobal('fetch', fetchMock)

    const res = await runPublish({ cwd: dir, token, yes: true, changelog: 'first release' })
    expect(res.exitCode).toBe(0)
    expect(res.submissionId).toBe('sub-1')

    // Find the upload by endpoint rather than by call index, so another preceding
    // request does not silently retarget these assertions at the wrong body.
    const upload = fetchMock.mock.calls.find((c) => String(c[0]).endsWith('/uploadAutomation'))
    expect(upload).toBeDefined()
    const body = JSON.parse(upload![1].body as string)
    expect(body.automationId).toBe('daily-digest')
    expect(body.definition.schemaVersion).toBe(1)
    expect(body.definition.kind).toBe('recipe')
    // scope is local-only and must never travel.
    expect(body.definition.scope).toBeUndefined()
    expect(body.definition.steps).toHaveLength(2)
  })

  it('editing in a portability blocker stops the publish', async () => {
    const { recipePath } = runInit({ name: 'Daily Digest', cwd: dir })
    const recipe = JSON.parse(fs.readFileSync(recipePath, 'utf-8'))
    recipe.steps[0].script = './local.sh'
    fs.writeFileSync(recipePath, JSON.stringify(recipe), 'utf-8')

    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
    const res = await runPublish({ cwd: dir, token, yes: true })
    expect(res.exitCode).toBe(1)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('emptying a prompt stops the publish', async () => {
    const { recipePath } = runInit({ name: 'Daily Digest', cwd: dir })
    const recipe = JSON.parse(fs.readFileSync(recipePath, 'utf-8'))
    recipe.steps[1].prompt = '   '
    fs.writeFileSync(recipePath, JSON.stringify(recipe), 'utf-8')

    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
    expect((await runPublish({ cwd: dir, token, yes: true })).exitCode).toBe(1)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('a pasted secret warns but still publishes', async () => {
    const { recipePath } = runInit({ name: 'Daily Digest', cwd: dir })
    const recipe = JSON.parse(fs.readFileSync(recipePath, 'utf-8'))
    recipe.steps[0].prompt = `${recipe.steps[0].prompt} ghp_AAAAAAAAAAAAAAAAAAAAAAAA`
    fs.writeFileSync(recipePath, JSON.stringify(recipe), 'utf-8')

    const validated = await runValidate({ cwd: dir })
    expect(validated.exitCode).toBe(0)
    expect(validated.findings.some((f) => f.code === 'possible-secret')).toBe(true)
  })
})
