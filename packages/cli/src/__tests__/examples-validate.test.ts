import { describe, it, expect } from 'vitest'
import * as fs from 'node:fs'
import * as path from 'node:path'
import { validateManifest, PLUGIN_PERMISSIONS } from '@omniscio/plugin-sdk'
import { PUBLISHED_SDK_VERSION, PUBLISHED_PERMISSIONS } from './fixtures/published-sdk-surface.js'
import { rangeAccepts } from './fixtures/range-accepts.js'

const examplesDir = path.resolve(__dirname, '../../../../examples')
const sdkPackagePath = path.resolve(__dirname, '../../../sdk/package.json')
const sdkVersion: string = JSON.parse(fs.readFileSync(sdkPackagePath, 'utf-8')).version

const MINIMUM_KIT = /Requires `@omniscio\/plugin-sdk` (\d+\.\d+\.\d+) or newer/

interface ExampleInput {
  name: string
  manifest: { permissions?: string[] }
  pinnedRange: string | undefined
  readme: string
}

const exampleDirs = fs
  .readdirSync(examplesDir, { withFileTypes: true })
  .filter((e) => e.isDirectory() && fs.existsSync(path.join(examplesDir, e.name, 'manifest.json')))
  .map((e) => e.name)

function readExample(name: string): ExampleInput {
  const dir = path.join(examplesDir, name)
  const read = (file: string): string => {
    const target = path.join(dir, file)
    return fs.existsSync(target) ? fs.readFileSync(target, 'utf-8') : ''
  }
  const pkg = JSON.parse(read('package.json') || '{}')
  return {
    name,
    manifest: JSON.parse(read('manifest.json')),
    pinnedRange: pkg.devDependencies?.['@omniscio/plugin-sdk'],
    readme: read('README.md')
  }
}

function compareVersions(left: string, right: string): number {
  const a = left.split('.').map(Number)
  const b = right.split('.').map(Number)
  for (let at = 0; at < 3; at += 1) {
    const difference = (a[at] ?? 0) - (b[at] ?? 0)
    if (difference !== 0) return difference
  }
  return 0
}

interface PublishedSurface {
  version: string
  permissions: string[]
}

const RECORD: PublishedSurface = { version: PUBLISHED_SDK_VERSION, permissions: PUBLISHED_PERMISSIONS }

function unpublishedIn(example: ExampleInput, surface: PublishedSurface): string[] {
  return (example.manifest.permissions ?? []).filter((permission) => !surface.permissions.includes(permission))
}

function pinProblems(example: ExampleInput, surface: PublishedSurface): string[] {
  if (!example.pinnedRange || rangeAccepts(example.pinnedRange, surface.version)) return []
  return [
    `${example.name} pins @omniscio/plugin-sdk ${example.pinnedRange}, ` +
      `which cannot install the last published ${surface.version}`
  ]
}

function minimumKitProblems(
  example: ExampleInput,
  unpublished: string[],
  surface: PublishedSurface
): string[] {
  const problems: string[] = []
  const stated = MINIMUM_KIT.exec(example.readme)
  if (!stated) {
    problems.push(
      `${example.name} needs ${unpublished.join(', ')}, which ${surface.version} does not carry: ` +
        'its README must state "Requires `@omniscio/plugin-sdk` <x.y.z> or newer", naming the kit that will carry it'
    )
  } else if (compareVersions(stated[1]!, surface.version) <= 0) {
    problems.push(`${example.name} names minimum kit ${stated[1]}, which is not newer than ${surface.version}`)
  } else if (example.pinnedRange && !rangeAccepts(example.pinnedRange, stated[1]!)) {
    problems.push(
      `${example.name} pins @omniscio/plugin-sdk ${example.pinnedRange}, ` +
        `which cannot reach the ${stated[1]} its README requires`
    )
  }
  const unnamed = unpublished.filter((permission) => !example.readme.includes(permission))
  if (unnamed.length > 0) {
    problems.push(`${example.name} must name ${unnamed.join(', ')} in its README so the requirement is explained`)
  }
  return problems
}

