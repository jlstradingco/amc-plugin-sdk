import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'
import { findBannedImports, scanBannedImports } from '../lib/banned-imports.js'

describe('findBannedImports', () => {
  it('flags a CommonJS require of a banned module', () => {
    expect(findBannedImports(`const e = require('electron')`)).toEqual(['electron'])
  })

  it('flags an ESM default import — the form tsc emits for an ESM plugin', () => {
    // This is the gap the extraction closes: better-sqlite3 was previously only
    // banned via require(), so a compiled ESM plugin sailed through validate.
    expect(findBannedImports(`import Database from 'better-sqlite3'`)).toEqual(['better-sqlite3'])
  })

  it('flags a named / re-export from a banned module', () => {
    expect(findBannedImports(`export { Worker } from 'worker_threads'`)).toEqual(['worker_threads'])
  })

  it('flags a side-effect import', () => {
    expect(findBannedImports(`import 'electron'`)).toEqual(['electron'])
  })

  it('flags a dynamic import', () => {
    expect(findBannedImports(`await import('electron')`)).toEqual(['electron'])
  })

  it('flags the node: prefixed worker_threads spelling', () => {
    expect(findBannedImports(`import { Worker } from 'node:worker_threads'`)).toEqual([
      'node:worker_threads',
    ])
  })

  it('does not flag benign SDK / third-party imports', () => {
    const clean = [
      `import { PluginActivate } from '@agent-mc/plugin-sdk'`,
      `const lodash = require('lodash')`,
      `import fetch from 'node-fetch'`,
    ].join('\n')
    expect(findBannedImports(clean)).toEqual([])
  })

  it('does not false-match a substring in an unrelated module name', () => {
    // `electron-store` is a legitimate package that merely starts with "electron".
    expect(findBannedImports(`import Store from 'electron-store'`)).toEqual([])
  })

  it('reports each distinct banned module once', () => {
    const src = [
      `const e = require('electron')`,
      `import Database from 'better-sqlite3'`,
      `import { Worker } from 'worker_threads'`,
    ].join('\n')
    expect(findBannedImports(src).sort()).toEqual(['better-sqlite3', 'electron', 'worker_threads'])
  })
})

describe('scanBannedImports', () => {
  let dir: string

  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'banned-scan-'))
  })

  afterEach(() => {
    fs.rmSync(dir, { recursive: true, force: true })
  })

  it('returns nothing for a clean tree', () => {
    fs.writeFileSync(path.join(dir, 'index.js'), `import { thing } from '@agent-mc/plugin-sdk'`)
    expect(scanBannedImports(dir)).toEqual([])
  })

  it('finds banned imports in nested .js files and names the file + module', () => {
    const nested = path.join(dir, 'backend')
    fs.mkdirSync(nested)
    const offending = path.join(nested, 'db.js')
    fs.writeFileSync(offending, `import Database from 'better-sqlite3'`)
    const hits = scanBannedImports(dir)
    expect(hits).toHaveLength(1)
    expect(hits[0]).toContain('better-sqlite3')
    expect(hits[0]).toContain(offending)
  })

  it('ignores non-.js files (source .ts is compiled away before shipping)', () => {
    fs.writeFileSync(path.join(dir, 'notes.ts'), `import x from 'electron'`)
    expect(scanBannedImports(dir)).toEqual([])
  })

  it('scans a missing directory to an empty result', () => {
    expect(scanBannedImports(path.join(dir, 'does-not-exist'))).toEqual([])
  })
})
