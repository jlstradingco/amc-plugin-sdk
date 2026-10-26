import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'
import {
  listPackageCandidates,
  readPackagedVersion,
  readPluginIdentity,
  selectPackage
} from '../lib/package-selection.js'
import { locatePackage } from '../commands/preflight.js'

const IDENTITY = { id: 'decks', version: '1.3.2' }

async function writePackage(file: string, manifestVersion: string, id = 'decks'): Promise<string> {
  const archiverMod = (await import('archiver')) as unknown as {
    ZipArchive: new (opts: { zlib: { level: number } }) => import('archiver').Archiver
  }
  fs.mkdirSync(path.dirname(file), { recursive: true })
  const archive = new archiverMod.ZipArchive({ zlib: { level: 9 } })
  const output = fs.createWriteStream(file)
  await new Promise<void>((resolve, reject) => {
    output.on('close', resolve)
    archive.on('error', reject)
    archive.pipe(output)
    archive.append(JSON.stringify({ plugin: { id, version: manifestVersion } }), { name: 'manifest.json' })
    archive.append('<html></html>', { name: 'dist/ui/index.html' })
    archive.finalize()
  })
  return file
}

function refusal(result: ReturnType<typeof selectPackage>) {
  if (result.kind !== 'refused') throw new Error(`expected a refusal, got ${JSON.stringify(result)}`)
  return result
}

