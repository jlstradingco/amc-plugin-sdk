import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import * as fs from 'node:fs'
import * as path from 'node:path'
import * as os from 'node:os'
import {
  classicScriptSrcs,
  findPageScriptProblems,
  pageScriptsResult,
  type PackageFiles
} from '../lib/page-scripts.js'

const TSC_SCAFFOLD_OUTPUT = "const amc = window.AgentMC;\nasync function init() {}\ninit();\nexport {};\n"
const BUNDLED_OUTPUT = '"use strict";\n(() => {\n  var amc = window.AgentMC;\n})();\n'
const PAGE = '<!DOCTYPE html><html><body><script src="plugin.js"></script></body></html>'
const TS_MANIFEST = { ui: { entryPoint: 'dist/ui/index.html' } }

type ArchiverModule = { ZipArchive: new (opts: { zlib: { level: number } }) => import('archiver').Archiver }

let dir: string

function write(rel: string, content: string): void {
  const file = path.join(dir, rel)
  fs.mkdirSync(path.dirname(file), { recursive: true })
  fs.writeFileSync(file, content)
}

function files(entries: Record<string, string>): PackageFiles {
  return { names: Object.keys(entries), read: (name) => entries[name] ?? null }
}

async function zip(rel: string, entries: Record<string, string>): Promise<string> {
  const out = path.join(dir, rel)
  const { ZipArchive } = (await import('archiver')) as unknown as ArchiverModule
  const archive = new ZipArchive({ zlib: { level: 9 } })
  const stream = fs.createWriteStream(out)
  await new Promise<void>((resolve, reject) => {
    stream.on('close', resolve)
    archive.on('error', reject)
    archive.pipe(stream)
    for (const [name, content] of Object.entries(entries)) archive.append(content, { name })
    archive.finalize()
  })
  return out
}

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'amc-page-scripts-'))
})

afterEach(() => {
  fs.rmSync(dir, { recursive: true, force: true })
})

describe('classicScriptSrcs', () => {
  it('returns the src of plain script tags in any quoting style', () => {
    const html = `<script src="a.js"></script><script defer src='b.js'></script><script src=c.js></script>`
    expect(classicScriptSrcs(html)).toEqual(['a.js', 'b.js', 'c.js'])
  })

  it('skips module scripts, inline scripts and anything not loaded from the plugin itself', () => {
    const html = [
      '<script type="module" src="m.js"></script>',
      '<script type=module src="m2.js"></script>',
      '<script>console.log(1)</script>',
      '<script src="https://cdn.example.com/x.js"></script>',
      '<script src="//cdn.example.com/y.js"></script>',
      '<script src="/abs.js"></script>',
      '<script src="data:text/javascript,1"></script>',
      '<script src="ok.js?v=2"></script>'
    ].join('')
    expect(classicScriptSrcs(html)).toEqual(['ok.js'])
  })

  it('reads src and type only as whole attribute names, never data-src or data-type', () => {
    const html = '<script data-src="lazy.js"></script><script data-type="module" src="plain.js"></script>'
    expect(classicScriptSrcs(html)).toEqual(['plain.js'])
  })
})

describe('findPageScriptProblems', () => {
  it('flags the untouched scaffold build: tsc output loaded as a plain script', () => {
    const problems = findPageScriptProblems(files({ 'dist/ui/index.html': PAGE, 'dist/ui/plugin.js': TSC_SCAFFOLD_OUTPUT }))
    expect(problems).toHaveLength(1)
    expect(problems[0]).toMatchObject({ page: 'dist/ui/index.html', script: 'dist/ui/plugin.js', reason: 'not-a-classic-script' })
    expect(problems[0].detail).toMatch(/export/)
  })

  it('accepts a bundled script and a dynamic import, which plain scripts allow', () => {
    const lazy = '"use strict";\n(() => { import("./later.js").catch(() => {}) })();\n'
    expect(findPageScriptProblems(files({ 'dist/ui/index.html': PAGE, 'dist/ui/plugin.js': lazy }))).toEqual([])
  })

  it('reports a page script that is not in what ships', () => {
    expect(findPageScriptProblems(files({ 'dist/ui/index.html': PAGE }))).toEqual([
      { page: 'dist/ui/index.html', script: 'dist/ui/plugin.js', reason: 'missing' }
    ])
  })

  it('resolves a script in a sibling folder and ignores one that climbs out of the package', () => {
    const page = '<script src="../shared/app.js"></script><script src="../../../../etc/passwd"></script>'
    const problems = findPageScriptProblems(files({ 'dist/ui/index.html': page, 'dist/shared/app.js': 'export const a = 1\n' }))
    expect(problems.map((p) => p.script)).toEqual(['dist/shared/app.js'])
  })
})

