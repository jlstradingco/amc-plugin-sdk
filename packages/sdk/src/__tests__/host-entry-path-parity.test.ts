import { describe, it, expect } from 'vitest'
import { createHash } from 'node:crypto'
import fs from 'node:fs'
import { fileURLToPath } from 'node:url'
import { validateManifest } from '../validators/manifest.js'
import {
  collectManifestEntryPaths,
  manifestEntryPathProblems,
  MANIFEST_ENTRY_PATH_FIELDS,
} from '../validators/manifest-entry-path.js'
import {
  HOST_ENTRY_PATH_PROVENANCE,
  HOSTILE_ENTRY_PATHS,
  LEGITIMATE_ENTRY_PATHS,
  UNSETTLED_ENTRY_PATHS,
} from './fixtures/host-entry-path-mirror.js'

/**
 * `amc-plugin validate` must refuse every entry path the host refuses, on every field the host
 * checks. The rule itself is a byte-identical copy of the host's module (see the fixture), so
 * this file proves two things: the copy is still the host's, and the schema actually runs it on
 * all six fields.
 */

const VENDORED_RULE = fileURLToPath(new URL('../validators/manifest-entry-path.ts', import.meta.url))
const EXAMPLES_DIR = fileURLToPath(new URL('../../../../examples', import.meta.url))

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
}

/** Every field the host checks, with how to place one entry path into a manifest there. */
const ENTRY_PATH_FIELDS: ReadonlyArray<{ field: string; manifestWith: (entryPath: unknown) => object }> = [
  { field: 'ui.entryPoint', manifestWith: (entryPath) => ({ ...baseManifest, ui: { entryPoint: entryPath } }) },
  {
    field: 'ui.overlay.entryPoint',
    manifestWith: (entryPath) => ({ ...baseManifest, ui: { overlay: { entryPoint: entryPath } } }),
  },
  {
    field: 'ui.settingsPanel.entryPoint',
    manifestWith: (entryPath) => ({ ...baseManifest, ui: { settingsPanel: { entryPoint: entryPath } } }),
  },
  {
    field: 'ui.widget.entryPoint',
    manifestWith: (entryPath) => ({ ...baseManifest, ui: { widget: { entryPoint: entryPath } } }),
  },
  {
    field: 'ui.windows.main.entryPoint',
    manifestWith: (entryPath) => ({ ...baseManifest, ui: { windows: { main: { entryPoint: entryPath } } } }),
  },
  {
    field: 'backend.entryPoint',
    manifestWith: (entryPath) => ({ ...baseManifest, backend: { entryPoint: entryPath } }),
  },
]

/** `git hash-object` of a file, with CRLF folded to LF so a Windows checkout hashes like git does. */
function gitBlobSha(filePath: string): string {
  const content = Buffer.from(fs.readFileSync(filePath, 'utf-8').replace(/\r\n/g, '\n'), 'utf-8')
  return createHash('sha1').update(`blob ${content.length}\0`).update(content).digest('hex')
}

