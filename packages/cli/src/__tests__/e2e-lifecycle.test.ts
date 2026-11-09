import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import * as fs from 'node:fs'
import * as path from 'node:path'
import * as os from 'node:os'
import { execSync, spawnSync } from 'node:child_process'
import * as vm from 'node:vm'
import { readPackageFiles } from '../lib/package-selection.js'
import { findPageScriptProblems } from '../lib/page-scripts.js'

function setupPluginNodeModules(pluginDir: string) {
  const sdkPkg = path.resolve(__dirname, '../../../sdk')
  const nmSdk = path.join(pluginDir, 'node_modules', '@omniscio', 'plugin-sdk')
  fs.mkdirSync(nmSdk, { recursive: true })
  fs.cpSync(path.join(sdkPkg, 'dist'), path.join(nmSdk, 'dist'), { recursive: true })
  fs.copyFileSync(path.join(sdkPkg, 'package.json'), path.join(nmSdk, 'package.json'))

  const tsSrc = path.resolve(__dirname, '../../node_modules/typescript')
  const tsDest = path.join(pluginDir, 'node_modules', 'typescript')
  fs.symlinkSync(tsSrc, tsDest, 'junction')

  const binDir = path.join(pluginDir, 'node_modules', '.bin')
  fs.mkdirSync(binDir, { recursive: true })

  fs.writeFileSync(
    path.join(binDir, 'tsc'),
    '#!/bin/sh\nexec node "$( dirname "$0" )/../typescript/bin/tsc" "$@"\n',
    { mode: 0o755 },
  )

  fs.writeFileSync(
    path.join(binDir, 'tsc.CMD'),
    '@ECHO off\r\nnode "%~dp0\\..\\typescript\\bin\\tsc" %*\r\n',
  )
}

const SHELL_OUT_TIMEOUT_MS = 30_000
const BUILD_HOOK_TIMEOUT_MS = 120_000

