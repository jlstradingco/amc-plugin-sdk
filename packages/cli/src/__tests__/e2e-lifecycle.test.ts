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
  const nmSdk = path.join(pluginDir, 'node_modules', '@amc', 'plugin-sdk')
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
  })

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
  })

  it('manifest has correct v2 fields', () => {
    const manifest = JSON.parse(
      fs.readFileSync(path.join(pluginDir, 'manifest.json'), 'utf-8'),
    )
    expect(manifest.sdkVersion).toBe('^1.0.0')
    expect(manifest.backend).toBeDefined()
    expect(manifest.backend.entryPoint).toBe('dist/backend/index.js')
    expect(manifest.plugin.id).toBe('e2e-test-plugin')
    expect(manifest.plugin.name).toBe('E2E Test Plugin')
    expect(manifest.plugin.author).toBe('Test Author')
    expect(manifest.plugin.description).toBe('A test plugin')
    expect(manifest.ui.entryPoint).toBe('dist/ui/index.html')
  })

  it('builds successfully', () => {
    // Since we used --skip-install, wire up node_modules manually so
    // tsc can resolve '@agent-mc/plugin-sdk' types and the 'typescript' compiler
    setupPluginNodeModules(pluginDir)

    execSync(`node "${cliDist}" build`, { cwd: pluginDir, stdio: 'pipe' })

    expect(fs.existsSync(path.join(pluginDir, 'dist'))).toBe(true)
    expect(fs.existsSync(path.join(pluginDir, 'dist', 'ui', 'index.html'))).toBe(true)
    expect(fs.existsSync(path.join(pluginDir, 'dist', 'backend', 'index.js'))).toBe(true)
  })

  it('validates successfully', () => {
    const output = execSync(`node "${cliDist}" validate`, {
      cwd: pluginDir,
      encoding: 'utf-8',
    })
    expect(output).toContain('PASS')
    expect(output).not.toContain('FAIL')
  })

  it('packages into .amcplugin', () => {
    execSync(`node "${cliDist}" package`, { cwd: pluginDir, stdio: 'pipe' })

    const files = fs.readdirSync(pluginDir).filter(f => f.endsWith('.amcplugin'))
    expect(files).toHaveLength(1)
    expect(files[0]).toBe('e2e-test-plugin-1.0.0.amcplugin')
  })
})
