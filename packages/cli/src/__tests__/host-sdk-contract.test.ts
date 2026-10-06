import { describe, it, expect } from 'vitest'
import * as fs from 'node:fs'
import * as path from 'node:path'
import { buildManifest } from '../commands/create.js'

/**
 * A manifest's `sdkVersion` names the Omniscio HOST's plugin-SDK contract, not a
 * version of this package. The host compares it with its own
 * `AMC_PLUGIN_SDK_VERSION` and hides the toolbar button of every plugin that
 * fails — which is what happened to each plugin CLI 3.0.0 scaffolded with
 * `^3.0.0` ("3.x only") against a 2.0.0 host.
 *
 * Copied by hand from Agent-Orchestrator `src/shared/plugin-sdk-version.ts`
 * ('2.0.0' on host master 6a01962d35 and release tag v0.1.106, read 2026-09-25).
 * Deliberately NOT imported from create.ts: checked against its own constant,
 * the scaffold would pass whatever value that constant drifted to. When the host
 * constant moves, re-read it there and update this copy.
 */
const HOST_PLUGIN_SDK_VERSION = '2.0.0'

/** The only shape the host reads as "this contract or newer". */
const BARE_VERSION = /^\d+\.\d+\.\d+$/

/**
 * The host's rule for a bare version (`satisfiesRange` in `src/shared/semver.ts`):
 * a minimum, met when the host's own contract is the same or newer.
 */
function hostAcceptsBare(declared: string): boolean {
  const want = declared.split('.').map(Number)
  const have = HOST_PLUGIN_SDK_VERSION.split('.').map(Number)
  const firstDiff = have.findIndex((part, i) => part !== want[i])
  return firstDiff === -1 || have[firstDiff] > want[firstDiff]
}

function expectAcceptedByHost(sdkVersion: unknown): void {
  expect(
    sdkVersion,
    'sdkVersion must be a bare x.y.z — a caret range is "same major only" and breaks on the next host-contract major',
  ).toMatch(BARE_VERSION)
  expect(
    hostAcceptsBare(sdkVersion as string),
    `sdkVersion ${String(sdkVersion)} is newer than the host contract ${HOST_PLUGIN_SDK_VERSION}`,
  ).toBe(true)
}

const TEMPLATES = ['basic', 'with-backend', 'full', 'webview'] as const

describe('scaffolded manifest sdkVersion', () => {
  it.each(TEMPLATES)('%s template declares a contract the host accepts', (template) => {
    const manifest = buildManifest({
      id: 'my-plugin',
      displayName: 'My Plugin',
      author: 'Ada Lovelace',
      description: 'Does a useful thing.',
      icon: 'puzzle',
      category: 'productivity',
      tags: ['productivity'],
      template,
    })
    expectAcceptedByHost(manifest.sdkVersion)
  })
})

const examplesDir = path.resolve(__dirname, '../../../../examples')
const exampleDirs = fs
  .readdirSync(examplesDir, { withFileTypes: true })
  .filter((e) => e.isDirectory() && fs.existsSync(path.join(examplesDir, e.name, 'manifest.json')))
  .map((e) => e.name)

// The examples are the first thing a developer copies, and the post-release
// version sweep moved their sdkVersion to each new package range — so they
// carried the same bug.
describe('example manifest sdkVersion', () => {
  it.each(exampleDirs)('%s declares a contract the host accepts', (name) => {
    const manifest = JSON.parse(
      fs.readFileSync(path.join(examplesDir, name, 'manifest.json'), 'utf-8'),
    )
    expectAcceptedByHost(manifest.sdkVersion)
  })
})