describe('Plugin lifecycle E2E', () => {
  let tmpDir: string
  let pluginDir: string
  const monorepoRoot = path.resolve(__dirname, '../../../..')
  const cliDist = path.resolve(__dirname, '../../dist/index.js')

  beforeAll(() => {
    execSync('pnpm --filter @omniscio/plugin-sdk build', {
      cwd: monorepoRoot,
      stdio: 'pipe',
    })
    execSync('pnpm --filter @omniscio/plugin-cli build', {
      cwd: monorepoRoot,
      stdio: 'pipe',
    })

    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'amc-e2e-'))
    pluginDir = path.join(tmpDir, 'e2e-test-plugin')
  }, BUILD_HOOK_TIMEOUT_MS)

  afterAll(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true })
  })

  // Registration is only visible to argv, not to a unit test that imports the command
  // module: a `login` that exists but was never added to the program still answers
  // "unknown command 'login'" on the built CLI, which is the bug this covers.
  it('ships the login command on the built CLI', () => {
    const result = spawnSync(process.execPath, [cliDist, 'login', '--help'], { encoding: 'utf-8' })
    expect(result.stderr).not.toContain('unknown command')
    expect(result.status).toBe(0)
    expect(result.stdout).toContain('omniscio-plugin login')
  })

  it('creates a plugin with the with-backend template', () => {
    execSync(
      [
        `node "${cliDist}" create e2e-test-plugin`,
        '--template with-backend',
        '--display-name "E2E Test Plugin"',
        '--description "A test plugin"',
        '--author "Test Author"',
        '--category other',
        '--icon puzzle',
        '--skip-install',
        '--skip-git',
      ].join(' '),
      { cwd: tmpDir, stdio: 'pipe' },
    )

    expect(fs.existsSync(pluginDir)).toBe(true)
    expect(fs.existsSync(path.join(pluginDir, 'manifest.json'))).toBe(true)
    expect(fs.existsSync(path.join(pluginDir, 'src', 'ui', 'index.html'))).toBe(true)
    expect(fs.existsSync(path.join(pluginDir, 'src', 'backend', 'index.ts'))).toBe(true)
    expect(fs.existsSync(path.join(pluginDir, 'tsconfig.json'))).toBe(true)
    expect(fs.existsSync(path.join(pluginDir, 'package.json'))).toBe(true)
    expect(fs.existsSync(path.join(pluginDir, 'README.md'))).toBe(true)
  }, SHELL_OUT_TIMEOUT_MS)

  it('scaffolds only the Omniscio package names, reading the old bridge name as a fallback', () => {
    const files = fs
      .readdirSync(pluginDir, { recursive: true, encoding: 'utf-8' })
      .map((rel) => path.join(pluginDir, rel))
      .filter((file) => fs.statSync(file).isFile())
    const oldPackage = files.filter((file) => fs.readFileSync(file, 'utf-8').includes('@agent-mc'))
    expect(oldPackage, `scaffolded files naming the old @agent-mc packages: ${oldPackage.join(', ')}`).toEqual([])
    const ui = fs.readFileSync(path.join(pluginDir, 'src', 'ui', 'plugin.ts'), 'utf-8')
    expect(ui).toContain("from '@omniscio/plugin-sdk/browser'")
    expect(ui).toContain('window.Omniscio ?? window.AgentMC')
  })

  it('scaffolds a README describing the plugin', () => {
    const readme = fs.readFileSync(path.join(pluginDir, 'README.md'), 'utf-8')
    expect(readme).toContain('# E2E Test Plugin')
    expect(readme).toContain('npm run package')
  })

  it('manifest has correct v2 fields', () => {
    const manifest = JSON.parse(
      fs.readFileSync(path.join(pluginDir, 'manifest.json'), 'utf-8'),
    )
    expect(manifest.sdkVersion).toBe('2.0.0')
    expect(manifest.backend).toBeDefined()
    expect(manifest.backend.entryPoint).toBe('dist/backend/index.js')
    expect(manifest.plugin.id).toBe('e2e-test-plugin')
    expect(manifest.plugin.name).toBe('E2E Test Plugin')
    expect(manifest.plugin.author).toBe('Test Author')
    expect(manifest.plugin.description).toBe('A test plugin')
    expect(manifest.plugin.tags).toEqual(['other'])
    expect(manifest.ui.entryPoint).toBe('dist/ui/index.html')
  })

  it('scaffolds a package.json carrying the create metadata', () => {
    const pkg = JSON.parse(
      fs.readFileSync(path.join(pluginDir, 'package.json'), 'utf-8'),
    )
    expect(pkg.name).toBe('e2e-test-plugin')
    expect(pkg.description).toBe('A test plugin')
    expect(pkg.author).toBe('Test Author')
    expect(pkg.license).toBe('UNLICENSED')
    expect(pkg.scripts.build).toBe('omniscio-plugin build')
    expect(pkg.devDependencies['@omniscio/plugin-sdk']).toBeDefined()
    expect(pkg.devDependencies['@omniscio/plugin-cli']).toMatch(/^\^\d+\.\d+\.\d+/)
  })

  it('scaffolds a .gitignore that excludes env/secret files', () => {
    const gitignore = fs.readFileSync(path.join(pluginDir, '.gitignore'), 'utf-8')
    expect(gitignore).toContain('.env')
    expect(gitignore).toContain('!.env.example')
    expect(gitignore).toContain('node_modules/')
    expect(gitignore).toContain('dist/')
  })

  it('builds successfully', () => {
    setupPluginNodeModules(pluginDir)

    execSync(`node "${cliDist}" build`, { cwd: pluginDir, stdio: 'pipe' })

    expect(fs.existsSync(path.join(pluginDir, 'dist'))).toBe(true)
    expect(fs.existsSync(path.join(pluginDir, 'dist', 'ui', 'index.html'))).toBe(true)
    expect(fs.existsSync(path.join(pluginDir, 'dist', 'backend', 'index.js'))).toBe(true)
  }, SHELL_OUT_TIMEOUT_MS)

  it('build bundles the panel script so the page can load it, and leaves the backend as tsc wrote it', () => {
    const panel = fs.readFileSync(path.join(pluginDir, 'dist', 'ui', 'plugin.js'), 'utf-8')
    expect(() => new vm.Script(panel)).not.toThrow()
    expect(panel).not.toMatch(/^export /m)
    const backend = fs.readFileSync(path.join(pluginDir, 'dist', 'backend', 'index.js'), 'utf-8')
    expect(backend).toContain('export default activate')
  })

  it('validates successfully', () => {
    const output = execSync(`node "${cliDist}" validate`, {
      cwd: pluginDir,
      encoding: 'utf-8',
    })
    expect(output).toContain('All checks passed')
    expect(output).not.toContain('✗')
    expect(output).toContain('UI entry point exists (dist/ui/index.html)')
    expect(output).toContain('Backend entry point exists (dist/backend/index.js)')
  }, SHELL_OUT_TIMEOUT_MS)

  it('info lists the declared discoverability tags', () => {
    const output = execSync(`node "${cliDist}" info`, {
      cwd: pluginDir,
      encoding: 'utf-8',
    })
    expect(output).toContain('Tags:')
    expect(output).toContain('other')
  }, SHELL_OUT_TIMEOUT_MS)

  it('packages into .amcplugin', () => {
    execSync(`node "${cliDist}" package`, { cwd: pluginDir, stdio: 'pipe' })

    const files = fs.readdirSync(pluginDir).filter(f => f.endsWith('.amcplugin'))
    expect(files).toHaveLength(1)
    expect(files[0]).toBe('e2e-test-plugin-1.0.0.amcplugin')
  }, SHELL_OUT_TIMEOUT_MS)

  it('packages a panel script that loads, and rebuilds it the same way when dist/ is missing', () => {
    fs.rmSync(path.join(pluginDir, 'dist'), { recursive: true, force: true })
    execSync(`node "${cliDist}" package`, { cwd: pluginDir, stdio: 'pipe' })
    const archive = readPackageFiles(path.join(pluginDir, 'e2e-test-plugin-1.0.0.amcplugin'))
    expect(archive?.names).toContain('dist/ui/plugin.js')
    expect(findPageScriptProblems(archive!)).toEqual([])
  }, SHELL_OUT_TIMEOUT_MS)

  it('refuses to package a page that loads an ES module as a plain script', () => {
    const panel = path.join(pluginDir, 'dist', 'ui', 'plugin.js')
    const bundled = fs.readFileSync(panel, 'utf-8')
    fs.writeFileSync(panel, 'init();\nexport {};\n')
    try {
      const run = spawnSync(process.execPath, [cliDist, 'package'], { cwd: pluginDir, encoding: 'utf-8' })
      expect(run.status).toBe(1)
      expect(run.stderr).toContain('dist/ui/index.html loads dist/ui/plugin.js as a plain script')
    } finally {
      fs.writeFileSync(panel, bundled)
    }
  }, SHELL_OUT_TIMEOUT_MS)

  it('fails validate when dist/ is present but out of date, since package would ship it as-is', () => {
    fs.rmSync(path.join(pluginDir, 'dist', 'backend', 'index.js'))
    const run = spawnSync(process.execPath, [cliDist, 'validate'], { cwd: pluginDir, encoding: 'utf-8' })
    expect(run.status).toBe(1)
    expect(run.stderr).toContain('Backend entry point dist/backend/index.js is missing from dist/')
    expect(run.stdout).not.toContain('Backend entry point exists')
    expect(run.stdout).not.toContain('All checks passed')
  }, SHELL_OUT_TIMEOUT_MS)

  it('warns, and never claims the entry points exist, when validate runs with no dist/', () => {
    fs.rmSync(path.join(pluginDir, 'dist'), { recursive: true, force: true })
    const run = spawnSync(process.execPath, [cliDist, 'validate'], { cwd: pluginDir, encoding: 'utf-8' })
    expect(run.status).toBe(0)
    expect(run.stderr).toContain('UI entry point dist/ui/index.html is not built yet')
    expect(run.stderr).toContain('checked its source src/ui/index.html instead')
    expect(run.stderr).toContain('Backend entry point dist/backend/index.js is not built yet')
    expect(run.stderr).toContain('checked its source src/backend/index.ts instead')
    expect(run.stdout).not.toContain('UI entry point exists')
    expect(run.stdout).not.toContain('Backend entry point exists')
  }, SHELL_OUT_TIMEOUT_MS)
})

