import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import * as fs from 'node:fs'
import * as path from 'node:path'
import * as os from 'node:os'
import {
  isTypeScriptProject,
  collectFlatPackageEntries,
  collectPackageEntries,
  findRootReadme,
} from '../lib/project.js'

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

  it('appends README.md last, after the entry-point dirs', () => {
    fs.mkdirSync(path.join(tmp, 'ui'))
    fs.mkdirSync(path.join(tmp, 'backend'))
    fs.writeFileSync(path.join(tmp, 'README.md'), '# Hi')
    const manifest = {
      ui: { entryPoint: 'ui/index.html' },
      backend: { entryPoint: 'backend/index.js' },
    }
    expect(collectFlatPackageEntries(tmp, manifest)).toEqual(['ui', 'backend', 'README.md'])
  })
})

describe('collectPackageEntries', () => {
  it('is dist/ for a TypeScript plugin', () => {
    fs.writeFileSync(path.join(tmp, 'tsconfig.json'), '{}')
    fs.mkdirSync(path.join(tmp, 'dist'))
    const manifest = { ui: { entryPoint: 'dist/ui/index.html' } }
    expect(collectPackageEntries(tmp, manifest)).toEqual(['dist'])
  })

  it('includes assets/ alongside dist/ for a TypeScript plugin when present', () => {
    fs.writeFileSync(path.join(tmp, 'tsconfig.json'), '{}')
    fs.mkdirSync(path.join(tmp, 'dist'))
    fs.mkdirSync(path.join(tmp, 'assets'))
    const manifest = { ui: { entryPoint: 'dist/ui/index.html' } }
    expect(collectPackageEntries(tmp, manifest)).toEqual(['dist', 'assets'])
  })

  it('delegates to flat entries for a flat-JS plugin', () => {
    fs.mkdirSync(path.join(tmp, 'ui'))
    const manifest = { ui: { entryPoint: 'ui/index.html' } }
    expect(collectPackageEntries(tmp, manifest)).toEqual(['ui'])
  })

  it('appends README.md last for a TypeScript plugin', () => {
    fs.writeFileSync(path.join(tmp, 'tsconfig.json'), '{}')
    fs.mkdirSync(path.join(tmp, 'dist'))
    fs.writeFileSync(path.join(tmp, 'README.md'), '# Hi')
    const manifest = { ui: { entryPoint: 'dist/ui/index.html' } }
    expect(collectPackageEntries(tmp, manifest)).toEqual(['dist', 'README.md'])
  })

  it('appends README.md after assets/ for a TypeScript plugin', () => {
    fs.writeFileSync(path.join(tmp, 'tsconfig.json'), '{}')
    fs.mkdirSync(path.join(tmp, 'dist'))
    fs.mkdirSync(path.join(tmp, 'assets'))
    fs.writeFileSync(path.join(tmp, 'README.md'), '# Hi')
    const manifest = { ui: { entryPoint: 'dist/ui/index.html' } }
    expect(collectPackageEntries(tmp, manifest)).toEqual(['dist', 'assets', 'README.md'])
  })

  it('leaves entries unchanged when there is no README', () => {
    fs.writeFileSync(path.join(tmp, 'tsconfig.json'), '{}')
    fs.mkdirSync(path.join(tmp, 'dist'))
    const manifest = { ui: { entryPoint: 'dist/ui/index.html' } }
    expect(collectPackageEntries(tmp, manifest)).toEqual(['dist'])
  })
})

describe('findRootReadme', () => {
  it('finds README.md and returns its name', () => {
    fs.writeFileSync(path.join(tmp, 'README.md'), '# Hi')
    expect(findRootReadme(tmp)).toBe('README.md')
  })

  it('finds a lower-case readme.md and returns it under its real on-disk name', () => {
    fs.writeFileSync(path.join(tmp, 'readme.md'), '# Hi')
    expect(findRootReadme(tmp)).toBe('readme.md')
  })

  it('ignores a directory named README.md', () => {
    fs.mkdirSync(path.join(tmp, 'README.md'))
    expect(findRootReadme(tmp)).toBeNull()
  })

  it('returns null on an empty directory', () => {
    expect(findRootReadme(tmp)).toBeNull()
  })
})
