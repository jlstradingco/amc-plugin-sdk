import { describe, it, expect } from 'vitest'
import { buildReadme } from '../commands/create.js'

const base = {
  displayName: 'My Plugin',
  description: 'Does a useful thing.',
  id: 'my-plugin',
  category: 'productivity',
  tags: ['productivity', 'linter'],
  hasBackend: true,
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

  it('lists the backend directory only when the plugin has a backend', () => {
    expect(buildReadme(base)).toContain('src/backend/')
    expect(buildReadme({ ...base, hasBackend: false })).not.toContain('src/backend/')
  })
})