describe('Webview (flat-JS) plugin lifecycle E2E', () => {
  let tmpDir: string
  let pluginDir: string
  const cliDist = path.resolve(__dirname, '../../dist/index.js')

  beforeAll(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'amc-e2e-webview-'))
    pluginDir = path.join(tmpDir, 'webview-e2e-plugin')
  })

  afterAll(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true })
  })

  it('scaffolds a flat-JS plugin with no tsconfig or src/', () => {
    execSync(
      [
        `node "${cliDist}" create webview-e2e-plugin`,
        '--template webview',
        '--display-name "Webview E2E"',
        '--description "A flat webview plugin"',
        '--author "Test Author"',
        '--category other',
        '--icon puzzle',
        '--skip-install',
        '--skip-git',
      ].join(' '),
      { cwd: tmpDir, stdio: 'pipe' },
    )

    expect(fs.existsSync(path.join(pluginDir, 'ui', 'index.html'))).toBe(true)
    expect(fs.existsSync(path.join(pluginDir, 'ui', 'plugin.js'))).toBe(true)
    expect(fs.existsSync(path.join(pluginDir, 'tsconfig.json'))).toBe(false)
    expect(fs.existsSync(path.join(pluginDir, 'src'))).toBe(false)

    const manifest = JSON.parse(fs.readFileSync(path.join(pluginDir, 'manifest.json'), 'utf-8'))
    expect(manifest.ui.entryPoint).toBe('ui/index.html')
  }, SHELL_OUT_TIMEOUT_MS)

  it('packages root-layout without running tsc (no dist/ produced)', () => {
    execSync(`node "${cliDist}" package`, { cwd: pluginDir, stdio: 'pipe' })

    const files = fs.readdirSync(pluginDir).filter(f => f.endsWith('.amcplugin'))
    expect(files).toEqual(['webview-e2e-plugin-1.0.0.amcplugin'])
    expect(fs.existsSync(path.join(pluginDir, 'dist'))).toBe(false)
  }, SHELL_OUT_TIMEOUT_MS)

  const validateWith = (edit: (manifest: Record<string, unknown>) => void) => {
    const manifestPath = path.join(pluginDir, 'manifest.json')
    const original = fs.readFileSync(manifestPath, 'utf-8')
    const manifest = JSON.parse(original) as Record<string, unknown>
    edit(manifest)
    fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2))
    try {
      const run = spawnSync(process.execPath, [cliDist, 'validate'], { cwd: pluginDir, encoding: 'utf-8' })
      return { status: run.status, output: `${run.stdout}${run.stderr}` }
    } finally {
      fs.writeFileSync(manifestPath, original)
    }
  }

  it('validate fails a plugin that declares a command table', () => {
    const result = validateWith((manifest) => {
      manifest.storage = { collections: { commands: { columns: { type: 'text', payload: 'json', status: 'text' } } } }
    })
    expect(result.output).toContain('can hold a runnable command')
    expect(result.status).toBe(1)
  }, SHELL_OUT_TIMEOUT_MS)

  it('validate passes the same plugin once the table only lists jobs, and accepts boards.read', () => {
    const result = validateWith((manifest) => {
      manifest.storage = { collections: { commands: { columns: { label: 'text', status: 'text', error: 'text' } } } }
      manifest.permissions = ['boards.read']
    })
    expect(result.output).not.toContain('can hold a runnable command')
    expect(result.status).toBe(0)
  }, SHELL_OUT_TIMEOUT_MS)
})

