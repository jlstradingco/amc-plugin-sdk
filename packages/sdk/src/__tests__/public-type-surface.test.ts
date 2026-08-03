import { describe, it, expect } from 'vitest'
import * as fs from 'node:fs'
import * as path from 'node:path'
import { fileURLToPath } from 'node:url'

// The 1.2.0 release added four namespaces to `PluginContext` and re-exported their types
// from src/types/index.ts — but NOT from src/index.ts, the package entry point. There is no
// "./types" subpath in the exports map, so `SpendReportBreakdown`, `PluginTts`,
// `HistoryMessage` and the rest were unreachable from '@agent-mc/plugin-sdk'. `ctx.spend`
// still worked structurally through PluginContext, which is why nothing caught it: an author
// could USE the namespace but could not NAME its types.
//
// A compile-time check cannot catch this — the missing name simply is not there to import —
// so this compares the two barrels as source text. It covers every type, not just the four,
// so the next namespace added cannot repeat it.

const here = path.dirname(fileURLToPath(import.meta.url))
const SRC = path.join(here, '..')

/**
 * Every identifier inside an `export type { … } from '…'` block in a file, optionally
 * restricted to blocks re-exporting from one module.
 */
function exportedTypeNames(file: string, fromModule?: string): Set<string> {
  const source = fs.readFileSync(file, 'utf-8')
  const names = new Set<string>()
  const blocks = source.matchAll(/export\s+type\s*\{([^}]*)\}\s*from\s*'([^']+)'/g)
  for (const block of blocks) {
    if (fromModule !== undefined && block[2] !== fromModule) continue
    for (const raw of block[1]!.split(',')) {
      // Strip line comments (the barrels annotate their groups) and `as` aliases.
      const name = raw
        .replace(/\/\/.*$/gm, '')
        .trim()
        .split(/\s+as\s+/)[0]!
        .trim()
      if (name) names.add(name)
    }
  }
  return names
}

describe('public type surface', () => {
  const rootExports = exportedTypeNames(path.join(SRC, 'index.ts'))
  const typeExports = exportedTypeNames(path.join(SRC, 'types', 'index.ts'))

  it('parses a non-trivial set from both barrels', () => {
    // Guard the guard: a regex that silently matched nothing would make every
    // assertion below vacuously true.
    expect(typeExports.size).toBeGreaterThan(30)
    expect(rootExports.size).toBeGreaterThan(30)
  })

  it('re-exports every type from the package entry point', () => {
    // src/types/index.ts is INTERNAL — package.json exposes "." , "./browser",
    // "./validators" and "./testing", and nothing else. A type that reaches only the
    // internal barrel cannot be imported by a plugin author at all.
    const unreachable = [...typeExports].filter((name) => !rootExports.has(name))
    expect(unreachable).toEqual([])
  })

  it('names the four 1.2.0 namespaces and their payload types', () => {
    // The specific regression, pinned so a barrel rewrite cannot quietly drop them.
    for (const name of [
      'PluginTts',
      'SynthesizedSpeech',
      'PluginSessionHistory',
      'HistoryProject',
      'HistorySession',
      'HistoryMessage',
      'HistoryGrantResult',
      'PluginFirebase',
      'FirebaseAccount',
      'FirebaseProject',
      'FirebaseSetupStatus',
      'PluginSpend',
      'SpendWindow',
      'SpendEngineLine',
      'SpendFeatureLine',
      'SpendCharge',
      'SpendReportBreakdown'
    ]) {
      expect(rootExports.has(name), `${name} is not exported from the package root`).toBe(true)
    }
  })

  it('re-exports no type the internal barrel dropped', () => {
    // The other direction, scoped to the block that mirrors types/index.ts — the root
    // barrel also re-exports ManifestValidationResult straight from the validators.
    const mirrored = exportedTypeNames(path.join(SRC, 'index.ts'), './types/index.js')
    const dangling = [...mirrored].filter((name) => !typeExports.has(name))
    expect(dangling).toEqual([])
  })
})
