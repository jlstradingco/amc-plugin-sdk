import { describe, it, expect } from 'vitest'
import * as fs from 'node:fs'
import * as path from 'node:path'
import { validateManifest } from '@agent-mc/plugin-sdk'

// The example plugins are the first thing a developer copies. If one no longer
// passes the SDK's own manifest validator, the copy-paste starting point is
// broken. Guard every shipped example so a manifest regression fails CI here
// rather than in a developer's terminal.
const examplesDir = path.resolve(__dirname, '../../../../examples')

const exampleDirs = fs
  .readdirSync(examplesDir, { withFileTypes: true })
  .filter((e) => e.isDirectory() && fs.existsSync(path.join(examplesDir, e.name, 'manifest.json')))
  .map((e) => e.name)

describe('example plugin manifests', () => {
  it('ships at least the known example set', () => {
    expect(exampleDirs.length).toBeGreaterThanOrEqual(7)
  })

  it.each(exampleDirs)('%s passes validateManifest', (name) => {
    const manifest = JSON.parse(
      fs.readFileSync(path.join(examplesDir, name, 'manifest.json'), 'utf-8')
    )
    const result = validateManifest(manifest)
    expect(result.errors).toEqual([])
    expect(result.valid).toBe(true)
  })
})