describe('pageScriptsResult on the plugin folder', () => {
  it('fails a TypeScript plugin whose dist page loads an ES module, and names the build fix', () => {
    write('tsconfig.json', '{}')
    write('dist/ui/index.html', PAGE)
    write('dist/ui/plugin.js', TSC_SCAFFOLD_OUTPUT)
    const result = pageScriptsResult(dir, TS_MANIFEST)
    expect(result.status).toBe('fail')
    expect(result.message).toContain('dist/ui/index.html loads dist/ui/plugin.js as a plain script')
    expect(result.suggestion).toContain("Run 'amc-plugin build'")
  })

  it('checks every shipped page, the titlebar widget page included', () => {
    write('tsconfig.json', '{}')
    write('dist/ui/index.html', PAGE)
    write('dist/ui/plugin.js', BUNDLED_OUTPUT)
    write('dist/ui/widget.html', '<script src="widget.js"></script>')
    write('dist/ui/widget.js', 'export const w = 1\n')
    const result = pageScriptsResult(dir, TS_MANIFEST)
    expect(result.status).toBe('fail')
    expect(result.message).toContain('dist/ui/widget.html loads dist/ui/widget.js')
    expect(result.message).not.toContain('index.html')
  })

  it('passes a flat plugin whose plain-JS page script ships as authored', () => {
    write('ui/index.html', PAGE)
    write('ui/plugin.js', 'const amc = window.AgentMC\nasync function init() {}\ninit()\n')
    expect(pageScriptsResult(dir, { ui: { entryPoint: 'ui/index.html' } })).toEqual({
      name: 'Panel scripts',
      status: 'pass',
      message: 'Every page script loads (1 page(s) checked)'
    })
  })

  it('tells a flat plugin author to fix the script itself, since build does not touch flat plugins', () => {
    write('ui/index.html', PAGE)
    write('ui/plugin.js', "import './x.js'\n")
    const result = pageScriptsResult(dir, { ui: { entryPoint: 'ui/index.html' } })
    expect(result.status).toBe('fail')
    expect(result.suggestion).toContain('remove import/export')
    expect(result.suggestion).not.toContain('amc-plugin build')
  })

  it('passes a backend-only plugin with no pages', () => {
    write('tsconfig.json', '{}')
    write('dist/backend/index.js', 'export default () => ({})\n')
    expect(pageScriptsResult(dir, { backend: { entryPoint: 'dist/backend/index.js' } }).status).toBe('pass')
  })
})

describe('pageScriptsResult on a packaged .amcplugin', () => {
  it('checks the archive that will be uploaded, not the rebuilt folder beside it', async () => {
    write('tsconfig.json', '{}')
    write('dist/ui/index.html', PAGE)
    write('dist/ui/plugin.js', BUNDLED_OUTPUT)
    const stale = await zip('my-plugin-1.0.0.amcplugin', {
      'manifest.json': '{}',
      'dist/ui/index.html': PAGE,
      'dist/ui/plugin.js': TSC_SCAFFOLD_OUTPUT
    })
    expect(pageScriptsResult(dir, TS_MANIFEST).status).toBe('pass')
    const result = pageScriptsResult(dir, TS_MANIFEST, stale)
    expect(result.status).toBe('fail')
    expect(result.message).toContain('dist/ui/plugin.js as a plain script')
  })

  it('passes a freshly packaged archive whose page script loads', async () => {
    write('tsconfig.json', '{}')
    const good = await zip('my-plugin-1.0.0.amcplugin', { 'dist/ui/index.html': PAGE, 'dist/ui/plugin.js': BUNDLED_OUTPUT })
    expect(pageScriptsResult(dir, TS_MANIFEST, good).status).toBe('pass')
  })

  it('fails cleanly when the archive index is intact but an entry is damaged', async () => {
    write('tsconfig.json', '{}')
    const file = await zip('my-plugin-1.0.0.amcplugin', { 'dist/ui/index.html': PAGE, 'dist/ui/plugin.js': BUNDLED_OUTPUT.repeat(50) })
    const bytes = fs.readFileSync(file)
    const dataStart = bytes.indexOf('dist/ui/plugin.js') + 'dist/ui/plugin.js'.length
    bytes.fill(0xff, dataStart, dataStart + 40)
    fs.writeFileSync(file, bytes)
    expect(pageScriptsResult(dir, TS_MANIFEST, file)).toMatchObject({
      status: 'fail',
      message: 'Could not read my-plugin-1.0.0.amcplugin to check its page scripts'
    })
  })

  it('fails, rather than passing silently, when the archive cannot be read', () => {
    write('broken.amcplugin', 'not a zip')
    const result = pageScriptsResult(dir, TS_MANIFEST, path.join(dir, 'broken.amcplugin'))
    expect(result).toMatchObject({ status: 'fail', message: 'Could not read broken.amcplugin to check its page scripts' })
  })
})