function publishedSurfaceProblems(example: ExampleInput, surface: PublishedSurface = RECORD): string[] {
  const unpublished = unpublishedIn(example, surface)
  const problems = pinProblems(example, surface)
  return unpublished.length === 0 ? problems : [...problems, ...minimumKitProblems(example, unpublished, surface)]
}

describe('example plugin manifests', () => {
  it('ships at least the known example set', () => {
    expect(exampleDirs.length).toBeGreaterThanOrEqual(7)
  })

  it.each(exampleDirs)('%s passes validateManifest', (name) => {
    const manifest = JSON.parse(
      fs.readFileSync(path.join(examplesDir, name, 'manifest.json'), 'utf-8')
    )
    const result = validateManifest(manifest)
    expect(result.errors).toEqual([])
    expect(result.valid).toBe(true)
  })

  it.each(exampleDirs)('%s is accepted by the SDK release its package.json resolves', (name) => {
    expect(publishedSurfaceProblems(readExample(name))).toEqual([])
  })
})

describe('the published SDK surface record', () => {
  it('is swept in the same change that publishes a kit', () => {
    expect(
      sdkVersion,
      `the SDK is ${sdkVersion} but the record still says ${PUBLISHED_SDK_VERSION}: in the release commit set ` +
        'PUBLISHED_PERMISSIONS in fixtures/published-sdk-surface.ts to the list that release ships, and bump PUBLISHED_SDK_VERSION'
    ).toBe(PUBLISHED_SDK_VERSION)
  })

  it('lists real, distinct permissions this SDK still declares', () => {
    const declared: readonly string[] = PLUGIN_PERMISSIONS
    expect(new Set(PUBLISHED_PERMISSIONS).size).toBe(PUBLISHED_PERMISSIONS.length)
    for (const permission of PUBLISHED_PERMISSIONS) {
      expect(declared, `${permission} is not a permission this SDK declares`).toContain(permission)
    }
  })
})

describe('the published-surface rule', () => {
  const manifest = { permissions: ['auth', 'auth.actAsUser'] }
  const authDemoSurface: PublishedSurface = { version: '3.5.0', permissions: ['auth', 'auth.session', 'network'] }

  it('refuses a copy that needs an unpublished permission and explains nothing', () => {
    const problems = publishedSurfaceProblems(
      { name: 'demo', manifest, pinnedRange: '^3.4.0', readme: '# Demo' },
      authDemoSurface
    )
    expect(problems.some((problem) => problem.includes('must state'))).toBe(true)
    expect(problems.some((problem) => problem.includes('must name auth.actAsUser'))).toBe(true)
  })

  it('accepts it once its README states a newer minimum its pin can reach', () => {
    const readme = 'Requires `@omniscio/plugin-sdk` 3.6.0 or newer, for auth.actAsUser.'
    expect(publishedSurfaceProblems({ name: 'demo', manifest, pinnedRange: '^3.4.0', readme }, authDemoSurface)).toEqual([])
  })

  it('refuses the shipped auth-demo the moment its README stops explaining the permission', () => {
    const example = readExample('auth-demo')
    expect(publishedSurfaceProblems(example, authDemoSurface)).toEqual([])
    expect(publishedSurfaceProblems({ ...example, readme: '' }, authDemoSurface)).toContainEqual(
      expect.stringContaining('auth.actAsUser')
    )
  })

  it('refuses a minimum its own pin cannot reach, and a minimum no newer than the published kit', () => {
    const unreachable = 'Requires `@omniscio/plugin-sdk` 3.6.0 or newer, for auth.actAsUser.'
    expect(
      publishedSurfaceProblems({ name: 'demo', manifest, pinnedRange: '~3.4.0', readme: unreachable }, authDemoSurface)
    ).toContainEqual(expect.stringContaining('cannot reach'))
    const alreadyPublished = 'Requires `@omniscio/plugin-sdk` 3.5.0 or newer, for auth.actAsUser.'
    expect(
      publishedSurfaceProblems({ name: 'demo', manifest, pinnedRange: '^3.4.0', readme: alreadyPublished }, authDemoSurface)
    ).toEqual([expect.stringContaining('not newer')])
  })
})
