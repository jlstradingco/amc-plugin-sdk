import { describe, it, expect } from 'vitest'
import { createRequire } from 'node:module'
import * as fs from 'node:fs'
import * as path from 'node:path'
import { fileURLToPath } from 'node:url'

const cliVersion: string = createRequire(import.meta.url)('../../package.json').version
const EXAMPLES_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../../examples')
const CLI_COMMAND = 'omniscio-plugin'

function rangeAccepts(range: string, version: string): boolean {
  const parsed = /^([\^~]?)(\d+)\.(\d+)\.(\d+)$/.exec(range)
  if (!parsed) return false
  const [, operator, major, minor, patch] = parsed
  const [specMajor, specMinor, specPatch] = [major, minor, patch].map(Number)
  const [vMajor, vMinor, vPatch] = version.split('.').map(Number)
  if (operator === '^') {
    if (specMajor !== vMajor) return false
    if (vMinor !== specMinor) return vMinor > specMinor
    return vPatch >= specPatch
  }
  if (operator === '~') return specMajor === vMajor && specMinor === vMinor && vPatch >= specPatch
  return specMajor === vMajor && specMinor === vMinor && specPatch === vPatch
}

function examplePackages(): Array<{ name: string; pkg: { scripts?: Record<string, string>; devDependencies?: Record<string, string> } }> {
  return fs
    .readdirSync(EXAMPLES_DIR, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => ({
      name: entry.name,
      pkg: JSON.parse(fs.readFileSync(path.join(EXAMPLES_DIR, entry.name, 'package.json'), 'utf-8')),
    }))
}

describe('plugin-sdk examples', () => {
  it('finds every example (positive control, so a moved folder cannot pass silently)', () => {
    const names = examplePackages().map((example) => example.name).sort()
    expect(names).toEqual([
      'auth-demo',
      'github-issues',
      'inbox-demo',
      'recording-demo',
      'sessions-demo',
      'storage-demo',
      'toasts-demo',
      'widget-demo',
    ])
  })

  it('installs the CLI its scripts call, so npm install makes npm run build work', () => {
    for (const { name, pkg } of examplePackages()) {
      const commandScripts = Object.entries(pkg.scripts ?? {}).filter(([, command]) =>
        command.startsWith(`${CLI_COMMAND} `),
      )
      expect(commandScripts.length, `${name} ships at least one ${CLI_COMMAND} script`).toBeGreaterThan(0)
      const declared = pkg.devDependencies?.['@omniscio/plugin-cli']
      expect(declared, `${name} declares @omniscio/plugin-cli`).toBeDefined()
      expect(
        rangeAccepts(declared!, cliVersion),
        `${name} declares @omniscio/plugin-cli ${declared} which must accept the scaffolded CLI ${cliVersion}`,
      ).toBe(true)
    }
  })
})
