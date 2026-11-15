import { describe, it, expect } from 'vitest'
import { validateManifest } from '@omniscio/plugin-sdk'
import {
  WIDGET_PLUGIN_JS,
  buildBasicPageHtml,
  buildManifest,
  buildWidgetDeclarations,
  buildWidgetPageHtml,
} from '../commands/create.js'

// Every template `omniscio-plugin create` scaffolds must produce a manifest the SDK's own
// validator accepts — otherwise a developer's first `omniscio-plugin validate` fails on a
// file they never touched. This guards the exact drift that silently broke the
// github-issues example (cron gained required `label` / `approvalRequired`): the
// `full` template is the only scaffold carrying a cron job + cli endpoints, so a
// schema change there would slip through until someone ran validate by hand.
const TEMPLATES = ['basic', 'with-backend', 'full', 'webview', 'widget'] as const

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

  it('widget template is a flat webview that declares a sidebar tile and a panel', () => {
    const manifest = buildManifest({ ...base, template: 'widget' }) as {
      ui: { entryPoint: string; widget?: unknown; widgets: Array<Record<string, unknown>> }
      permissions: string[]
    }
    expect(manifest.ui.entryPoint).toBe('ui/index.html')
    expect(manifest.permissions).toEqual(['chrome', 'chrome.widget'])
    expect('widget' in manifest.ui).toBe(false)
    expect(manifest.ui.widgets).toEqual([
      { id: 'status', title: 'My Plugin', kind: 'tile', defaultSize: { w: 4, h: 3 }, faces: ['list', 'stat'] },
      { id: 'panel', title: 'My Plugin panel', kind: 'panel', defaultSize: { w: 4, h: 6 } },
    ])
    expect('backend' in manifest).toBe(false)
  })

  it('widget titles are cut to the 60-character manifest limit', () => {
    const displayName = 'A'.repeat(80)
    const widgets = buildWidgetDeclarations(displayName) as Array<{ title: string }>
    expect(widgets[0].title).toHaveLength(60)
    expect(widgets[1].title).toHaveLength(60)
  })

  it('a longest-allowed sidebar name still gives widget titles within the limit and a valid manifest', () => {
    const displayName = 'B'.repeat(50)
    const manifest = buildManifest({ ...base, displayName, template: 'widget' }) as {
      ui: { widgets: Array<{ title: string }> }
    }
    expect(manifest.ui.widgets.map((widget) => widget.title.length)).toEqual([50, 56])
    expect(validateManifest(manifest).errors).toEqual([])
  })

  it('only the widget template declares widgets', () => {
    for (const template of ['basic', 'with-backend', 'full', 'webview'] as const) {
      const manifest = buildManifest({ ...base, template }) as { ui: Record<string, unknown> }
      expect('widgets' in manifest.ui).toBe(false)
    }
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

describe('widget template page files', () => {
  it('plugin.js sets the status tile, guards the call, and has a switch with a status line', () => {
    expect(WIDGET_PLUGIN_JS).toContain("{ widgetId: 'status' }")
    expect(WIDGET_PLUGIN_JS).toContain('if (amc && amc.widget && amc.widget.set)')
    expect(WIDGET_PLUGIN_JS).toContain("shape: 'list'")
    expect(WIDGET_PLUGIN_JS).toContain("shape: 'stat'")
    expect(WIDGET_PLUGIN_JS).toContain("action: 'open-place'")
    expect(WIDGET_PLUGIN_JS).toContain("getElementById('toggle')")
    expect(WIDGET_PLUGIN_JS).toContain("getElementById('status')")
  })

  it('plugin.js is a plain script with one header line of comment and nothing else', () => {
    const commentLines = WIDGET_PLUGIN_JS.split(/\r?\n/).filter((line) => line.trim().startsWith('//'))
    expect(commentLines).toHaveLength(1)
  })

  it('the page carries the elements plugin.js looks up, and escapes the display name', () => {
    const html = buildWidgetPageHtml('Tom & <Jerry>')
    expect(html).toContain('id="toggle"')
    expect(html).toContain('id="status"')
    expect(html).toContain('<script src="plugin.js"></script>')
    expect(html).toContain('Tom &amp; &lt;Jerry&gt;')
    expect(html).not.toContain('<Jerry>')
  })

  it('the basic page still shows the description', () => {
    expect(buildBasicPageHtml('Name', 'A "quoted" <b>thing</b>')).toContain(
      'A &quot;quoted&quot; &lt;b&gt;thing&lt;/b&gt;',
    )
  })
})