describe('the vendored entry-path rule is still the host rule', () => {
  it('is byte-identical to the host file it was copied from', () => {
    expect(
      gitBlobSha(VENDORED_RULE),
      `validators/manifest-entry-path.ts no longer hashes to the host blob ` +
        `${HOST_ENTRY_PATH_PROVENANCE.blobSha} (${HOST_ENTRY_PATH_PROVENANCE.hostFile} @ ` +
        `${HOST_ENTRY_PATH_PROVENANCE.sourceCommit.slice(0, 10)}). Never edit the copy by hand: ` +
        're-copy it from the host and update HOST_ENTRY_PATH_PROVENANCE (steps in the fixture).'
    ).toBe(HOST_ENTRY_PATH_PROVENANCE.blobSha)
  })

  it('fails once the copy has gone unreconciled past the staleness budget', () => {
    // Same 30-day budget as the permission mirror: the host changed this rule three times on the
    // day it was copied, so trusting the copy indefinitely is exactly how the SDK drifted before.
    const budgetDays = 30
    const reconciledAt = new Date(`${HOST_ENTRY_PATH_PROVENANCE.reconciledAt}T00:00:00Z`)
    expect(Number.isNaN(reconciledAt.getTime()), 'reconciledAt is not a valid date').toBe(false)
    const ageDays = (Date.now() - reconciledAt.getTime()) / (1000 * 60 * 60 * 24)
    expect(
      ageDays,
      `the entry-path rule was last reconciled ${HOST_ENTRY_PATH_PROVENANCE.reconciledAt} ` +
        `(${Math.round(ageDays)} days ago), past the ${budgetDays}-day budget. Compare it with the ` +
        "host's GitHub master and update HOST_ENTRY_PATH_PROVENANCE (steps in the fixture)."
    ).toBeLessThanOrEqual(budgetDays)
  })

  const hostRulePath = process.env.AMC_HOST_ENTRY_PATH_PATH
  if (!hostRulePath) {
    console.warn(
      '[host-entry-path-parity] AMC_HOST_ENTRY_PATH_PATH is not set, so the live comparison below ' +
        'is skipped and this run relies on the recorded blob SHA plus its staleness budget. Point ' +
        "the var at a CURRENT host checkout's src/shared/plugin-manifest-entry-path.ts to run it."
    )
  }

  it.skipIf(!hostRulePath)('matches the REAL host file when AMC_HOST_ENTRY_PATH_PATH is set', () => {
    expect(gitBlobSha(VENDORED_RULE), `the host file at ${hostRulePath} differs from the copy`).toBe(
      gitBlobSha(hostRulePath as string)
    )
  })
})

