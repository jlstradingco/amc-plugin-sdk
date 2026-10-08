import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import * as fs from 'node:fs'
import * as path from 'node:path'
import * as os from 'node:os'
import { spawnSync, execSync } from 'node:child_process'

/**
 * The scaffold's icon default and `validate`'s icon check, driven through the BUILT CLI the
 * way a developer runs them. The webview template is flat JS, so neither `create` nor
 * `validate` ever starts a TypeScript compile.
 */
const SHELL_OUT_TIMEOUT_MS = 30_000
const BUILD_HOOK_TIMEOUT_MS = 120_000

describe('plugin icon: scaffold default and validate', () => {
  const monorepoRoot = path.resolve(__dirname, '../../../..')
  const cliDist = path.resolve(__dirname, '../../dist/index.js')
  let tmpDir: string

  const create = (name: string, extra: string[] = []) => {
    execSync(
      [
        `node "${cliDist}" create ${name}`,
        '--template webview',
        `--display-name "${name}"`,
        '--description "icon test"',
        '--author "Test Author"',
        '--category other',
        ...extra,
        '--skip-install',
        '--skip-git',
      ].join(' '),
      { cwd: tmpDir, stdio: 'pipe' },
    )
    return path.join(tmpDir, name)
  }

  const validate = (pluginDir: string) => {
    const r = spawnSync('node', [cliDist, 'validate'], { cwd: pluginDir, encoding: 'utf-8' })
    return { status: r.status, output: `${r.stdout}${r.stderr}` }
  }

  const readManifest = (pluginDir: string) =>
    JSON.parse(fs.readFileSync(path.join(pluginDir, 'manifest.json'), 'utf-8'))

  beforeAll(() => {
    execSync('pnpm --filter @agent-mc/plugin-sdk build', { cwd: monorepoRoot, stdio: 'pipe' })
    execSync('pnpm --filter @agent-mc/plugin-cli build', { cwd: monorepoRoot, stdio: 'pipe' })
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'amc-icon-'))
  }, BUILD_HOOK_TIMEOUT_MS)

  afterAll(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true })
  })

  it('defaults a new plugin to a packaged logo, not the stock puzzle glyph', () => {
    const dir = create('icon-default')
    expect(readManifest(dir).plugin.icon).toBe('assets/icon.svg')
  }, SHELL_OUT_TIMEOUT_MS)

  it('ships a placeholder file at the default path, so the new plugin passes its own validate', () => {
    const dir = create('icon-placeholder')
    expect(fs.existsSync(path.join(dir, 'assets', 'icon.svg'))).toBe(true)
    const { status, output } = validate(dir)
    expect(output).toContain('Icon file present (assets/icon.svg)')
    expect(status).toBe(0)
  }, SHELL_OUT_TIMEOUT_MS)

  it('leaves a Lucide-name choice alone: no placeholder written, validate warns but passes', () => {
    const dir = create('icon-lucide', ['--icon home'])
    expect(readManifest(dir).plugin.icon).toBe('home')
    expect(fs.existsSync(path.join(dir, 'assets', 'icon.svg'))).toBe(false)
    const { status, output } = validate(dir)
    expect(output).toMatch(/Lucide icon NAME/)
    expect(status).toBe(0)
  }, SHELL_OUT_TIMEOUT_MS)

  it('fails validate when the packaged icon file is missing', () => {
    const dir = create('icon-missing')
    fs.rmSync(path.join(dir, 'assets', 'icon.svg'))
    const { status, output } = validate(dir)
    expect(output).toContain('Icon file not found in the package: assets/icon.svg')
    expect(status).not.toBe(0)
  }, SHELL_OUT_TIMEOUT_MS)

  it('fails validate on an icon path that escapes the package', () => {
    const dir = create('icon-traversal')
    const manifest = readManifest(dir)
    manifest.plugin.icon = '../outside/icon.svg'
    fs.writeFileSync(path.join(dir, 'manifest.json'), JSON.stringify(manifest, null, 2))
    const { status, output } = validate(dir)
    expect(output).toContain('is not a usable path')
    expect(status).not.toBe(0)
  }, SHELL_OUT_TIMEOUT_MS)

  it('refuses an --icon path that escapes the project, and writes nothing outside it', () => {
    const r = spawnSync(
      'node',
      [cliDist, 'create', 'icon-escape', '--template', 'webview', '--display-name', 'x', '--description', 'x',
        '--author', 'x', '--icon', '../outside/icon.svg', '--skip-install', '--skip-git'],
      { cwd: tmpDir, encoding: 'utf-8' },
    )
    expect(r.status).not.toBe(0)
    expect(fs.existsSync(path.join(tmpDir, 'outside'))).toBe(false)
    expect(fs.existsSync(path.join(tmpDir, 'icon-escape'))).toBe(false)
  }, SHELL_OUT_TIMEOUT_MS)

  it('does not write SVG text into a non-SVG icon path', () => {
    const dir = create('icon-png-path', ['--icon assets/logo.png'])
    expect(readManifest(dir).plugin.icon).toBe('assets/logo.png')
    expect(fs.existsSync(path.join(dir, 'assets', 'logo.png'))).toBe(false)
  }, SHELL_OUT_TIMEOUT_MS)

  it('writes the placeholder at a custom .svg path inside the project', () => {
    const dir = create('icon-custom-svg', ['--icon assets/brand/logo.svg'])
    expect(fs.readFileSync(path.join(dir, 'assets', 'brand', 'logo.svg'), 'utf-8')).toContain('<svg')
  }, SHELL_OUT_TIMEOUT_MS)

  it('fails validate on an icon that exists on disk but is not shipped in the package', () => {
    // `package` ships ui/, assets/, prompts/ and the README for a flat plugin, so a logo
    // under images/ is present in the project folder yet never reaches the marketplace.
    const dir = create('icon-unshipped')
    const manifest = readManifest(dir)
    manifest.plugin.icon = 'images/logo.svg'
    fs.writeFileSync(path.join(dir, 'manifest.json'), JSON.stringify(manifest, null, 2))
    fs.mkdirSync(path.join(dir, 'images'))
    fs.writeFileSync(path.join(dir, 'images', 'logo.svg'), '<svg xmlns="http://www.w3.org/2000/svg"/>')
    const { status, output } = validate(dir)
    expect(output).toContain('will not be shipped')
    expect(output).not.toContain('Icon file present')
    expect(status).not.toBe(0)
  }, SHELL_OUT_TIMEOUT_MS)
})
