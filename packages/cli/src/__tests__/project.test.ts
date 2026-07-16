import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import * as fs from 'node:fs'
import * as path from 'node:path'
import * as os from 'node:os'
import { isTypeScriptProject, collectFlatPackageEntries } from '../lib/project.js'

let tmp: string

beforeEach(() => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'amc-project-'))
})

afterEach(() => {
  fs.rmSync(tmp, { recursive: true, force: true })
})

describe('isTypeScriptProject', () => {
  it('is true when tsconfig.json is present', () => {
    fs.writeFileSync(path.join(tmp, 'tsconfig.json'), '{}')
    expect(isTypeScriptProject(tmp)).toBe(true)
  })

  it('is false when there is no tsconfig.json (flat-JS plugin)', () => {
    fs.writeFileSync(path.join(tmp, 'manifest.json'), '{}')
    fs.mkdirSync(path.join(tmp, 'ui'))
    expect(isTypeScriptProject(tmp)).toBe(false)
  })
})

describe('collectFlatPackageEntries', () => {
  it('includes the top-level dir of the UI entry point', () => {
    fs.mkdirSync(path.join(tmp, 'ui'))
    const manifest = { ui: { entryPoint: 'ui/index.html' } }
    expect(collectFlatPackageEntries(tmp, manifest)).toEqual(['ui'])
  })

  it('includes backend, assets and prompts dirs when present', () => {
    fs.mkdirSync(path.join(tmp, 'ui'))
    fs.mkdirSync(path.join(tmp, 'backend'))
    fs.mkdirSync(path.join(tmp, 'assets'))
    fs.mkdirSync(path.join(tmp, 'prompts'))
    const manifest = {
      ui: { entryPoint: 'ui/index.html' },
      backend: { entryPoint: 'backend/index.js' },
    }
    const entries = collectFlatPackageEntries(tmp, manifest)
    expect(new Set(entries)).toEqual(new Set(['ui', 'backend', 'assets', 'prompts']))
  })

  it('omits conventional dirs that do not exist on disk', () => {
    fs.mkdirSync(path.join(tmp, 'ui'))
    const manifest = { ui: { entryPoint: 'ui/index.html' } }
    const entries = collectFlatPackageEntries(tmp, manifest)
    expect(entries).not.toContain('assets')
    expect(entries).not.toContain('prompts')
  })

  it('never includes manifest.json (added separately by the packager)', () => {
    fs.mkdirSync(path.join(tmp, 'ui'))
    fs.writeFileSync(path.join(tmp, 'manifest.json'), '{}')
    const manifest = { ui: { entryPoint: 'manifest.json' } }
    expect(collectFlatPackageEntries(tmp, manifest)).not.toContain('manifest.json')
  })

  it('supports a top-level file entry point (no folder)', () => {
    fs.writeFileSync(path.join(tmp, 'index.html'), '<html></html>')
    const manifest = { ui: { entryPoint: 'index.html' } }
    expect(collectFlatPackageEntries(tmp, manifest)).toEqual(['index.html'])
  })
})
