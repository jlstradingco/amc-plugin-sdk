import { describe, it, expect } from 'vitest'
import { createRequire } from 'node:module'
import { buildPackageJson } from '../commands/create.js'

const cliVersion: string = createRequire(import.meta.url)('../../package.json').version

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
    expect(pkg.scripts.build).toBe('omniscio-plugin build')
    expect(pkg.scripts.dev).toBe('omniscio-plugin dev')
    expect(pkg.scripts.package).toBe('omniscio-plugin package')
    expect(pkg.scripts.validate).toBe('omniscio-plugin validate')
    expect(pkg.devDependencies['@omniscio/plugin-sdk']).toBe('^3.4.0')
    expect(pkg.devDependencies.typescript).toBe('^5.5.0')
  })

  it('installs the CLI its scripts call, at the running CLI version, for every template', () => {
    const variants = [
      buildPackageJson(base),
      buildPackageJson({ ...base, isWebview: true }),
      buildPackageJson({ ...base, hasBackend: true }),
    ] as Array<{ scripts: Record<string, string>; devDependencies: Record<string, string> }>
    for (const pkg of variants) {
      expect(Object.values(pkg.scripts).every(cmd => cmd.startsWith('omniscio-plugin '))).toBe(true)
      expect(pkg.devDependencies['@omniscio/plugin-cli']).toBe(`^${cliVersion}`)
    }
  })

  it('omits description/author keys when not provided', () => {
    const pkg = buildPackageJson({ id: 'bare', description: '', author: '' })
    expect('description' in pkg).toBe(false)
    expect('author' in pkg).toBe(false)
    expect(pkg.name).toBe('bare')
    expect(pkg.license).toBe('UNLICENSED')
  })
})
