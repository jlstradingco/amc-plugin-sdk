import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import * as fs from 'node:fs'
import * as path from 'node:path'
import * as os from 'node:os'
import { spawnSync } from 'node:child_process'
import { buildSdkAndCli } from './build-packages.js'

const BUILD_HOOK_TIMEOUT_MS = 120_000
const INSTALL_FAILURE_TIMEOUT_MS = 60_000

describe('create: a failed dependency install', () => {
  const cliDist = path.resolve(__dirname, '../../dist/index.js')
  let tmpDir: string

  const createWithBrokenRegistry = (name: string) => {
    const env: NodeJS.ProcessEnv = {
      ...process.env,
      npm_config_registry: 'http://127.0.0.1:9/',
      npm_config_fetch_retries: '0',
      npm_config_fetch_retry_maxtimeout: '1000',
      npm_config_audit: 'false',
      npm_config_fund: 'false',
      npm_config_update_notifier: 'false',
      npm_config_cache: path.join(tmpDir, 'npm-cache'),
    }
    const r = spawnSync(
      'node',
      [
        cliDist,
        'create',
        name,
        '--template',
        'basic',
        '--display-name',
        'Install Failure',
        '--description',
        'install failure test',
        '--author',
        'Test Author',
        '--category',
        'other',
        '--skip-git',
      ],
      { cwd: tmpDir, env, encoding: 'utf-8' },
    )
    return { status: r.status, output: `${r.stdout}${r.stderr}`, dir: path.join(tmpDir, name) }
  }

  beforeAll(() => {
    buildSdkAndCli()
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'amc-install-failure-'))
  }, BUILD_HOOK_TIMEOUT_MS)

  afterAll(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true })
  })

  it('reports the failed install and the way forward instead of crashing', () => {
    const { status, output, dir } = createWithBrokenRegistry('install-failure')

    expect(output).not.toMatch(/at Command\.<anonymous>/)
    expect(output).not.toMatch(/Node\.js v\d/)

    expect(status).toBe(1)
    expect(output).toContain('Could not install dependencies in ./install-failure/')
    expect(output).toContain('cd install-failure && npm install')
    expect(output).toContain('--skip-install')

    expect(fs.existsSync(path.join(dir, 'manifest.json'))).toBe(true)
    expect(fs.existsSync(path.join(dir, 'package.json'))).toBe(true)
    expect(fs.existsSync(path.join(dir, 'src', 'ui', 'index.html'))).toBe(true)
  }, INSTALL_FAILURE_TIMEOUT_MS)
})
