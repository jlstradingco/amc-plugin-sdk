import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import * as fs from 'node:fs'
import * as path from 'node:path'
import * as os from 'node:os'
import {
  isTypeScriptProject,
  collectFlatPackageEntries,
  collectPackageEntries,
  findRootReadme,
  resolveBannedScanDirs,
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

  it('appends README.md last for a flat plugin, after its entry-point dirs', () => {
    fs.mkdirSync(path.join(tmp, 'ui'))
    fs.mkdirSync(path.join(tmp, 'backend'))
    fs.writeFileSync(path.join(tmp, 'README.md'), '# Hi')
    const manifest = {
      ui: { entryPoint: 'ui/index.html' },
      backend: { entryPoint: 'backend/index.js' },
    }
    expect(collectPackageEntries(tmp, manifest)).toEqual(['ui', 'backend', 'README.md'])
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

// One resolver, three callers. `build`, `validate` and `preflight` must all decide
// WHERE to look the same way — the drift between two hand-rolled copies is exactly
// what let a child_process plugin through the scan in the first place.
describe('resolveBannedScanDirs', () => {
  it('resolves a TypeScript project to its dist/ directory', () => {
    fs.writeFileSync(path.join(tmp, 'tsconfig.json'), '{}')
    fs.mkdirSync(path.join(tmp, 'dist'))
    expect(resolveBannedScanDirs(tmp, {})).toEqual([path.join(tmp, 'dist')])
  })

  it('resolves a TypeScript project with no dist/ to nothing, rather than a phantom path', () => {
    fs.writeFileSync(path.join(tmp, 'tsconfig.json'), '{}')
    expect(resolveBannedScanDirs(tmp, {})).toEqual([])
  })

  it('resolves a flat plugin to its as-authored entry dirs, not dist/', () => {
    fs.writeFileSync(path.join(tmp, 'manifest.json'), '{}')
    fs.mkdirSync(path.join(tmp, 'ui'))
    const dirs = resolveBannedScanDirs(tmp, { ui: { entryPoint: 'ui/index.html' } })
    expect(dirs).toEqual([path.join(tmp, 'ui')])
  })

  // The README ships in the package, but it is not code: listed here it would count
  // as something scanned and turn preflight's nothing-to-scan warning into a pass.
  it('leaves the packaged README out of a flat plugin\'s scan dirs', () => {
    fs.writeFileSync(path.join(tmp, 'manifest.json'), '{}')
    fs.writeFileSync(path.join(tmp, 'README.md'), '# Hi')
    fs.mkdirSync(path.join(tmp, 'ui'))
    const dirs = resolveBannedScanDirs(tmp, { ui: { entryPoint: 'ui/index.html' } })
    expect(dirs).toEqual([path.join(tmp, 'ui')])
  })

  it('keeps a single-file code entry of a flat plugin, since the scanner reads files directly', () => {
    fs.writeFileSync(path.join(tmp, 'manifest.json'), '{}')
    fs.writeFileSync(path.join(tmp, 'server.js'), 'export {}')
    const dirs = resolveBannedScanDirs(tmp, { backend: { entryPoint: 'server.js' } })
    expect(dirs).toEqual([path.join(tmp, 'server.js')])
  })

  it('drops a non-code root file of a flat plugin, which has nothing to scan', () => {
    fs.writeFileSync(path.join(tmp, 'manifest.json'), '{}')
    fs.writeFileSync(path.join(tmp, 'index.html'), '<html></html>')
    expect(resolveBannedScanDirs(tmp, { ui: { entryPoint: 'index.html' } })).toEqual([])
  })

  it('returns absolute paths so a caller never has to re-join them', () => {
    fs.writeFileSync(path.join(tmp, 'tsconfig.json'), '{}')
    fs.mkdirSync(path.join(tmp, 'dist'))
    for (const d of resolveBannedScanDirs(tmp, {})) expect(path.isAbsolute(d)).toBe(true)
  })
})
