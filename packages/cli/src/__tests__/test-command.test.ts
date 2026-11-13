import { describe, it, expect, vi, afterEach } from 'vitest'
import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'
import { spawnSync } from 'node:child_process'
import {
  FALLBACK_CONFIG_SOURCE,
  buildVitestInvocation,
  cleanupInvocation,
  findPluginConfig,
  testCommand
} from '../commands/test.js'

const CLI_PACKAGE_DIR = path.resolve(__dirname, '../..')
const VITEST_MODULE_DIR = path.join(CLI_PACKAGE_DIR, 'node_modules', 'vitest')
const VITEST_ENTRY = path.join(VITEST_MODULE_DIR, 'vitest.mjs')
const NESTED_TEST_TIMEOUT_MS = 60_000

const originalCwd = process.cwd()
const originalTempEnv = { TMPDIR: process.env.TMPDIR, TMP: process.env.TMP, TEMP: process.env.TEMP }
const originalPath = process.env.PATH
const createdDirs: string[] = []

function restoreTempEnv(): void {
  for (const name of ['TMPDIR', 'TMP', 'TEMP'] as const) {
    const value = originalTempEnv[name]
    if (value === undefined) delete process.env[name]
    else process.env[name] = value
  }
}

afterEach(() => {
  process.chdir(originalCwd)
  restoreTempEnv()
  process.env.PATH = originalPath
  vi.restoreAllMocks()
  for (const dir of createdDirs.splice(0)) fs.rmSync(dir, { recursive: true, force: true })
})

function makeTempDir(prefix: string): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), prefix))
  createdDirs.push(dir)
  return dir
}

function writeFile(filePath: string, contents: string): void {
  fs.mkdirSync(path.dirname(filePath), { recursive: true })
  fs.writeFileSync(filePath, contents)
}

function writeManifest(pluginDir: string, id: string): void {
  writeFile(path.join(pluginDir, 'manifest.json'), JSON.stringify({ plugin: { id, version: '1.0.0' } }))
}

function linkVitestInto(pluginDir: string): void {
  const nodeModules = path.join(pluginDir, 'node_modules')
  fs.mkdirSync(nodeModules, { recursive: true })
  fs.symlinkSync(VITEST_MODULE_DIR, path.join(nodeModules, 'vitest'), process.platform === 'win32' ? 'junction' : 'dir')

  const binDir = path.join(nodeModules, '.bin')
  const posixShim = path.join(binDir, 'vitest')
  writeFile(posixShim, `#!/bin/sh\nexec "${process.execPath}" "${VITEST_ENTRY}" "$@"\n`)
  fs.chmodSync(posixShim, 0o755)
  writeFile(path.join(binDir, 'vitest.CMD'), `@ECHO off\r\n"${process.execPath}" "${VITEST_ENTRY}" %*\r\n`)
}

function writeMarkerVitest(dir: string, markerFile: string): void {
  const binDir = path.join(dir, 'node_modules', '.bin')
  fs.mkdirSync(binDir, { recursive: true })
  fs.writeFileSync(path.join(binDir, 'vitest'), `#!/bin/sh\necho ran > "${markerFile}"\n`, { mode: 0o755 })
}

function writeSpec(pluginDir: string, relativePath: string, markerFile: string, passing: boolean): void {
  writeFile(
    path.join(pluginDir, relativePath),
    [
      "import { test, expect } from 'vitest'",
      "import * as fs from 'node:fs'",
      "import * as path from 'node:path'",
      "import { fileURLToPath } from 'node:url'",
      "const here = path.dirname(fileURLToPath(import.meta.url))",
      `test('${relativePath}', () => {`,
      `  fs.writeFileSync(path.join(here, '${markerFile}'), 'ran')`,
      `  expect(${passing ? '1 + 1' : '1'}).toBe(2)`,
      '})',
      ''
    ].join('\n')
  )
}

function runTestCommand(args: string[]): { code: number | undefined; output: string } {
  const output: string[] = []
  vi.spyOn(console, 'log').mockImplementation((...parts: unknown[]) => void output.push(parts.join(' ')))
  vi.spyOn(console, 'error').mockImplementation((...parts: unknown[]) => void output.push(parts.join(' ')))
  vi.spyOn(process, 'exit').mockImplementation(((code?: number) => {
    throw new Error(`exit ${code ?? 0}`)
  }) as never)

  try {
    testCommand.parse(['node', 'omniscio-plugin', ...args])
    throw new Error('the test command returned without exiting')
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    const exitCode = /^exit (\d+)$/.exec(message)
    if (!exitCode) throw error
    return { code: Number(exitCode[1]), output: output.join('\n') }
  }
}