describe('package selection', () => {
  let dir: string

  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'amc-pkg-select-'))
  })

  afterEach(() => {
    fs.rmSync(dir, { recursive: true, force: true })
    vi.restoreAllMocks()
  })

  describe('listPackageCandidates', () => {
    it('returns every .amcplugin in the folder and in dist/, and nothing else', async () => {
      await writePackage(path.join(dir, 'decks-1.3.2.amcplugin'), '1.3.2')
      await writePackage(path.join(dir, 'dist', 'old.amcplugin'), '1.0.0')
      fs.writeFileSync(path.join(dir, 'notes.txt'), 'x')
      fs.writeFileSync(path.join(dir, 'dist', 'bundle.js'), 'x')

      const found = listPackageCandidates(dir).map(f => path.relative(dir, f).replace(/\\/g, '/')).sort()

      expect(found).toEqual(['decks-1.3.2.amcplugin', 'dist/old.amcplugin'])
    })

    it('returns an empty list when there is no dist/ and no package', () => {
      expect(listPackageCandidates(dir)).toEqual([])
    })
  })

  describe('readPackagedVersion', () => {
    it('reads the version stored in the manifest inside the archive', async () => {
      const file = await writePackage(path.join(dir, 'decks-1.3.2.amcplugin'), '1.3.2-test.1')
      expect(readPackagedVersion(file)).toBe('1.3.2-test.1')
    })

    it('returns null for a file that is not a zip archive', () => {
      const file = path.join(dir, 'decks-1.3.2.amcplugin')
      fs.writeFileSync(file, 'definitely not a zip')
      expect(readPackagedVersion(file)).toBeNull()
    })
  })

  describe('readPluginIdentity', () => {
    it('reads the plugin id and version from manifest.json', () => {
      fs.writeFileSync(path.join(dir, 'manifest.json'), JSON.stringify({ plugin: { id: 'decks', version: '1.3.2' } }))
      expect(readPluginIdentity(dir)).toEqual({ id: 'decks', version: '1.3.2' })
    })
  })

  describe('selectPackage without --package', () => {
    it('reports none when there is nothing to publish yet', () => {
      expect(selectPackage(dir, IDENTITY).kind).toBe('none')
    })

    it('selects the one package whose name and contents match the manifest version', async () => {
      const file = await writePackage(path.join(dir, 'decks-1.3.2.amcplugin'), '1.3.2')
      expect(selectPackage(dir, IDENTITY)).toEqual({ kind: 'selected', path: file })
    })

    it('refuses the Decks 1.3.2 near-miss: only the -test.1 copy sits in the folder', async () => {
      await writePackage(path.join(dir, 'decks-1.3.2-test.1.amcplugin'), '1.3.2-test.1')

      const result = refusal(selectPackage(dir, IDENTITY))

      expect(result.message).toContain('decks-1.3.2-test.1.amcplugin')
      expect(result.message).toMatch(/test/i)
      expect(result.suggestion).toContain('decks-1.3.2.amcplugin')
    })

    it('refuses when two packages are present and lists both with the --package remedy', async () => {
      await writePackage(path.join(dir, 'decks-1.3.2.amcplugin'), '1.3.2')
      await writePackage(path.join(dir, 'decks-1.3.2-test.1.amcplugin'), '1.3.2-test.1')

      const result = refusal(selectPackage(dir, IDENTITY))

      expect(result.message).toContain('decks-1.3.2.amcplugin')
      expect(result.message).toContain('decks-1.3.2-test.1.amcplugin')
      expect(result.suggestion).toContain('--package')
    })

    it('counts a package in dist/ as a second candidate', async () => {
      await writePackage(path.join(dir, 'decks-1.3.2.amcplugin'), '1.3.2')
      await writePackage(path.join(dir, 'dist', 'decks-1.3.1.amcplugin'), '1.3.1')

      expect(selectPackage(dir, IDENTITY).kind).toBe('refused')
    })

    it('refuses a single package whose file name carries another version', async () => {
      await writePackage(path.join(dir, 'decks-1.3.1.amcplugin'), '1.3.1')

      const result = refusal(selectPackage(dir, IDENTITY))

      expect(result.message).toContain('decks-1.3.1.amcplugin')
      expect(result.message).toContain('decks-1.3.2.amcplugin')
    })

    it('refuses a test build copied under the store file name', async () => {
      await writePackage(path.join(dir, 'decks-1.3.2.amcplugin'), '1.3.2-test.4')

      const result = refusal(selectPackage(dir, IDENTITY))

      expect(result.message).toContain('1.3.2-test.4')
    })

    it('refuses a package whose contents say a different version than its name', async () => {
      await writePackage(path.join(dir, 'decks-1.3.2.amcplugin'), '1.3.1')

      expect(refusal(selectPackage(dir, IDENTITY)).message).toContain('1.3.1')
    })

    it('refuses a package it cannot read, rather than trusting its name', () => {
      fs.writeFileSync(path.join(dir, 'decks-1.3.2.amcplugin'), 'definitely not a zip')

      expect(refusal(selectPackage(dir, IDENTITY)).message).toMatch(/manifest\.json/)
    })

    it('refuses when manifest.json itself carries a -test.N version', async () => {
      await writePackage(path.join(dir, 'decks-1.3.2-test.1.amcplugin'), '1.3.2-test.1')

      const result = refusal(selectPackage(dir, { id: 'decks', version: '1.3.2-test.1' }))

      expect(result.message).toContain('1.3.2-test.1')
      expect(result.suggestion).toMatch(/plain/i)
    })
  })

  describe('selectPackage with --package', () => {
    it('selects the named package even when a stray test copy sits beside it', async () => {
      const wanted = await writePackage(path.join(dir, 'releases', 'decks-1.3.2.amcplugin'), '1.3.2')
      await writePackage(path.join(dir, 'decks-1.3.2-test.1.amcplugin'), '1.3.2-test.1')

      expect(selectPackage(dir, IDENTITY, wanted)).toEqual({ kind: 'selected', path: wanted })
    })

    it('resolves a relative path against the plugin folder', async () => {
      const wanted = await writePackage(path.join(dir, 'releases', 'decks-1.3.2.amcplugin'), '1.3.2')

      expect(selectPackage(dir, IDENTITY, 'releases/decks-1.3.2.amcplugin')).toEqual({ kind: 'selected', path: wanted })
    })

    it('refuses a path that does not exist', () => {
      const result = refusal(selectPackage(dir, IDENTITY, 'releases/decks-1.3.2.amcplugin'))
      expect(result.message).toContain('releases')
    })

    it('refuses the -test.1 copy even when it is named explicitly', async () => {
      const testCopy = await writePackage(path.join(dir, 'decks-1.3.2-test.1.amcplugin'), '1.3.2-test.1')

      expect(selectPackage(dir, IDENTITY, testCopy).kind).toBe('refused')
    })

    it('refuses an explicit package built for a different plugin', async () => {
      const other = await writePackage(path.join(dir, 'forms-1.3.2.amcplugin'), '1.3.2', 'forms')

      expect(selectPackage(dir, IDENTITY, other).kind).toBe('refused')
    })
  })

  describe('locatePackage', () => {
    it('exits 1 with the refusal when the folder holds more than one package', async () => {
      fs.writeFileSync(path.join(dir, 'manifest.json'), JSON.stringify({ plugin: { id: 'decks', version: '1.3.2' } }))
      await writePackage(path.join(dir, 'decks-1.3.2.amcplugin'), '1.3.2')
      await writePackage(path.join(dir, 'decks-1.3.2-test.1.amcplugin'), '1.3.2-test.1')
      const errors: string[] = []
      vi.spyOn(console, 'error').mockImplementation((...args: unknown[]) => void errors.push(args.join(' ')))
      vi.spyOn(console, 'log').mockImplementation(() => undefined)
      vi.spyOn(process, 'exit').mockImplementation(((code?: number) => {
        throw new Error(`exit ${code}`)
      }) as never)

      expect(() => locatePackage(dir)).toThrow('exit 1')
      expect(errors.join('\n')).toContain('decks-1.3.2-test.1.amcplugin')
    })

    it('returns the one matching package', async () => {
      fs.writeFileSync(path.join(dir, 'manifest.json'), JSON.stringify({ plugin: { id: 'decks', version: '1.3.2' } }))
      const file = await writePackage(path.join(dir, 'decks-1.3.2.amcplugin'), '1.3.2')

      expect(locatePackage(dir)).toBe(file)
    })
  })
})
