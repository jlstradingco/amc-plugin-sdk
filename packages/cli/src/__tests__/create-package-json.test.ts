import { describe, it, expect } from 'vitest'
import { buildPackageJson } from '../commands/create.js'

const base = {
  id: 'my-plugin',
  description: 'Does a useful thing.',
  author: 'Ada Lovelace',
}

describe('buildPackageJson', () => {
  it('carries the npm-standard metadata collected during create', () => {
    const pkg = buildPackageJson(base)
    expect(pkg.name).toBe('my-plugin')
    expect(pkg.description).toBe('Does a useful thing.')
    expect(pkg.author).toBe('Ada Lovelace')
    expect(pkg.version).toBe('1.0.0')
    expect(pkg.private).toBe(true)
    expect(pkg.type).toBe('module')
    expect(pkg.license).toBe('UNLICENSED')
  })

  it('wires the standard dev scripts and SDK dev dependency', () => {
    const pkg = buildPackageJson(base) as {
      scripts: Record<string, string>
      devDependencies: Record<string, string>
    }
    expect(pkg.scripts.build).toBe('tsc')
    expect(pkg.scripts.dev).toBe('amc-plugin dev')
    expect(pkg.scripts.package).toBe('amc-plugin package')
    expect(pkg.scripts.validate).toBe('amc-plugin validate')
    expect(pkg.devDependencies['@agent-mc/plugin-sdk']).toBe('^3.0.0')
    expect(pkg.devDependencies.typescript).toBe('^5.5.0')
  })

  it('omits description/author keys when not provided', () => {
    const pkg = buildPackageJson({ id: 'bare', description: '', author: '' })
    expect('description' in pkg).toBe(false)
    expect('author' in pkg).toBe(false)
    expect(pkg.name).toBe('bare')
    expect(pkg.license).toBe('UNLICENSED')
  })
})