describe('Widget plugin lifecycle E2E', () => {
  let tmpDir: string
  let pluginDir: string
  const cliDist = path.resolve(__dirname, '../../dist/index.js')

  beforeAll(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'amc-e2e-widget-'))
    pluginDir = path.join(tmpDir, 'widget-e2e-plugin')
  })

  afterAll(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true })
  })

  it('scaffolds a flat widget plugin with a popover page and the two permissions', () => {
    execSync(
      [
        `node "${cliDist}" create widget-e2e-plugin`,
        '--template widget',
        '--display-name "Widget E2E"',
        '--description "A titlebar widget plugin"',
        '--author "Test Author"',
        '--category other',
        '--skip-install',
        '--skip-git',
      ].join(' '),
      { cwd: tmpDir, stdio: 'pipe' },
    )

    expect(fs.existsSync(path.join(pluginDir, 'ui', 'index.html'))).toBe(true)
    expect(fs.existsSync(path.join(pluginDir, 'ui', 'plugin.js'))).toBe(true)
    expect(fs.existsSync(path.join(pluginDir, 'ui', 'widget.html'))).toBe(true)
    expect(fs.existsSync(path.join(pluginDir, 'tsconfig.json'))).toBe(false)

    const manifest = JSON.parse(fs.readFileSync(path.join(pluginDir, 'manifest.json'), 'utf-8'))
    expect(manifest.permissions).toEqual(['chrome', 'chrome.widget'])
    expect(manifest.ui.widget.entryPoint).toBe('ui/widget.html')

    const script = fs.readFileSync(path.join(pluginDir, 'ui', 'plugin.js'), 'utf-8')
    expect(script).toContain('amc.widget.set')
  }, SHELL_OUT_TIMEOUT_MS)

  it('passes validate, including the widget entry point check', () => {
    const out = execSync(`node "${cliDist}" validate`, { cwd: pluginDir, stdio: 'pipe' }).toString()
    expect(out).toContain('Widget entry point exists')
  }, SHELL_OUT_TIMEOUT_MS)

  it('fails validate when the widget page is missing from disk', () => {
    const page = path.join(pluginDir, 'ui', 'widget.html')
    const saved = fs.readFileSync(page)
    fs.rmSync(page)
    try {
      expect(() => execSync(`node "${cliDist}" validate`, { cwd: pluginDir, stdio: 'pipe' })).toThrow()
    } finally {
      fs.writeFileSync(page, saved)
    }
  }, SHELL_OUT_TIMEOUT_MS)

  it('packages ui/widget.html into the archive', () => {
    execSync(`node "${cliDist}" package`, { cwd: pluginDir, stdio: 'pipe' })

    const files = fs.readdirSync(pluginDir).filter((f) => f.endsWith('.amcplugin'))
    expect(files).toEqual(['widget-e2e-plugin-1.0.0.amcplugin'])
    const archive = fs.readFileSync(path.join(pluginDir, files[0]!))
    expect(archive.includes('ui/widget.html')).toBe(true)
  }, SHELL_OUT_TIMEOUT_MS)
})
