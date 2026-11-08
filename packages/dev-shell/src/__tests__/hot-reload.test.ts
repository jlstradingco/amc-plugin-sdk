import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import * as fs from 'node:fs'
import * as path from 'node:path'
import * as os from 'node:os'
import { runPluginBuild } from '../hot-reload.js'

let dir: string

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'amc-hot-reload-'))
})

afterEach(() => {
  fs.rmSync(dir, { recursive: true, force: true })
})

describe('runPluginBuild', () => {
  it('rebuilds with the same CLI that launched the dev shell, in the plugin folder', () => {
    const fakeCli = path.join(dir, 'fake-cli.mjs')
    fs.writeFileSync(
      fakeCli,
      "import fs from 'node:fs'\nfs.writeFileSync('ran.json', JSON.stringify({ args: process.argv.slice(2), cwd: process.cwd() }))\n"
    )
    const plugin = path.join(dir, 'plugin')
    fs.mkdirSync(plugin)
    runPluginBuild(plugin, { ...process.env, AMC_PLUGIN_CLI_ENTRY: fakeCli })
    const ran = JSON.parse(fs.readFileSync(path.join(plugin, 'ran.json'), 'utf-8'))
    expect(ran).toEqual({ args: ['build'], cwd: fs.realpathSync(plugin) })
  })

  it('throws when the build fails, so hot reload reports it instead of reloading a stale page', () => {
    const failingCli = path.join(dir, 'failing-cli.mjs')
    fs.writeFileSync(failingCli, 'process.exit(1)\n')
    expect(() => runPluginBuild(dir, { ...process.env, AMC_PLUGIN_CLI_ENTRY: failingCli })).toThrow()
  })
})
