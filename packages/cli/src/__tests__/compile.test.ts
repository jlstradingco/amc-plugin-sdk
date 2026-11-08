import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import * as fs from 'node:fs'
import * as path from 'node:path'
import * as os from 'node:os'
import * as vm from 'node:vm'
import { bundleUiScripts, planUiBundles } from '../lib/compile.js'
import { pageScriptsResult } from '../lib/page-scripts.js'

const PAGE = '<!DOCTYPE html><html><body><script src="plugin.js"></script></body></html>'
const ESBUILD_TEST_TIMEOUT_MS = 60_000

let dir: string

function write(rel: string, content: string): void {
  const file = path.join(dir, rel)
  fs.mkdirSync(path.dirname(file), { recursive: true })
  fs.writeFileSync(file, content)
}

function runAsPlainScript(rel: string): Record<string, unknown> {
  const body: Record<string, string> = {}
  const window = { AgentMC: { id: 'bridge' } }
  const document = { body: { setAttribute: (k: string, v: string) => { body[k] = v } } }
  vm.runInNewContext(fs.readFileSync(path.join(dir, rel), 'utf-8'), { window, document })
  return body
}

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'amc-compile-'))
  write('src/ui/plugin.ts', [
    "import type { AgentMC } from '@agent-mc/plugin-sdk/browser'",
    "import { greet } from './helper'",
    'const amc = (window as unknown as { AgentMC: AgentMC }).AgentMC',
    "document.body.setAttribute('data-greeting', greet((amc as unknown as { id: string }).id))",
    ''
  ].join('\n'))
  write('src/ui/helper.ts', 'export const greet = (who: string): string => `hello ${who}`\n')
  write('tsconfig.json', '{}')
  write('dist/ui/index.html', PAGE)
  write('dist/ui/plugin.js', "import { greet } from './helper';\nexport {};\n")
})

afterEach(() => {
  fs.rmSync(dir, { recursive: true, force: true })
})

describe('bundleUiScripts', { timeout: ESBUILD_TEST_TIMEOUT_MS }, () => {
  it('turns a two-file TypeScript UI into one script that runs as the page declares it', () => {
    const bundles = bundleUiScripts(dir)
    expect(bundles.map(b => path.relative(dir, b.outfile))).toEqual([path.join('dist', 'ui', 'plugin.js')])
    expect(runAsPlainScript('dist/ui/plugin.js')).toEqual({ 'data-greeting': 'hello bridge' })
    expect(pageScriptsResult(dir, { ui: { entryPoint: 'dist/ui/index.html' } }).status).toBe('pass')
  })

  it('bundles a script shared by two pages once', () => {
    write('dist/ui/widget.html', PAGE)
    expect(planUiBundles(dir)).toHaveLength(1)
  })

  it('leaves alone a page script with no source in src/ui and a module script', () => {
    write('dist/ui/index.html', '<script src="vendor.js"></script><script type="module" src="plugin.js"></script>')
    write('dist/ui/vendor.js', 'window.v = 1\n')
    expect(bundleUiScripts(dir)).toEqual([])
    expect(fs.readFileSync(path.join(dir, 'dist/ui/vendor.js'), 'utf-8')).toBe('window.v = 1\n')
  })

  it('ships a vendored plain-JS library byte for byte instead of rewrapping it', () => {
    const umd = "(function (root, factory) { if (typeof exports === 'object') module.exports = factory(); else root.Chart = factory() })(this, function () { return 1 })\n"
    write('src/ui/chart.umd.js', umd)
    write('dist/ui/chart.umd.js', umd)
    write('dist/ui/index.html', '<script src="chart.umd.js"></script><script src="plugin.js"></script>')
    expect(bundleUiScripts(dir).map(b => path.basename(b.outfile))).toEqual(['plugin.js'])
    expect(fs.readFileSync(path.join(dir, 'dist/ui/chart.umd.js'), 'utf-8')).toBe(umd)
  })

  it('maps a page in a subfolder to the matching source subfolder', () => {
    write('src/ui/settings/page.ts', "document.body.setAttribute('data-page', 'settings')\n")
    write('dist/ui/settings/index.html', '<script src="page.js"></script>')
    const outfiles = bundleUiScripts(dir).map(b => path.relative(dir, b.outfile)).sort()
    expect(outfiles).toEqual([path.join('dist', 'ui', 'plugin.js'), path.join('dist', 'ui', 'settings', 'page.js')])
    expect(runAsPlainScript('dist/ui/settings/page.js')).toEqual({ 'data-page': 'settings' })
  })

  it('throws when a UI import cannot be resolved, so build fails instead of shipping', () => {
    write('src/ui/plugin.ts', "import { gone } from './missing'\nconsole.log(gone)\n")
    expect(() => bundleUiScripts(dir)).toThrow(/missing/)
  })
})
