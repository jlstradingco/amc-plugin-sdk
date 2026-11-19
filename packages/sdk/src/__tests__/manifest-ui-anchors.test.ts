import { describe, it, expect } from 'vitest'
import { validateManifest } from '../validators/manifest.js'
import type { PluginManifest } from '../types/manifest.js'

const baseManifest = {
  plugin: {
    id: 'my-plugin',
    name: 'My Plugin',
    version: '1.0.0',
    author: 'Test Author',
    description: 'A test plugin',
    icon: 'zap',
    category: 'productivity',
    license: { type: 'free' },
  },
  settings: [],
  storage: { collections: {} },
  sdkVersion: '2.0.0',
} satisfies PluginManifest

const openFile = {
  id: 'open-file',
  label: 'Open file',
  description: 'Opens the file picker so the user can choose a PDF.',
  kind: 'button',
} as const

const withAnchors = (uiAnchors: unknown, pluginId = 'my-plugin') => ({
  ...baseManifest,
  plugin: { ...baseManifest.plugin, id: pluginId },
  uiAnchors,
})

const errorsOf = (manifest: unknown): string => validateManifest(manifest).errors.join('\n')

describe('uiAnchors (host: up to 64 plugin-listed controls, named plugin:<id>:<anchor>)', () => {
  it('accepts and keeps a listed control, including an optional "when"', () => {
    const uiAnchors = [openFile, { ...openFile, id: 'save-copy', when: 'after a PDF is open' }]
    const result = validateManifest(withAnchors(uiAnchors))

    expect(result.errors).toEqual([])
    expect(result.manifest?.uiAnchors).toEqual(uiAnchors)
  })

  it('is a published type field', () => {
    const manifest = { ...baseManifest, uiAnchors: [openFile] } satisfies PluginManifest

    expect(manifest.uiAnchors).toHaveLength(1)
  })

  it.each([
    ['an upper-case id', { ...openFile, id: 'Open-File' }],
    ['an id with a colon', { ...openFile, id: 'a:b' }],
    ['an unknown kind', { ...openFile, kind: 'carousel' }],
    ['a label with a newline', { ...openFile, label: 'Open\nfile' }],
    ['a description past 300 characters', { ...openFile, description: 'x'.repeat(301) }],
    ['an extra key', { ...openFile, related: ['x'] }],
  ])('refuses %s', (_label, entry) => {
    expect(errorsOf(withAnchors([entry]))).toMatch(/^uiAnchors/m)
  })

  it('refuses a repeated id', () => {
    expect(errorsOf(withAnchors([openFile, openFile]))).toContain('same id twice')
  })

  it('refuses more than 64 entries', () => {
    const tooMany = Array.from({ length: 65 }, (_unused, index) => ({ ...openFile, id: `control-${index}` }))

    expect(errorsOf(withAnchors(tooMany))).toMatch(/^uiAnchors/m)
  })

  it('refuses an entry whose full prefixed name would pass 120 characters', () => {
    const longEntry = { ...openFile, id: 'b'.repeat(48) }

    expect(errorsOf(withAnchors([longEntry], 'p'.repeat(90)))).toContain('full anchor name')
  })
})

describe('uiAnchorsExtra (the overflow list an older app drops and ignores)', () => {
  const anchorsNamed = (prefix: string, count: number, entry: Record<string, unknown> = {}) =>
    Array.from({ length: count }, (_unused, index) => ({ ...openFile, id: `${prefix}-${index}`, ...entry }))

  const withLists = (uiAnchors: unknown[], uiAnchorsExtra: unknown[]) => ({
    ...baseManifest,
    uiAnchors,
    uiAnchorsExtra,
  })

  it('accepts 64 plus 128 and keeps both lists', () => {
    const result = validateManifest(withLists(anchorsNamed('primary', 64), anchorsNamed('extra', 128)))

    expect(result.errors).toEqual([])
    expect(result.manifest?.uiAnchorsExtra).toHaveLength(128)
  })

  it('refuses a 129th extra anchor', () => {
    expect(errorsOf(withLists([], anchorsNamed('extra', 129)))).toMatch(/^uiAnchorsExtra/m)
  })

  it('refuses one id declared in both lists', () => {
    expect(errorsOf(withLists([openFile], [openFile]))).toContain('both uiAnchors')
  })

  it('refuses an anchor set over the combined UTF-8 budget', () => {
    const wide = { label: '漢'.repeat(80), description: '漢'.repeat(300), when: '漢'.repeat(120) }
    const errors = errorsOf(withLists(anchorsNamed('primary', 64, wide), anchorsNamed('extra', 128, wide)))

    expect(errors).toContain('131072')
  })

  it('is a published type field', () => {
    const manifest = { ...baseManifest, uiAnchorsExtra: [openFile] } satisfies PluginManifest

    expect(manifest.uiAnchorsExtra).toHaveLength(1)
  })
})
