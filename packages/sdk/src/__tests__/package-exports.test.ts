import { describe, expect, it } from 'vitest'
import * as fs from 'node:fs'
import * as path from 'node:path'
import { fileURLToPath } from 'node:url'

// Tests import source paths, never the published package name, so a typo in package.json's
// `exports` would ship a broken subpath while every test stays green. This maps each published
// target back to the source module the build turns into it.

const packageRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
const pkg = JSON.parse(fs.readFileSync(path.join(packageRoot, 'package.json'), 'utf-8')) as {
  exports: Record<string, Record<string, string>>
}

const sourceOf = (target: string): string =>
  target.replace(/^\.\/dist\/(cjs\/)?/, 'src/').replace(/(\.d)?\.ts$|\.js$/, '.ts')

describe('package.json exports', () => {
  it('publishes the commands subpath', () => {
    expect(Object.keys(pkg.exports)).toContain('./commands')
  })

  it.each(Object.entries(pkg.exports))('%s points every condition at a real source module', (_subpath, targets) => {
    for (const [condition, target] of Object.entries(targets)) {
      const source = sourceOf(target)
      expect(fs.existsSync(path.join(packageRoot, source)), `${condition}: ${target} -> ${source}`).toBe(true)
    }
  })
})
