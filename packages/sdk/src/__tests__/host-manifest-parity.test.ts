import { describe, it, expect } from 'vitest'
import { validateManifest } from '../validators/manifest.js'
import {
  HOST_MIGRATION_OPS,
  HOST_REJECTED_MIGRATION_OPS,
  HOST_RESERVED_COLUMNS,
  HOST_SOURCES,
  HOST_UI_BOUNDS,
} from './fixtures/host-mirror.js'

/**
 * Closes the manifest half of the documented drift list (spec 09-dependencies
 * §B2). Each assertion mirrors a specific host line — cited in the assertion
 * message — so a failure tells you WHICH host behaviour this SDK has drifted
 * from, not merely that a schema changed.
 *
 * Every expectation here was verified against the host source at
 * `origin/master` 9a95c573fa, never against this SDK's own mock.
 */

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
  migrations: [],
  sdkVersion: '^1.0.0',
}

describe(`ui block parity (${HOST_SOURCES.manifestValidator}:220-265)`, () => {
  it('accepts a ui block carrying only hideProjectPanel', () => {
    // The host has always had entryPoint and sidebar optional, so this manifest
    // installs fine. An SDK that rejects it fails `amc-plugin validate` on a
    // legal plugin — the parity inversion pointing the wrong way.
    const result = validateManifest({ ...baseManifest, ui: { hideProjectPanel: true } })
    expect(result.errors, 'host validator:221-238 makes entryPoint/sidebar optional').toEqual([])
    expect(result.valid).toBe(true)
  })

  it('preserves hideProjectPanel instead of silently stripping it', () => {
    const result = validateManifest({ ...baseManifest, ui: { hideProjectPanel: true } })
    expect(
      result.manifest?.ui?.hideProjectPanel,
      `host types/plugins.ts:127 declares it and DashboardDesktopLayout.tsx:565-570 reads it`
    ).toBe(true)
  })

  it('preserves ui.sessions, including the contextTemplate the host renders', () => {
    const result = validateManifest({
      ...baseManifest,
      ui: {
        entryPoint: 'ui/index.html',
        sessions: {
          contextTemplate: 'Project {{projectName}} on {{date}}',
          label: 'My sessions',
          showDivider: false,
          suggestedPrompts: [{ label: 'Go', prompt: 'Do the thing' }],
        },
      },
    })
    expect(result.errors).toEqual([])
    expect(
      result.manifest?.ui?.sessions?.contextTemplate,
      `host ${HOST_SOURCES.contextProvider}:227-274 renders this into session context`
    ).toBe('Project {{projectName}} on {{date}}')
    expect(result.manifest?.ui?.sessions?.suggestedPrompts).toHaveLength(1)
  })

  it('preserves ui.overlay, which the host declares and opens a window for', () => {
    const result = validateManifest({
      ...baseManifest,
      ui: { overlay: { entryPoint: 'overlay/index.html' } },
    })
    expect(result.errors).toEqual([])
    expect(
      result.manifest?.ui?.overlay?.entryPoint,
      'host validator:228-232; consumed at plugin-enable.ts:662-664'
    ).toBe('overlay/index.html')
  })

  it('enforces the host length bounds rather than being merely permissive', () => {
    // An unbounded optional would pass `amc-plugin validate` and then fail at
    // install — the same inversion in the other direction.
    const tooLongEntry = validateManifest({
      ...baseManifest,
      ui: { entryPoint: 'x'.repeat(HOST_UI_BOUNDS.entryPointMax + 1) },
    })
    expect(tooLongEntry.valid, `host caps entryPoint at ${HOST_UI_BOUNDS.entryPointMax}`).toBe(false)

    const tooLongTitle = validateManifest({
      ...baseManifest,
      ui: {
        entryPoint: 'ui/index.html',
        sidebar: { title: 'x'.repeat(HOST_UI_BOUNDS.sidebarTitleMax + 1), icon: 'zap' },
      },
    })
    expect(tooLongTitle.valid, `host caps sidebar.title at ${HOST_UI_BOUNDS.sidebarTitleMax}`).toBe(
      false
    )

    const tooLongTemplate = validateManifest({
      ...baseManifest,
      ui: { sessions: { contextTemplate: 'x'.repeat(HOST_UI_BOUNDS.contextTemplateMax + 1) } },
    })
    expect(
      tooLongTemplate.valid,
      `host caps contextTemplate at ${HOST_UI_BOUNDS.contextTemplateMax}`
    ).toBe(false)
  })

  it('accepts an empty contextTemplate, because the host does', () => {
    // validator:246 has max(5000) but deliberately NO min(1); the host treats a
    // whitespace-only template as absent at runtime (plugin-provider.ts:229)
    // rather than rejecting it. Adding a min(1) here would reject a manifest
    // that installs fine.
    const result = validateManifest({ ...baseManifest, ui: { sessions: { contextTemplate: '' } } })
    expect(result.valid).toBe(true)
  })
})

