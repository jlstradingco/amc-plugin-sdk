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

  it('rejects missing sdkVersion', () => {
    const { sdkVersion, ...noSdk } = validManifest
    const result = validateManifest(noSdk)
    expect(result.valid).toBe(false)
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
})