describe('a plugin nested inside a bigger repo', { timeout: NESTED_TEST_TIMEOUT_MS }, () => {
  it('runs the plugin own test where a bare vitest run finds the parent config and fails', () => {
    const repoRoot = makeTempDir('amc-test-command-nested-')
    const pluginDir = path.join(repoRoot, 'plugin')
    writeFile(path.join(repoRoot, 'vitest.config.mjs'), "export default { test: { include: ['parent-tests/**/*.test.mjs'] } }\n")
    writeManifest(pluginDir, 'nested-demo')
    writeSpec(pluginDir, 'own.test.mjs', 'plugin-ran.txt', true)
    linkVitestInto(pluginDir)
    const marker = path.join(pluginDir, 'plugin-ran.txt')

    const oldWay = spawnSync(process.execPath, [VITEST_ENTRY, 'run'], { cwd: pluginDir, encoding: 'utf-8' })
    expect(oldWay.status).toBe(1)
    expect(`${oldWay.stdout}${oldWay.stderr}`).toContain('No test files found')
    expect(fs.existsSync(marker)).toBe(false)

    process.chdir(pluginDir)
    const result = runTestCommand([])

    expect(result.code).toBe(0)
    expect(fs.readFileSync(marker, 'utf-8')).toBe('ran')
  })
})

describe('a plugin whose vitest is hoisted to a parent folder', { timeout: NESTED_TEST_TIMEOUT_MS }, () => {
  it('runs that hoisted vitest instead of reaching for npx', () => {
    const repoRoot = makeTempDir('amc-test-command-hoisted-')
    const pluginDir = path.join(repoRoot, 'packages', 'plugin')
    writeManifest(pluginDir, 'hoisted-demo')
    writeSpec(pluginDir, 'own.test.mjs', 'hoisted-ran.txt', true)
    linkVitestInto(repoRoot)
    const marker = path.join(pluginDir, 'hoisted-ran.txt')
    const npxMarker = path.join(repoRoot, 'npx-ran.txt')
    const fakeBin = path.join(repoRoot, 'fake-bin')
    fs.mkdirSync(fakeBin, { recursive: true })
    fs.writeFileSync(path.join(fakeBin, 'npx'), `#!/bin/sh\necho ran > "${npxMarker}"\n`, { mode: 0o755 })
    process.env.PATH = `${fakeBin}${path.delimiter}${originalPath}`
    process.chdir(pluginDir)

    const result = runTestCommand([])

    expect(result.code).toBe(0)
    expect(fs.readFileSync(marker, 'utf-8')).toBe('ran')
    expect(fs.existsSync(npxMarker)).toBe(false)
  })

  it('runs the plugin own vitest when a parent has one too', () => {
    const repoRoot = makeTempDir('amc-test-command-nearest-')
    const pluginDir = path.join(repoRoot, 'packages', 'plugin')
    writeManifest(pluginDir, 'nearest-demo')
    const ownMarker = path.join(repoRoot, 'own-ran.txt')
    const hoistedMarker = path.join(repoRoot, 'hoisted-ran.txt')
    writeMarkerVitest(pluginDir, ownMarker)
    writeMarkerVitest(repoRoot, hoistedMarker)
    process.chdir(pluginDir)

    const result = runTestCommand([])

    expect(result.code).toBe(0)
    expect(fs.existsSync(ownMarker)).toBe(true)
    expect(fs.existsSync(hoistedMarker)).toBe(false)
  })
})