describe(`storage.uniqueIndexes parity (${HOST_SOURCES.storage}:511-538)`, () => {
  it('preserves uniqueIndexes, which the host turns into real unique indexes', () => {
    const result = validateManifest({
      ...baseManifest,
      storage: {
        collections: {
          findings: {
            columns: { scan_id: 'text', category: 'text' },
            uniqueIndexes: [['scan_id', 'category']],
          },
        },
      },
    })
    expect(result.errors).toEqual([])
    expect(
      result.manifest?.storage.collections.findings?.uniqueIndexes,
      'host emits CREATE UNIQUE INDEX per tuple and collectionUpsert depends on it'
    ).toEqual([['scan_id', 'category']])
  })

  it.each(HOST_RESERVED_COLUMNS)('refuses the host-managed column %s in a schema', (column) => {
    // The host stamps id/created_at/updated_at on every row itself and refuses a
    // plugin that redeclares one (plugin-manifest-validator.ts:167-172). This
    // SDK enforced it on migration operations only, so a manifest declaring
    // `columns: { id: 'text' }` validated here and failed at install.
    const result = validateManifest({
      ...baseManifest,
      storage: { collections: { items: { columns: { [column]: 'text' } } } },
    })
    expect(result.valid, `host refuses ${column} in a collection schema`).toBe(false)
  })

  it('still accepts ordinary column names', () => {
    // Guards the refinement above against over-reach: only the three host-owned
    // names are refused, not every column.
    const result = validateManifest({
      ...baseManifest,
      storage: { collections: { items: { columns: { title: 'text', note_id: 'integer' } } } },
    })
    expect(result.errors).toEqual([])
  })

  it('rejects an empty unique-index tuple, matching the host min(1)', () => {
    const result = validateManifest({
      ...baseManifest,
      storage: {
        collections: { findings: { columns: { scan_id: 'text' }, uniqueIndexes: [[]] } },
      },
    })
    expect(result.valid, 'host validator:179-187 requires at least one column per tuple').toBe(false)
  })
})

describe(`migrations parity (${HOST_SOURCES.manifestValidator}:193-219)`, () => {
  const migrationWith = (op: Record<string, unknown>) => ({
    ...baseManifest,
    migrations: [{ version: '1.1.0', operations: [op] }],
  })

  it.each(HOST_MIGRATION_OPS)('accepts the host op %s', (type) => {
    const result = validateManifest(migrationWith({ type, collection: 'items', column: 'note' }))
    expect(result.errors).toEqual([])
    expect(result.valid).toBe(true)
  })

  it.each(HOST_REJECTED_MIGRATION_OPS)('rejects %s, which the host has never accepted', (type) => {
    const result = validateManifest(migrationWith({ type, collection: 'items', column: 'note' }))
    expect(
      result.valid,
      `${type} traces to a stale host design plan, not the shipped enum (validator:199)`
    ).toBe(false)
  })

  it('requires column on every operation, including the index ops', () => {
    // Surprising but real: host validator:201-212 has no .optional() on column,
    // so an index op identifies its index solely by a single column.
    const result = validateManifest(migrationWith({ type: 'add_index', collection: 'items' }))
    expect(result.valid, 'host requires column for every op type').toBe(false)
  })

  it.each(HOST_RESERVED_COLUMNS)('refuses the host-owned column %s', (column) => {
    const result = validateManifest(migrationWith({ type: 'add_column', collection: 'items', column }))
    expect(
      result.valid,
      `host refuses its own columns (types/plugins.ts:34-42, validator:206-212)`
    ).toBe(false)
  })
})
