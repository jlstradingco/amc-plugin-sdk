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

  // child_process is the ban the docs have always promised (README, getting-started,
  // publishing, cli reference) but the scan never implemented. A plugin backend runs
  // under Node's --permission, which denies spawning, so shelling out to a CLI is not merely
  // discouraged — such a plugin can pass review, publish, install, and never run.
  it('flags the node: prefixed child_process spelling — the form tsc emits', () => {
    expect(findBannedImports(`import { spawn } from 'node:child_process'`)).toEqual([
      'node:child_process',
    ])
  })

  it('flags the bare child_process spelling', () => {
    expect(findBannedImports(`import { execFile } from 'child_process'`)).toEqual([
      'child_process',
    ])
  })

  it('flags a CommonJS require of child_process', () => {
    expect(findBannedImports(`const { spawn } = require('child_process')`)).toEqual([
      'child_process',
    ])
  })

  it('flags a side-effect import of child_process', () => {
    expect(findBannedImports(`import 'node:child_process'`)).toEqual(['node:child_process'])
  })

  it('flags a dynamic import of child_process', () => {
    expect(findBannedImports(`await import('node:child_process')`)).toEqual([
      'node:child_process',
    ])
  })

  it('reports the two child_process spellings as distinct modules, each once', () => {
    // The `node:` prefix lives INSIDE the quotes, so the bare pattern cannot also match
    // the prefixed spelling — neither entry double-reports the other.
    const src = [
      `const { spawn } = require('child_process')`,
      `import { execFile } from 'node:child_process'`,
    ].join('\n')
    expect(findBannedImports(src).sort()).toEqual(['child_process', 'node:child_process'])
  })

  it('does not false-match child_process-promise, a real npm package', () => {
    expect(findBannedImports(`import cp from 'child_process-promise'`)).toEqual([])
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

  it('scans .mjs and .cjs files, which are the same runtime code as .js', () => {
    fs.writeFileSync(path.join(dir, 'a.mjs'), `import { spawn } from 'node:child_process'`)
    fs.writeFileSync(path.join(dir, 'b.cjs'), `const e = require('electron')`)
    const hits = scanBannedImports(dir).sort()
    expect(hits).toHaveLength(2)
    expect(hits[0]).toContain('a.mjs')
    expect(hits[1]).toContain('b.cjs')
  })

  it('scans a single FILE target directly, not only directories', () => {
    // A flat plugin can declare backend.entryPoint: "server.js" at the package root, so the
    // thing handed to the scanner is the file itself.
    const file = path.join(dir, 'server.js')
    fs.writeFileSync(file, `const cp = require('child_process')`)
    const hits = scanBannedImports(file)
    expect(hits).toHaveLength(1)
    expect(hits[0]).toContain(file)
    expect(hits[0]).toContain('child_process')
  })

  it('ignores a single file target that is not JavaScript', () => {
    const file = path.join(dir, 'notes.txt')
    fs.writeFileSync(file, `require('child_process')`)
    expect(scanBannedImports(file)).toEqual([])
  })

  it('scans a missing directory to an empty result', () => {
    expect(scanBannedImports(path.join(dir, 'does-not-exist'))).toEqual([])
  })

  it('names the file and the module for a nested child_process import', () => {
    // This is the exact shape `validate` must report so an author can find the culprit:
    // github-integration shipped three such files and validate said "No banned imports".
    const nested = path.join(dir, 'backend', 'gh')
    fs.mkdirSync(nested, { recursive: true })
    const offending = path.join(nested, 'gh-run.js')
    fs.writeFileSync(offending, `import { spawn } from 'node:child_process'\nexport const x = 1\n`)
    const hits = scanBannedImports(dir)
    expect(hits).toHaveLength(1)
    expect(hits[0]).toContain('node:child_process')
    expect(hits[0]).toContain(offending)
  })
})
