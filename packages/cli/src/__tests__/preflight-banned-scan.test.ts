import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import * as fs from 'node:fs'
import * as path from 'node:path'
import * as os from 'node:os'
import { summarizePreflight } from '../lib/publish-preflight.js'
import { bannedImportsResult } from '../commands/preflight.js'

// `runPreflight` as a whole has no unit tests — it does fs + network I/O — so proving
// the pure check in isolation would leave "publish is actually gated" resting on READING
// the wiring and joining it up by eye.
//
// These tests call the SHIPPED function, not a local reproduction of it. That matters:
// the first cut of this file defined its own three-line copy of the wiring, and the copy
// had already drifted from production inside the same commit — production relativised
// the hits, the copy did not — so the tests were green against code that no longer
// shipped. Import the real thing; a mirror can pass while the original is broken.
const preflightBannedVerdict = bannedImportsResult

let tmp: string

beforeEach(() => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'amc-preflight-scan-'))
})

afterEach(() => {
  fs.rmSync(tmp, { recursive: true, force: true })
})

describe('preflight banned-import gate (composed end to end)', () => {
  it('blocks a TypeScript plugin whose dist/ shells out to a child process', () => {
    fs.writeFileSync(path.join(tmp, 'tsconfig.json'), '{}')
    const nested = path.join(tmp, 'dist', 'backend')
    fs.mkdirSync(nested, { recursive: true })
    fs.writeFileSync(path.join(nested, 'run.js'), `import { spawn } from 'node:child_process'\n`)

    const verdict = preflightBannedVerdict(tmp, {})
    expect(verdict.status).toBe('fail')
    expect(verdict.message).toContain('run.js')
    // This is the exact value publish.ts exits 1 on.
    expect(summarizePreflight([verdict]).hasFailure).toBe(true)
  })

  it('lets a clean TypeScript plugin through', () => {
    fs.writeFileSync(path.join(tmp, 'tsconfig.json'), '{}')
    fs.mkdirSync(path.join(tmp, 'dist'))
    fs.writeFileSync(path.join(tmp, 'dist', 'index.js'), `export const activate = () => {}\n`)

    const verdict = preflightBannedVerdict(tmp, {})
    expect(verdict.status).toBe('pass')
    expect(summarizePreflight([verdict]).hasFailure).toBe(false)
  })

  it('blocks a FLAT plugin too — its as-authored files are scanned, not a dist/ it never had', () => {
    fs.writeFileSync(path.join(tmp, 'manifest.json'), '{}')
    fs.mkdirSync(path.join(tmp, 'ui'))
    fs.writeFileSync(path.join(tmp, 'ui', 'app.js'), `const cp = require('child_process')\n`)

    const verdict = preflightBannedVerdict(tmp, { ui: { entryPoint: 'ui/app.js' } })
    expect(verdict.status).toBe('fail')
    expect(verdict.message).toContain('app.js')
  })

  it('warns instead of passing when a packaged plugin has no built output left to scan', () => {
    // The evasion/foot-gun shape: a .amcplugin exists from an earlier build, but dist/
    // has since been removed. Nothing to inspect must never read as "all clear".
    fs.writeFileSync(path.join(tmp, 'tsconfig.json'), '{}')
    fs.writeFileSync(path.join(tmp, 'plugin.amcplugin'), 'stub')

    const verdict = preflightBannedVerdict(tmp, {})
    expect(verdict.status).toBe('warn')
    expect(summarizePreflight([verdict]).hasFailure).toBe(false)
  })

  it('warns instead of passing a flat plugin whose only root file is its README', () => {
    // The README is packaged for the listing, but there is no code in it to scan, so it
    // must not stand in for the entry-point folder that is missing here.
    fs.writeFileSync(path.join(tmp, 'manifest.json'), '{}')
    fs.writeFileSync(path.join(tmp, 'README.md'), '# My plugin\n')

    const verdict = preflightBannedVerdict(tmp, { ui: { entryPoint: 'ui/index.html' } })
    expect(verdict.status).toBe('warn')
  })

  it('is not vacuous — the same tree passes once the banned import is removed', () => {
    fs.writeFileSync(path.join(tmp, 'tsconfig.json'), '{}')
    fs.mkdirSync(path.join(tmp, 'dist'))
    const file = path.join(tmp, 'dist', 'index.js')

    fs.writeFileSync(file, `import { execFile } from 'child_process'\n`)
    expect(preflightBannedVerdict(tmp, {}).status).toBe('fail')

    fs.writeFileSync(file, `import fetch from 'node-fetch'\n`)
    expect(preflightBannedVerdict(tmp, {}).status).toBe('pass')
  })
})

describe('preflight banned-import message readability', () => {
  it('names hits relative to the project, not as absolute paths', () => {
    // Three absolute hits run to ~250 chars of mostly-repeated prefix on one rendered
    // line. `validate` prints one hit per line and can afford the full path; the
    // preflight table cannot.
    fs.writeFileSync(path.join(tmp, 'tsconfig.json'), '{}')
    const nested = path.join(tmp, 'dist', 'backend')
    fs.mkdirSync(nested, { recursive: true })
    fs.writeFileSync(path.join(nested, 'run.js'), `import { spawn } from 'node:child_process'\n`)

    // Asserted against the SHIPPED function — if the relativising step were dropped from
    // production, this fails. A version that re-derived the hits here could not tell.
    const verdict = bannedImportsResult(tmp, {})

    expect(verdict.message).not.toContain(tmp)
    expect(verdict.message).toContain(path.join('dist', 'backend', 'run.js'))
  })
})