describe('validateManifest runs the host entry-path rule on all six fields', () => {
  const hostileCases = ENTRY_PATH_FIELDS.flatMap(({ field, manifestWith }) =>
    HOSTILE_ENTRY_PATHS.map(({ label, value }) => ({ field, label, manifest: manifestWith(value) }))
  )
  it.each(hostileCases)('refuses $label in $field', ({ field, manifest }) => {
    const result = validateManifest(manifest)
    expect(result.valid).toBe(false)
    expect(
      result.errors.some((error) => error.startsWith(`${field}: `)),
      `expected an error on ${field}, got ${JSON.stringify(result.errors)}`
    ).toBe(true)
  })

  const legitimateCases = ENTRY_PATH_FIELDS.flatMap(({ field, manifestWith }) =>
    LEGITIMATE_ENTRY_PATHS.map(({ label, value }) => ({ field, label, manifest: manifestWith(value) }))
  )
  it.each(legitimateCases)('accepts $label in $field', ({ manifest }) => {
    expect(validateManifest(manifest).errors).toEqual([])
  })

  const unsettledCases = ENTRY_PATH_FIELDS.flatMap(({ field, manifestWith }) =>
    UNSETTLED_ENTRY_PATHS.map(({ label, value }) => ({ field, label, value, manifest: manifestWith(value) }))
  )
  it.each(unsettledCases)('agrees with the host rule on $label in $field', ({ value, manifest }) => {
    expect(validateManifest(manifest).valid).toBe(manifestEntryPathProblems(value).length === 0)
  })

  it('covers every path field the host rule declares', () => {
    // MANIFEST_ENTRY_PATH_FIELDS is the host's own list. When a re-copy of the rule adds a field,
    // this fails until ENTRY_PATH_FIELDS (and so every case above) covers it too.
    const declaredFields = MANIFEST_ENTRY_PATH_FIELDS.map((field) =>
      field.replace('ui.windows[].', 'ui.windows.main.')
    )
    expect([...declaredFields].sort()).toEqual(ENTRY_PATH_FIELDS.map((placement) => placement.field).sort())
  })

  it('checks exactly the fields the host rule walks', () => {
    // The rule's own collector is the host's statement of which fields are path-typed. A field it
    // walks that the schema does not check is a door left open.
    const everyField = {
      ...baseManifest,
      ui: {
        entryPoint: '../a.html',
        overlay: { entryPoint: '../b.html' },
        settingsPanel: { entryPoint: '../c.html' },
        widget: { entryPoint: '../d.html' },
        windows: { main: { entryPoint: '../e.html' } },
      },
      backend: { entryPoint: '../index.js' },
    }
    const hostFields = collectManifestEntryPaths(everyField).map((entry) => entry.field).sort()
    expect(hostFields).toEqual(ENTRY_PATH_FIELDS.map((placement) => placement.field).sort())

    const refusedFields = validateManifest(everyField).errors.map((error) => error.split(': ')[0])
    expect(refusedFields.sort()).toEqual(hostFields)
  })

  it.each([
    { problem: 'blank', entryPath: '   ', message: 'entryPoint must not be blank' },
    { problem: 'too-long', entryPath: 'a'.repeat(501), message: 'entryPoint must be at most 500 characters' },
    {
      problem: 'control-character',
      entryPath: 'ui/ta\tb.html',
      message: 'entryPoint must not contain a tab, newline or carriage return',
    },
    {
      problem: 'scheme',
      entryPath: 'https://attacker.example/x.html',
      message: 'entryPoint must be a plugin-relative path, not a URL or scheme',
    },
    {
      problem: 'absolute',
      entryPath: '/etc/passwd',
      message: 'entryPoint must be relative to the plugin directory, not an absolute path',
    },
    {
      problem: 'drive',
      entryPath: 'C:/x.html',
      message: 'entryPoint must be relative to the plugin directory, not a drive-qualified path',
    },
    { problem: 'parent-segment', entryPath: '%2e%2e/x.html', message: 'entryPoint must not contain a ".." path segment' },
  ])('reports a $problem path with the host message', ({ entryPath, message }) => {
    // toContain, not toEqual: a drive path also matches the host's scheme pattern (`C:`).
    expect(validateManifest({ ...baseManifest, ui: { entryPoint: entryPath } }).errors).toContain(
      `ui.entryPoint: ${message}`
    )
  })

  it('reports every dimension a path breaks, not only the first', () => {
    // The host returns one issue per dimension, so an absolute path with a ".." gives two lines.
    expect(validateManifest({ ...baseManifest, backend: { entryPoint: '/a/../b.js' } }).errors).toEqual([
      'backend.entryPoint: entryPoint must be relative to the plugin directory, not an absolute path',
      'backend.entryPoint: entryPoint must not contain a ".." path segment',
    ])
  })
})

