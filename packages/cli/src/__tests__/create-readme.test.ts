import { describe, it, expect } from 'vitest'
import { buildReadme } from '../commands/create.js'

const base = {
  displayName: 'My Plugin',
  description: 'Does a useful thing.',
  id: 'my-plugin',
  category: 'productivity',
  tags: ['productivity', 'linter'],
  hasBackend: true,
  isWebview: false,
}

describe('buildReadme', () => {
  it('renders the plugin heading, description and metadata', () => {
    const readme = buildReadme(base)
    expect(readme).toContain('# My Plugin')
    expect(readme).toContain('Does a useful thing.')
    expect(readme).toContain('**Plugin ID:** `my-plugin`')
    expect(readme).toContain('**Category:** productivity')
    expect(readme).toContain('**Tags:** productivity, linter')
  })

  it('wires the standard dev scripts', () => {
    const readme = buildReadme(base)
    expect(readme).toContain('npm run dev')
    expect(readme).toContain('npm run build')
    expect(readme).toContain('npm run validate')
    expect(readme).toContain('npm run package')
  })

  it('links the SDK docs at their published home, never the retired GitHub Pages site', () => {
    const readme = buildReadme(base)
    expect(readme).toContain('https://docs.omniscio.com/sdk/')
    expect(readme).not.toContain('jlstradingco.github.io')
  })

  it('lists the backend directory only when the plugin has a backend', () => {
    expect(buildReadme(base)).toContain('src/backend/')
    expect(buildReadme({ ...base, hasBackend: false })).not.toContain('src/backend/')
  })

  it('does not advertise a build step or dist/ for a plain-JS webview plugin', () => {
    const readme = buildReadme({ ...base, hasBackend: false, isWebview: true })
    expect(readme).not.toContain('npm run build')
    expect(readme).not.toContain('dist/')
    expect(readme).not.toContain('+ TypeScript')
    expect(readme).toContain('ui/')
    expect(readme).toContain('plugin.js')
  })

  it('keeps the build step for a TypeScript plugin', () => {
    expect(buildReadme({ ...base, isWebview: false })).toContain('npm run build')
  })

  it('runs the publish command through npx, since a bare omniscio-plugin is not on the shell PATH', () => {
    for (const isWebview of [false, true]) {
      const readme = buildReadme({ ...base, isWebview })
      expect(readme).toContain('npx omniscio-plugin publish')
      expect(readme).not.toContain('\nomniscio-plugin publish')
    }
  })
})
