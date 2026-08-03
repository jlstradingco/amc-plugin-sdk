import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'
import { runInit } from '../commands/init.js'
import { runAllChecks } from '../checks/index.js'

let dir: string
beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'amc-init-'))
})
afterEach(() => {
  fs.rmSync(dir, { recursive: true, force: true })
})

describe('runInit', () => {
  it('writes a recipe file named from the slug', () => {
    const { recipePath } = runInit({ name: 'Daily Digest', cwd: dir })
    expect(path.basename(recipePath)).toBe('daily-digest.recipe.json')
    expect(fs.existsSync(recipePath)).toBe(true)
  })

  it('writes a README next to it', () => {
    const { readmePath } = runInit({ name: 'Daily Digest', cwd: dir })
    expect(fs.existsSync(readmePath)).toBe(true)
    expect(fs.readFileSync(readmePath, 'utf-8')).toContain('daily-digest.recipe.json')
  })

  it('the scaffolded file validates clean — the init -> validate guarantee', () => {
    const { recipePath } = runInit({ name: 'Daily Digest', cwd: dir })
    const parsed = JSON.parse(fs.readFileSync(recipePath, 'utf-8'))
    expect(runAllChecks(parsed)).toEqual([])
  })

  it('refuses to overwrite without --force', () => {
    runInit({ name: 'Daily Digest', cwd: dir })
    expect(() => runInit({ name: 'Daily Digest', cwd: dir })).toThrow(/already exists/i)
  })

  it('overwrites with force', () => {
    runInit({ name: 'Daily Digest', cwd: dir })
    expect(() => runInit({ name: 'Daily Digest', cwd: dir, force: true })).not.toThrow()
  })

  it('leaves an existing README alone without --force', () => {
    const readme = path.join(dir, 'README.md')
    fs.writeFileSync(readme, 'mine', 'utf-8')
    runInit({ name: 'Daily Digest', cwd: dir })
    expect(fs.readFileSync(readme, 'utf-8')).toBe('mine')
  })

  it('rejects an unknown category naming the valid ones', () => {
    expect(() => runInit({ name: 'X', cwd: dir, category: 'nope' as never })).toThrow(
      /productivity/
    )
  })

  it('accepts every valid category', () => {
    for (const c of ['planning', 'development', 'testing', 'devops', 'productivity', 'other']) {
      expect(() =>
        runInit({ name: `X ${c}`, cwd: dir, category: c as never })
      ).not.toThrow()
    }
  })

  it('uses the supplied description', () => {
    const { recipePath } = runInit({ name: 'X', cwd: dir, description: 'my description' })
    const parsed = JSON.parse(fs.readFileSync(recipePath, 'utf-8'))
    expect(parsed.description).toBe('my description')
  })

  it('writes formatted JSON a human can edit', () => {
    const { recipePath } = runInit({ name: 'Daily Digest', cwd: dir })
    const raw = fs.readFileSync(recipePath, 'utf-8')
    expect(raw).toContain('\n  "name"')
    expect(raw.endsWith('\n')).toBe(true)
  })
})