describe('the three ui surfaces the SDK used to drop', () => {
  it('keeps settingsPanel, widget and windows in the validated manifest', () => {
    const ui = {
      settingsPanel: { entryPoint: 'ui/settings.html' },
      widget: { entryPoint: 'ui/widget.html' },
      windows: { presenter: { entryPoint: 'ui/presenter.html', title: 'Presenter', width: 800, height: 600 } },
    }
    const result = validateManifest({ ...baseManifest, ui })
    expect(result.errors).toEqual([])
    expect(result.manifest?.ui).toEqual(ui)
  })

  it('refuses a window key the host refuses', () => {
    const result = validateManifest({
      ...baseManifest,
      ui: { windows: { Presenter: { entryPoint: 'ui/presenter.html' } } },
    })
    expect(result.valid).toBe(false)
    expect(result.errors[0]).toMatch(/^ui\.windows\.Presenter: /)
  })

  it('refuses more than four windows, as the host does', () => {
    const windows = Object.fromEntries(
      ['a', 'b', 'c', 'd', 'e'].map((key) => [key, { entryPoint: `ui/${key}.html` }])
    )
    expect(validateManifest({ ...baseManifest, ui: { windows } }).errors).toEqual([
      'ui.windows: at most 4 windows may be declared',
    ])
  })

  it('accepts exactly four windows', () => {
    const windows = Object.fromEntries(
      ['a', 'b', 'c', 'd'].map((key) => [key, { entryPoint: `ui/${key}.html` }])
    )
    expect(validateManifest({ ...baseManifest, ui: { windows } }).errors).toEqual([])
  })

  const windowWith = (key: string, surface: object) => ({
    ...baseManifest,
    ui: { windows: { [key]: { entryPoint: 'ui/main.html', ...surface } } },
  })

  it.each([
    { label: 'a 40-character key', manifest: windowWith('a'.repeat(40), {}) },
    { label: 'a key with digits and hyphens', manifest: windowWith('2nd-screen', {}) },
    { label: 'the smallest size', manifest: windowWith('main', { width: 200, height: 200 }) },
    { label: 'the largest size', manifest: windowWith('main', { width: 10000, height: 10000 }) },
    { label: 'a 120-character title', manifest: windowWith('main', { title: 't'.repeat(120) }) },
  ])('accepts a window with $label', ({ manifest }) => {
    expect(validateManifest(manifest).errors).toEqual([])
  })

  it.each([
    { label: 'a 41-character key', manifest: windowWith('a'.repeat(41), {}), field: `ui.windows.${'a'.repeat(41)}` },
    { label: 'a key starting with a hyphen', manifest: windowWith('-main', {}), field: 'ui.windows.-main' },
    { label: 'an empty key', manifest: windowWith('', {}), field: 'ui.windows.' },
    { label: 'a width below 200', manifest: windowWith('main', { width: 199 }), field: 'ui.windows.main.width' },
    { label: 'a width above 10000', manifest: windowWith('main', { width: 10001 }), field: 'ui.windows.main.width' },
    { label: 'a height below 200', manifest: windowWith('main', { height: 199 }), field: 'ui.windows.main.height' },
    { label: 'a height above 10000', manifest: windowWith('main', { height: 10001 }), field: 'ui.windows.main.height' },
    { label: 'a fractional width', manifest: windowWith('main', { width: 640.5 }), field: 'ui.windows.main.width' },
    { label: 'an empty title', manifest: windowWith('main', { title: '' }), field: 'ui.windows.main.title' },
    { label: 'a 121-character title', manifest: windowWith('main', { title: 't'.repeat(121) }), field: 'ui.windows.main.title' },
  ])('refuses a window with $label', ({ manifest, field }) => {
    const result = validateManifest(manifest)
    expect(result.valid).toBe(false)
    expect(result.errors.map((error) => error.split(': ')[0])).toContain(field)
  })

  it.each([
    { field: 'ui.overlay.entryPoint', ui: { overlay: {} } },
    { field: 'ui.settingsPanel.entryPoint', ui: { settingsPanel: {} } },
    { field: 'ui.widget.entryPoint', ui: { widget: {} } },
    { field: 'ui.windows.main.entryPoint', ui: { windows: { main: { title: 'Main' } } } },
  ])('requires $field once its surface is declared', ({ field, ui }) => {
    const result = validateManifest({ ...baseManifest, ui })
    expect(result.errors.map((error) => error.split(': ')[0])).toContain(field)
  })
})

describe('nothing honest stops validating', () => {
  const exampleManifests = fs
    .readdirSync(EXAMPLES_DIR)
    .map((name) => ({ name, manifestPath: `${EXAMPLES_DIR}/${name}/manifest.json` }))
    .filter(({ manifestPath }) => fs.existsSync(manifestPath))

  it('finds the example plugins (positive control)', () => {
    expect(exampleManifests.length).toBeGreaterThan(3)
  })

  it.each(exampleManifests)('the $name example still validates', ({ manifestPath }) => {
    expect(validateManifest(JSON.parse(fs.readFileSync(manifestPath, 'utf-8'))).errors).toEqual([])
  })
})
