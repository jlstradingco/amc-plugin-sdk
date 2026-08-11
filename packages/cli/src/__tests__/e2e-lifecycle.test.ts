import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import * as fs from 'node:fs'
import * as path from 'node:path'
import * as os from 'node:os'
import { execSync } from 'node:child_process'

/**
 * Wire up a scaffolded plugin's node_modules with the SDK and TypeScript
 * from the monorepo, so tsc / npx tsc works without npm install.
 */
function setupPluginNodeModules(pluginDir: string) {
  const sdkPkg = path.resolve(__dirname, '../../../sdk')
  // Install under the SDK's real scope so the scaffolded plugin's
  // `import ... from '@agent-mc/plugin-sdk'` resolves from its OWN node_modules.
  // (Previously '@amc' — a stale pre-rename scope — which only resolved locally
  // because Windows module resolution walked up into the monorepo; a clean
  // Linux /tmp runner has nothing above it, so tsc failed to find the module.)
  const nmSdk = path.join(pluginDir, 'node_modules', '@agent-mc', 'plugin-sdk')
  fs.mkdirSync(nmSdk, { recursive: true })
  fs.cpSync(path.join(sdkPkg, 'dist'), path.join(nmSdk, 'dist'), { recursive: true })
  fs.copyFileSync(path.join(sdkPkg, 'package.json'), path.join(nmSdk, 'package.json'))

  // typescript -- junction to the CLI package's copy (fast, no admin on Windows)
  const tsSrc = path.resolve(__dirname, '../../node_modules/typescript')
  const tsDest = path.join(pluginDir, 'node_modules', 'typescript')
  fs.symlinkSync(tsSrc, tsDest, 'junction')

  // .bin/tsc shim so `npx tsc` resolves locally
  const binDir = path.join(pluginDir, 'node_modules', '.bin')
  fs.mkdirSync(binDir, { recursive: true })

  // Shell shim (Git Bash / MSYS)
  fs.writeFileSync(
    path.join(binDir, 'tsc'),
    '#!/bin/sh\nexec node "$( dirname "$0" )/../typescript/bin/tsc" "$@"\n',
    { mode: 0o755 },
  )

  // CMD shim (Windows)
  fs.writeFileSync(
    path.join(binDir, 'tsc.CMD'),
    '@ECHO off\r\nnode "%~dp0\\..\\typescript\\bin\\tsc" %*\r\n',
  )
}

/**
 * Every test below shells out to the built CLI, and two of them run a real
 * `tsc`. Vitest's defaults (5s per test, 10s per hook) are sized for unit tests
 * and are not enough for a subprocess compile: `builds successfully` measures
 * ~1.6s on an idle machine but exceeded 5s — and failed the suite — on a loaded
 * one, roughly 40% of runs. A timeout there is indistinguishable at a glance
 * from a real regression, so the release gate in RELEASING.md was reporting a
 * colour that depended on machine load.
 *
 * These budgets are deliberately generous: they exist to stop a slow box
 * failing the build, not to assert performance. Anything approaching them is a
 * genuine hang.
 */
const SHELL_OUT_TIMEOUT_MS = 30_000
/** `beforeAll` builds two workspace packages via pnpm, which dwarfs any single test. */
const BUILD_HOOK_TIMEOUT_MS = 120_000

describe('Plugin lifecycle E2E', () => {
  let tmpDir: string
  let pluginDir: string
  const monorepoRoot = path.resolve(__dirname, '../../../..')
  const cliDist = path.resolve(__dirname, '../../dist/index.js')

  beforeAll(() => {
    // Build SDK and CLI so dist/ artifacts are current
    execSync('pnpm --filter @agent-mc/plugin-sdk build', {
      cwd: monorepoRoot,
      stdio: 'pipe',
    })
    execSync('pnpm --filter @agent-mc/plugin-cli build', {
      cwd: monorepoRoot,
      stdio: 'pipe',
    })

    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'amc-e2e-'))
    pluginDir = path.join(tmpDir, 'e2e-test-plugin')
  }, BUILD_HOOK_TIMEOUT_MS)

  afterAll(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true })
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

  it('scaffolds a README describing the plugin', () => {
    const readme = fs.readFileSync(path.join(pluginDir, 'README.md'), 'utf-8')
    expect(readme).toContain('# E2E Test Plugin')
    expect(readme).toContain('npm run package')
  })

  it('manifest has correct v2 fields', () => {
    const manifest = JSON.parse(
      fs.readFileSync(path.join(pluginDir, 'manifest.json'), 'utf-8'),
    )
    expect(manifest.sdkVersion).toBe('^2.0.0')
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
    expect(pkg.scripts.build).toBe('tsc')
    expect(pkg.devDependencies['@agent-mc/plugin-sdk']).toBeDefined()
  })

  it('scaffolds a .gitignore that excludes env/secret files', () => {
    const gitignore = fs.readFileSync(path.join(pluginDir, '.gitignore'), 'utf-8')
    expect(gitignore).toContain('.env')
    expect(gitignore).toContain('!.env.example')
    expect(gitignore).toContain('node_modules/')
    expect(gitignore).toContain('dist/')
  })

  it('builds successfully', () => {
    // Since we used --skip-install, wire up node_modules manually so
    // tsc can resolve '@agent-mc/plugin-sdk' types and the 'typescript' compiler
    setupPluginNodeModules(pluginDir)

    execSync(`node "${cliDist}" build`, { cwd: pluginDir, stdio: 'pipe' })

    expect(fs.existsSync(path.join(pluginDir, 'dist'))).toBe(true)
    expect(fs.existsSync(path.join(pluginDir, 'dist', 'ui', 'index.html'))).toBe(true)
    expect(fs.existsSync(path.join(pluginDir, 'dist', 'backend', 'index.js'))).toBe(true)
  }, SHELL_OUT_TIMEOUT_MS)

  it('validates successfully', () => {
    const output = execSync(`node "${cliDist}" validate`, {
      cwd: pluginDir,
      encoding: 'utf-8',
    })
    // `validate` prints `✓ <check>` per check via ok() and the summary line
    // `✓ All checks passed` on success; failures go to stderr via fail() and
    // exit non-zero (execSync would then throw). Assert the real success signal
    // rather than a literal 'PASS'/'FAIL' the command never emits.
    expect(output).toContain('All checks passed')
    expect(output).not.toContain('✗')
  }, SHELL_OUT_TIMEOUT_MS)

  it('info lists the declared discoverability tags', () => {
    const output = execSync(`node "${cliDist}" info`, {
      cwd: pluginDir,
      encoding: 'utf-8',
    })
    // The scaffold seeds `tags: [<category>]`, so `--category other` yields `other`.
    expect(output).toContain('Tags:')
    expect(output).toContain('other')
  }, SHELL_OUT_TIMEOUT_MS)

  it('packages into .amcplugin', () => {
    execSync(`node "${cliDist}" package`, { cwd: pluginDir, stdio: 'pipe' })

    const files = fs.readdirSync(pluginDir).filter(f => f.endsWith('.amcplugin'))
    expect(files).toHaveLength(1)
    expect(files[0]).toBe('e2e-test-plugin-1.0.0.amcplugin')
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
    // Flat plugins must never trigger a TypeScript compile.
    expect(fs.existsSync(path.join(pluginDir, 'dist'))).toBe(false)
  }, SHELL_OUT_TIMEOUT_MS)
})