describe('a plugin with its own vitest config', { timeout: NESTED_TEST_TIMEOUT_MS }, () => {
  it('keeps using that config, and the built-in config on the same plugin fails', () => {
    const repoRoot = makeTempDir('amc-test-command-own-')
    const pluginDir = path.join(repoRoot, 'plugin')
    writeManifest(pluginDir, 'own-demo')
    writeFile(path.join(pluginDir, 'vitest.config.mjs'), "export default { test: { include: ['specs/keep.spec.mjs'] } }\n")
    writeSpec(pluginDir, 'specs/keep.spec.mjs', 'kept-ran.txt', true)
    writeSpec(pluginDir, 'specs/drop.spec.mjs', 'dropped-ran.txt', false)
    linkVitestInto(pluginDir)
    const keptMarker = path.join(pluginDir, 'specs', 'kept-ran.txt')
    const droppedMarker = path.join(pluginDir, 'specs', 'dropped-ran.txt')

    process.chdir(pluginDir)
    const result = runTestCommand([])

    expect(result.code).toBe(0)
    expect(fs.existsSync(keptMarker)).toBe(true)
    expect(fs.existsSync(droppedMarker)).toBe(false)

    const fallbackDir = makeTempDir('amc-test-command-builtin-')
    const builtInConfig = path.join(fallbackDir, 'vitest.config.mjs')
    fs.writeFileSync(builtInConfig, FALLBACK_CONFIG_SOURCE)
    const withoutPluginConfig = spawnSync(
      process.execPath,
      [VITEST_ENTRY, 'run', '--root', pluginDir, '--config', builtInConfig],
      { cwd: pluginDir, encoding: 'utf-8' }
    )

    expect(withoutPluginConfig.status).toBe(1)
    expect(fs.existsSync(droppedMarker)).toBe(true)
  })
})

describe('a plugin config that sets its own root', { timeout: NESTED_TEST_TIMEOUT_MS }, () => {
  it('still runs from the plugin folder, which is what the reference documents', () => {
    const repoRoot = makeTempDir('amc-test-command-root-')
    const pluginDir = path.join(repoRoot, 'plugin')
    writeManifest(pluginDir, 'root-demo')
    writeFile(path.join(pluginDir, 'vitest.config.mjs'), "export default { root: 'src', test: { include: ['*.spec.mjs'] } }\n")
    writeSpec(pluginDir, path.join('src', 'inside-root.spec.mjs'), 'inside-ran.txt', true)
    writeSpec(pluginDir, 'plugin-root.spec.mjs', 'plugin-root-ran.txt', true)
    linkVitestInto(pluginDir)
    const insideMarker = path.join(pluginDir, 'src', 'inside-ran.txt')
    const pluginRootMarker = path.join(pluginDir, 'plugin-root-ran.txt')

    process.chdir(pluginDir)
    const result = runTestCommand([])

    expect(result.code).toBe(0)
    expect(fs.existsSync(pluginRootMarker)).toBe(true)
    expect(fs.existsSync(insideMarker)).toBe(false)
  })
})

describe('buildVitestInvocation', () => {
  it('pins the plugin folder as the root and names the plugin own config', () => {
    const pluginDir = makeTempDir('amc-test-command-args-')
    writeFile(path.join(pluginDir, 'vitest.config.ts'), 'export default {}\n')

    const invocation = buildVitestInvocation(pluginDir, 'run', [])

    expect(invocation.tempDir).toBeNull()
    expect(invocation.args).toEqual([
      'run',
      '--root',
      pluginDir,
      '--config',
      path.join(pluginDir, 'vitest.config.ts')
    ])
  })

  it('supplies a fallback config from a fresh temp folder when the plugin has none', () => {
    const pluginDir = makeTempDir('amc-test-command-fallback-')

    const first = buildVitestInvocation(pluginDir, 'run', [])
    const second = buildVitestInvocation(pluginDir, 'run', [])

    expect(first.tempDir).not.toBeNull()
    expect(second.tempDir).not.toBe(first.tempDir)
    expect(fs.readFileSync(path.join(first.tempDir!, 'vitest.config.mjs'), 'utf-8')).toBe(FALLBACK_CONFIG_SOURCE)
    expect(first.args).toContain('--root')
    expect(first.args[first.args.indexOf('--root') + 1]).toBe(pluginDir)
    expect(first.args[first.args.indexOf('--config') + 1]).toBe(path.join(first.tempDir!, 'vitest.config.mjs'))

    cleanupInvocation(first)
    cleanupInvocation(second)
  })

  it('keeps watch mode and forwards the patterns as vitest filters', () => {
    const pluginDir = makeTempDir('amc-test-command-forward-')
    writeFile(path.join(pluginDir, 'vitest.config.ts'), 'export default {}\n')

    const invocation = buildVitestInvocation(pluginDir, 'watch', ['src/backend', 'note.spec'])

    expect(invocation.args.slice(0, 5)).toEqual([
      'watch',
      '--root',
      pluginDir,
      '--config',
      path.join(pluginDir, 'vitest.config.ts')
    ])
    expect(invocation.args.slice(5)).toEqual(['src/backend', 'note.spec'])
  })
})

