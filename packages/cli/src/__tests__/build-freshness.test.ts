import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'
import { packagingProblems, staleBuild, versionMismatch } from '../lib/build-freshness.js'

let dir: string

function write(rel: string, content = 'const value = 1\n'): void {
  const file = path.join(dir, rel)
  fs.mkdirSync(path.dirname(file), { recursive: true })
  fs.writeFileSync(file, content)
}

function setMtime(rel: string, secondsFromBase: number): void {
  const at = new Date(Date.UTC(2026, 0, 1, 0, 0, secondsFromBase))
  fs.utimesSync(path.join(dir, rel), at, at)
}

function writeManifestVersion(version: string): void {
  write('manifest.json', JSON.stringify({ plugin: { id: 'demo', version } }, null, 2))
}

function writePackageVersion(version: string): void {
  write('package.json', JSON.stringify({ name: 'demo', version }, null, 2))
}

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'amc-freshness-'))
})

afterEach(() => {
  fs.rmSync(dir, { recursive: true, force: true })
})

describe('staleBuild', () => {
  it('refuses when a source file changed after the newest build output', () => {
    write('src/backend/index.ts')
    write('dist/backend/index.js')
    setMtime('dist/backend/index.js', 10)
    setMtime('src/backend/index.ts', 20)

    const problem = staleBuild(dir)

    expect(problem?.message).toContain('dist/ is older than src/backend/index.ts')
    expect(problem?.suggestion).toContain('omniscio-plugin build')
  })

  it('accepts a build whose output is newer than every source file', () => {
    write('src/backend/index.ts')
    write('dist/backend/index.js')
    setMtime('src/backend/index.ts', 10)
    setMtime('dist/backend/index.js', 20)

    expect(staleBuild(dir)).toBeNull()
  })

  it('accepts a build written in the same instant as its source file', () => {
    write('src/ui/plugin.ts')
    write('dist/ui/plugin.js')
    setMtime('src/ui/plugin.ts', 10)
    setMtime('dist/ui/plugin.js', 10)

    expect(staleBuild(dir)).toBeNull()
  })

  it('refuses an empty dist/ beside real sources', () => {
    write('src/backend/index.ts')
    fs.mkdirSync(path.join(dir, 'dist'), { recursive: true })

    const problem = staleBuild(dir)

    expect(problem?.message).toContain('dist/ is empty')
    expect(problem?.suggestion).toContain('omniscio-plugin build')
  })

  it('does not object when dist/ is absent, because package builds it', () => {
    write('src/backend/index.ts')

    expect(staleBuild(dir)).toBeNull()
  })

  it('does not object for a flat plugin with no src/', () => {
    write('ui/plugin.js')

    expect(staleBuild(dir)).toBeNull()
  })
})

describe('versionMismatch', () => {
  it('refuses when manifest.json was bumped but package.json was not', () => {
    writeManifestVersion('1.0.1')
    writePackageVersion('1.0.0')

    const problem = versionMismatch(dir, '1.0.1')

    expect(problem?.message).toContain('package.json is version 1.0.0 but manifest.json declares 1.0.1')
    expect(problem?.suggestion).toContain('same version')
  })

  it('accepts matching versions', () => {
    writeManifestVersion('1.0.1')
    writePackageVersion('1.0.1')

    expect(versionMismatch(dir, '1.0.1')).toBeNull()
  })

  it('does not object when there is no package.json', () => {
    writeManifestVersion('1.0.0')

    expect(versionMismatch(dir, '1.0.0')).toBeNull()
  })

  it('does not object when package.json has no version', () => {
    write('package.json', JSON.stringify({ name: 'demo' }))

    expect(versionMismatch(dir, '1.0.0')).toBeNull()
  })
})

describe('packagingProblems', () => {
  it('reports nothing for a freshly built, version-matched plugin', () => {
    writeManifestVersion('1.0.0')
    writePackageVersion('1.0.0')
    write('src/backend/index.ts')
    write('dist/backend/index.js')
    setMtime('src/backend/index.ts', 10)
    setMtime('dist/backend/index.js', 20)

    expect(packagingProblems(dir, '1.0.0')).toEqual([])
  })

  it('reports both problems when the version was bumped and the build was never rerun', () => {
    writeManifestVersion('1.0.1')
    writePackageVersion('1.0.0')
    write('src/backend/index.ts')
    write('dist/backend/index.js')
    setMtime('dist/backend/index.js', 10)
    setMtime('src/backend/index.ts', 20)

    const messages = packagingProblems(dir, '1.0.1').map((problem) => problem.message)

    expect(messages).toHaveLength(2)
    expect(messages[0]).toContain('package.json is version 1.0.0 but manifest.json declares 1.0.1')
    expect(messages[1]).toContain('dist/ is older than src/backend/index.ts')
  })
})
