import { describe, it, expect } from 'vitest'
import { validateManifest } from '../validators/manifest'

const validManifest = {
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

describe('validateManifest', () => {
  it('accepts a valid v2 manifest with no ui or backend', () => {
    const result = validateManifest(validManifest)
    expect(result.valid).toBe(true)
    expect(result.errors).toEqual([])
  })

  it('accepts a valid v2 manifest with ui and backend', () => {
    const result = validateManifest({
      ...validManifest,
      ui: { entryPoint: 'ui/index.html', sidebar: { title: 'My Plugin', icon: 'zap' } },
      backend: { entryPoint: 'backend/index.js' },
      permissions: ['storage', 'sessions', 'cron'],
      cli: {
        endpoints: [
          { method: 'POST', path: 'sync', description: 'Trigger sync', auth: true },
        ],
      },
      cron: {
        jobs: [
          { id: 'daily', label: 'Daily Sync', schedule: '0 9 * * *', description: 'Runs daily', approvalRequired: true },
        ],
      },
    })
    expect(result.valid).toBe(true)
  })

  it('rejects missing plugin.id', () => {
    const bad = { ...validManifest, plugin: { ...validManifest.plugin, id: '' } }
    const result = validateManifest(bad)
    expect(result.valid).toBe(false)
    expect(result.errors.length).toBeGreaterThan(0)
  })

  it('rejects invalid plugin.id format', () => {
    const bad = { ...validManifest, plugin: { ...validManifest.plugin, id: 'My Plugin!' } }
    const result = validateManifest(bad)
    expect(result.valid).toBe(false)
  })

  it('rejects description over 500 chars', () => {
    const bad = { ...validManifest, plugin: { ...validManifest.plugin, description: 'x'.repeat(501) } }
    const result = validateManifest(bad)
    expect(result.valid).toBe(false)
  })

  it('rejects invalid category', () => {
    const bad = { ...validManifest, plugin: { ...validManifest.plugin, category: 'invalid' } }
    const result = validateManifest(bad)
    expect(result.valid).toBe(false)
  })

  it('ACCEPTS a manifest with no sdkVersion, because the host does', () => {
    // Inverted on 2026-08-11. `sdkVersion` is optional host-side — an absent one
    // means "a v1 in-process plugin" — and requiring it here rejected four of
    // the host's own bundled plugins.
    const { sdkVersion, ...noSdk } = validManifest
    void sdkVersion
    const result = validateManifest(noSdk)
    expect(result.valid).toBe(true)
  })

  it('accepts a minimal manifest carrying only the keys the host requires', () => {
    // settings / storage / migrations are all defaulted host-side. Together with
    // sdkVersion these four were the reason 6 of the host's 12 builtins failed
    // `amc-plugin validate`.
    const result = validateManifest({ plugin: validManifest.plugin })
    expect(result.valid).toBe(true)
    // The defaults still materialise, so downstream consumers are unchanged.
    expect(result.manifest?.settings).toEqual([])
    expect(result.manifest?.migrations).toEqual([])
    expect(result.manifest?.storage).toEqual({ collections: {} })
  })

  it('rejects invalid permission', () => {
    const bad = { ...validManifest, permissions: ['storage', 'root-access'] }
    const result = validateManifest(bad)
    expect(result.valid).toBe(false)
  })

  it('validates settings with all types', () => {
    const result = validateManifest({
      ...validManifest,
      settings: [
        { key: 'enabled', label: 'Enabled', type: 'toggle', default: false },
        { key: 'mode', label: 'Mode', type: 'select', default: 'fast', options: [{ value: 'fast', label: 'Fast' }] },
        { key: 'name', label: 'Name', type: 'text', default: '' },
        { key: 'count', label: 'Count', type: 'number', default: 5, min: 1, max: 100 },
        { key: 'apiKey', label: 'API Key', type: 'password', default: '' },
      ],
    })
    expect(result.valid).toBe(true)
  })

  it('validates storage collections', () => {
    const result = validateManifest({
      ...validManifest,
      storage: {
        collections: {
          tasks: {
            columns: { title: 'text', priority: 'integer', metadata: 'json' },
            indexes: ['priority'],
          },
        },
      },
    })
    expect(result.valid).toBe(true)
  })

  it('accepts backend with resourceLimits', () => {
    const manifest = {
      ...validManifest,
      backend: { entryPoint: 'dist/backend.js', resourceLimits: { memoryMb: 256 } }
    }
    const result = validateManifest(manifest)
    expect(result.valid).toBe(true)
    expect(result.manifest?.backend?.resourceLimits?.memoryMb).toBe(256)
  })

  it('ACCEPTS resourceLimits.memoryMb above 512, because the host has no cap', () => {
    // Inverted on 2026-08-11: the 512 ceiling was SDK-invented policy with no
    // host counterpart, so a legal heavy backend failed `amc-plugin validate`.
    const manifest = {
      ...validManifest,
      backend: { entryPoint: 'dist/backend.js', resourceLimits: { memoryMb: 1024 } }
    }
    const result = validateManifest(manifest)
    expect(result.valid).toBe(true)
    expect(result.manifest?.backend?.resourceLimits?.memoryMb).toBe(1024)
  })

  it('rejects non-integer memoryMb', () => {
    const manifest = {
      ...validManifest,
      backend: { entryPoint: 'dist/backend.js', resourceLimits: { memoryMb: 128.5 } }
    }
    const result = validateManifest(manifest)
    expect(result.valid).toBe(false)
  })

  it('accepts plugin tags and preserves them', () => {
    const manifest = {
      ...validManifest,
      plugin: { ...validManifest.plugin, tags: ['linter', 'security'] },
    }
    const result = validateManifest(manifest)
    expect(result.valid).toBe(true)
    expect(result.manifest?.plugin.tags).toEqual(['linter', 'security'])
  })

  it('rejects more than 10 tags', () => {
    const manifest = {
      ...validManifest,
      plugin: { ...validManifest.plugin, tags: Array.from({ length: 11 }, (_, i) => `tag${i}`) },
    }
    const result = validateManifest(manifest)
    expect(result.valid).toBe(false)
  })

  it('rejects a tag over 30 chars', () => {
    const manifest = {
      ...validManifest,
      plugin: { ...validManifest.plugin, tags: ['x'.repeat(31)] },
    }
    const result = validateManifest(manifest)
    expect(result.valid).toBe(false)
  })
})

// Rules added 2026-08-11 when the validator was reconciled against host
// origin/master@8722cc3fca. Each one closes a case where `amc-plugin validate`
// disagreed with the host — in one direction or the other.
describe('host-parity rules', () => {
  describe('workspace permission pairing', () => {
    // The host AND the marketplace publish gate both reject write/exec without
    // an explicit read. Without this rule the SDK green-lit a manifest that was
    // simultaneously unpublishable and uninstallable.
    it.each(['workspace.write', 'workspace.exec'])(
      'rejects %s declared without workspace.read',
      (perm) => {
        const result = validateManifest({ ...validManifest, permissions: [perm] })
        expect(result.valid).toBe(false)
        expect(result.errors.join(' ')).toContain('workspace.read')
      }
    )

    it('accepts write/exec when workspace.read is declared alongside', () => {
      const result = validateManifest({
        ...validManifest,
        permissions: ['workspace.read', 'workspace.write', 'workspace.exec'],
      })
      expect(result.valid).toBe(true)
    })

    it('does not infer read from write, matching the host', () => {
      // The host deliberately refuses to imply it: ~20 consumers read the raw
      // permissions array and the consent ledger, so an inferred permission
      // would make the consent card disagree with what the plugin holds.
      const result = validateManifest({
        ...validManifest,
        permissions: ['workspace.write'],
      })
      expect(result.valid).toBe(false)
    })
  })

  describe('SQL identifier validation', () => {
    // The host interpolates these names into DDL wrapped in double quotes
    // WITHOUT escaping an embedded quote, so this regex is the injection
    // boundary. The SDK validated none of it, so a manifest like this one
    // passed validate, passed marketplace review, and died at every install.
    it('rejects a collection name that is not a SQL identifier', () => {
      const result = validateManifest({
        ...validManifest,
        storage: { collections: { 'x"; DROP TABLE t --': { columns: { a: 'text' } } } },
      })
      expect(result.valid).toBe(false)
    })

    it('rejects a hyphenated collection name', () => {
      const result = validateManifest({
        ...validManifest,
        storage: { collections: { 'my-table': { columns: { a: 'text' } } } },
      })
      expect(result.valid).toBe(false)
    })

    it('rejects a column name that is not a SQL identifier', () => {
      const result = validateManifest({
        ...validManifest,
        storage: { collections: { notes: { columns: { 'bad name': 'text' } } } },
      })
      expect(result.valid).toBe(false)
    })

    it('accepts ordinary snake_case identifiers', () => {
      const result = validateManifest({
        ...validManifest,
        storage: {
          collections: {
            my_notes: { columns: { body_text: 'text' }, indexes: ['body_text'] },
          },
        },
      })
      expect(result.valid).toBe(true)
    })
  })

  describe('reserved columns are matched case-insensitively', () => {
    // SQLite column names are case-insensitive, so `ID` genuinely collides with
    // the host's own `id` and crashes with `duplicate column name` on a fresh
    // database. A case-sensitive check let these through to that crash.
    it.each(['ID', 'Created_At', 'UPDATED_AT'])('rejects %s', (column) => {
      const result = validateManifest({
        ...validManifest,
        storage: { collections: { notes: { columns: { [column]: 'text' } } } },
      })
      expect(result.valid).toBe(false)
    })
  })

  describe('cli endpoints', () => {
    it('accepts PATCH, which the host and marketplace both allow', () => {
      const result = validateManifest({
        ...validManifest,
        cli: { endpoints: [{ method: 'PATCH', path: '/thing' }] },
      })
      expect(result.valid).toBe(true)
    })

    it('accepts an endpoint with neither description nor auth', () => {
      // Both are optional host-side; requiring them rejected legal manifests.
      const result = validateManifest({
        ...validManifest,
        cli: { endpoints: [{ method: 'GET', path: '/thing' }] },
      })
      expect(result.valid).toBe(true)
    })

    it('preserves requiresConfirmation, the destructive-action gate', () => {
      const result = validateManifest({
        ...validManifest,
        cli: {
          endpoints: [{ method: 'POST', path: '/wipe', requiresConfirmation: true }],
        },
      })
      expect(result.valid).toBe(true)
      expect(result.manifest?.cli?.endpoints[0]?.requiresConfirmation).toBe(true)
    })
  })
})