describe('cleanupInvocation', () => {
  it('removes the fallback folder it created', () => {
    const pluginDir = makeTempDir('amc-test-command-cleanup-')
    const invocation = buildVitestInvocation(pluginDir, 'run', [])
    expect(fs.existsSync(invocation.tempDir!)).toBe(true)

    cleanupInvocation(invocation)

    expect(fs.existsSync(invocation.tempDir!)).toBe(false)
  })

  it('leaves a plugin own config alone', () => {
    const pluginDir = makeTempDir('amc-test-command-cleanup-own-')
    writeFile(path.join(pluginDir, 'vite.config.mjs'), 'export default {}\n')

    cleanupInvocation(buildVitestInvocation(pluginDir, 'run', []))

    expect(fs.existsSync(path.join(pluginDir, 'vite.config.mjs'))).toBe(true)
  })
})

describe('findPluginConfig', () => {
  it('prefers vitest.config over vite.config', () => {
    const pluginDir = makeTempDir('amc-test-command-find-')
    writeFile(path.join(pluginDir, 'vite.config.mjs'), 'export default {}\n')
    writeFile(path.join(pluginDir, 'vitest.config.mjs'), 'export default {}\n')

    expect(findPluginConfig(pluginDir)).toBe(path.join(pluginDir, 'vitest.config.mjs'))
  })

  it('answers null when the plugin carries no config', () => {
    const pluginDir = makeTempDir('amc-test-command-find-none-')

    expect(findPluginConfig(pluginDir)).toBeNull()
  })
})

describe('the test command', () => {
  it('exits non-zero when vitest is killed by a signal', () => {
    const repoRoot = makeTempDir('amc-test-command-signal-')
    const pluginDir = path.join(repoRoot, 'plugin')
    writeManifest(pluginDir, 'signal-demo')
    writeFile(path.join(pluginDir, 'vitest.config.mjs'), 'export default {}\n')
    fs.mkdirSync(path.join(pluginDir, 'node_modules', '.bin'), { recursive: true })
    fs.writeFileSync(path.join(pluginDir, 'node_modules', '.bin', 'vitest'), '#!/bin/sh\nkill -TERM $$\n', { mode: 0o755 })
    process.chdir(pluginDir)

    const result = runTestCommand([])

    expect(result.code).toBe(128 + os.constants.signals.SIGTERM)
  })

  it('runs the plugin local vitest instead of reaching for npx', () => {
    const repoRoot = makeTempDir('amc-test-command-local-')
    const pluginDir = path.join(repoRoot, 'plugin')
    writeManifest(pluginDir, 'local-demo')
    writeFile(path.join(pluginDir, 'vitest.config.mjs'), 'export default {}\n')
    const localMarker = path.join(repoRoot, 'local-ran.txt')
    const npxMarker = path.join(repoRoot, 'npx-ran.txt')
    writeMarkerVitest(pluginDir, localMarker)
    const fakeBin = path.join(repoRoot, 'fake-bin')
    fs.mkdirSync(fakeBin, { recursive: true })
    fs.writeFileSync(path.join(fakeBin, 'npx'), `#!/bin/sh\necho ran > "${npxMarker}"\n`, { mode: 0o755 })
    process.env.PATH = `${fakeBin}${path.delimiter}${originalPath}`
    process.chdir(pluginDir)

    const result = runTestCommand([])

    expect(result.code).toBe(0)
    expect(fs.existsSync(localMarker)).toBe(true)
    expect(fs.existsSync(npxMarker)).toBe(false)
  })

  it('reports an unusable temp folder as a sentence and exits 1', () => {
    const repoRoot = makeTempDir('amc-test-command-tempfail-')
    const pluginDir = path.join(repoRoot, 'plugin')
    writeManifest(pluginDir, 'temp-demo')
    const blocker = path.join(repoRoot, 'not-a-folder')
    fs.writeFileSync(blocker, 'x')
    const unusable = path.join(blocker, 'nested')
    process.env.TMPDIR = unusable
    process.env.TMP = unusable
    process.env.TEMP = unusable
    process.chdir(pluginDir)

    const result = runTestCommand([])

    expect(result.code).toBe(1)
    expect(result.output).toContain('Could not create a temporary vitest config')
    expect(result.output).not.toMatch(/ENOTDIR|ENOENT|at Object|at Module/)
  })
})
