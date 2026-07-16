import { describe, it, expect } from 'vitest'
import { validateManifest } from '@agent-mc/plugin-sdk'
import { buildManifest } from '../commands/create.js'

// Every template `amc-plugin create` scaffolds must produce a manifest the SDK's own
// validator accepts — otherwise a developer's first `amc-plugin validate` fails on a
// file they never touched. This guards the exact drift that silently broke the
// github-issues example (cron gained required `label` / `approvalRequired`): the
// `full` template is the only scaffold carrying a cron job + cli endpoints, so a
// schema change there would slip through until someone ran validate by hand.
const TEMPLATES = ['basic', 'with-backend', 'full', 'webview'] as const

const base = {
  id: 'my-plugin',
  displayName: 'My Plugin',
  author: 'Ada Lovelace',
  description: 'Does a useful thing.',
  icon: 'puzzle',
  category: 'productivity',
  tags: ['productivity'],
}

describe('buildManifest', () => {
  it.each(TEMPLATES)('%s template passes validateManifest', (template) => {
    const manifest = buildManifest({ ...base, template })
    const result = validateManifest(manifest)
    expect(result.errors).toEqual([])
    expect(result.valid).toBe(true)
  })

  it('webview UI points at the flat-JS root entry point', () => {
    const manifest = buildManifest({ ...base, template: 'webview' }) as {
      ui: { entryPoint: string }
    }
    expect(manifest.ui.entryPoint).toBe('ui/index.html')
  })

  it('compiled templates point UI at the dist build output', () => {
    const manifest = buildManifest({ ...base, template: 'basic' }) as {
      ui: { entryPoint: string }
    }
    expect(manifest.ui.entryPoint).toBe('dist/ui/index.html')
  })

  it('basic template ships no backend, permissions, cli or cron', () => {
    const manifest = buildManifest({ ...base, template: 'basic' })
    expect('backend' in manifest).toBe(false)
    expect('permissions' in manifest).toBe(false)
    expect('cli' in manifest).toBe(false)
    expect('cron' in manifest).toBe(false)
  })

  it('with-backend adds a backend entry and storage permission only', () => {
    const manifest = buildManifest({ ...base, template: 'with-backend' }) as {
      backend: { entryPoint: string }
      permissions: string[]
    }
    expect(manifest.backend.entryPoint).toBe('dist/backend/index.js')
    expect(manifest.permissions).toEqual(['storage'])
    expect('cron' in manifest).toBe(false)
    expect('cli' in manifest).toBe(false)
  })

  it('full template wires cron + cli with the permissions they require', () => {
    const manifest = buildManifest({ ...base, template: 'full' }) as {
      permissions: string[]
      cli: { endpoints: unknown[] }
      cron: { jobs: Array<{ id: string; label: string; approvalRequired: boolean }> }
    }
    expect(manifest.permissions).toEqual(['storage', 'cron', 'cli'])
    expect(manifest.cli.endpoints).toHaveLength(1)
    // The cron job carries every field the validator now requires — the drift that
    // broke the github-issues example.
    expect(manifest.cron.jobs[0]).toMatchObject({
      id: 'heartbeat',
      label: 'Heartbeat Check',
      approvalRequired: true,
    })
  })
})
