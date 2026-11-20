import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import * as fs from 'node:fs'
import * as path from 'node:path'
import * as os from 'node:os'
import { copyPluginToDir, installPluginToApp } from '../lib/install.js'

let srcDir: string
let destParent: string

beforeEach(() => {
  srcDir = fs.mkdtempSync(path.join(os.tmpdir(), 'amc-install-src-'))
  destParent = fs.mkdtempSync(path.join(os.tmpdir(), 'amc-install-dest-'))
})

afterEach(() => {
  fs.rmSync(srcDir, { recursive: true, force: true })
  fs.rmSync(destParent, { recursive: true, force: true })
})

function writeFlatPlugin() {
  fs.writeFileSync(path.join(srcDir, 'manifest.json'), JSON.stringify({ ui: { entryPoint: 'ui/index.html' } }))
  fs.mkdirSync(path.join(srcDir, 'ui'))
  fs.writeFileSync(path.join(srcDir, 'ui', 'index.html'), '<html>v1</html>')
  fs.writeFileSync(path.join(srcDir, 'ui', 'plugin.js'), 'console.log(1)')
}

describe('copyPluginToDir', () => {
  it('copies manifest.json and the plugin entry dirs into the destination', () => {
    writeFlatPlugin()
    const manifest = JSON.parse(fs.readFileSync(path.join(srcDir, 'manifest.json'), 'utf-8'))
    const dest = path.join(destParent, 'my-plugin')

    copyPluginToDir(srcDir, manifest, dest)

    expect(fs.existsSync(path.join(dest, 'manifest.json'))).toBe(true)
    expect(fs.readFileSync(path.join(dest, 'ui', 'index.html'), 'utf-8')).toBe('<html>v1</html>')
    expect(fs.existsSync(path.join(dest, 'ui', 'plugin.js'))).toBe(true)
  })

  it('removes stale files inside a re-copied entry dir', () => {
    writeFlatPlugin()
    const manifest = JSON.parse(fs.readFileSync(path.join(srcDir, 'manifest.json'), 'utf-8'))
    const dest = path.join(destParent, 'my-plugin')

    // First install, then delete a source file and re-install.
    copyPluginToDir(srcDir, manifest, dest)
    fs.rmSync(path.join(srcDir, 'ui', 'plugin.js'))
    copyPluginToDir(srcDir, manifest, dest)

    expect(fs.existsSync(path.join(dest, 'ui', 'plugin.js'))).toBe(false)
    expect(fs.existsSync(path.join(dest, 'ui', 'index.html'))).toBe(true)
  })

  it('preserves the plugin runtime data/ dir across a re-install', () => {
    writeFlatPlugin()
    const manifest = JSON.parse(fs.readFileSync(path.join(srcDir, 'manifest.json'), 'utf-8'))
    const dest = path.join(destParent, 'my-plugin')

    copyPluginToDir(srcDir, manifest, dest)
    // Omniscio persists plugin fs data under <dest>/data — it must survive re-install.
    fs.mkdirSync(path.join(dest, 'data'))
    fs.writeFileSync(path.join(dest, 'data', 'state.json'), '{"count":42}')

    copyPluginToDir(srcDir, manifest, dest)

    expect(fs.readFileSync(path.join(dest, 'data', 'state.json'), 'utf-8')).toBe('{"count":42}')
  })

  it('returns the copied top-level entries', () => {
    writeFlatPlugin()
    const manifest = JSON.parse(fs.readFileSync(path.join(srcDir, 'manifest.json'), 'utf-8'))
    const dest = path.join(destParent, 'my-plugin')

    const entries = copyPluginToDir(srcDir, manifest, dest)
    expect(entries).toContain('ui')
  })
})

describe('installPluginToApp', () => {
  const appData = () => path.join(destParent, 'app-profile')

  function writeManifest(): Record<string, unknown> {
    writeFlatPlugin()
    return JSON.parse(fs.readFileSync(path.join(srcDir, 'manifest.json'), 'utf-8'))
  }

  it('copies the plugin into the folder the running app reports', async () => {
    const manifest = writeManifest()
    const profile = appData()
    const fetchImpl = (async () =>
      new Response(JSON.stringify({ ok: true, data: { path: profile } }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      })) as typeof fetch

    const target = await installPluginToApp(srcDir, manifest, 'my-plugin', {
      token: 'cli-token',
      port: 19531,
      fetchImpl,
    })

    expect(target.source).toBe('app')
    expect(target.destDir).toBe(path.join(profile, 'plugins', 'my-plugin'))
    expect(fs.existsSync(path.join(profile, 'plugins', 'my-plugin', 'manifest.json'))).toBe(true)
    expect(fs.readFileSync(path.join(profile, 'plugins', 'my-plugin', 'ui', 'index.html'), 'utf-8')).toBe('<html>v1</html>')
  })

  it('copies into the fallback folder and keeps the reason when the app cannot be asked', async () => {
    const manifest = writeManifest()
    const fallbackDir = path.join(destParent, 'fallback-plugins')
    const fetchImpl = (async () => {
      throw Object.assign(new TypeError('fetch failed'), { cause: { code: 'ECONNREFUSED' } })
    }) as typeof fetch

    const target = await installPluginToApp(srcDir, manifest, 'my-plugin', {
      token: 'cli-token',
      port: 19531,
      fetchImpl,
      fallbackDir,
    })

    expect(target.source).toBe('fallback')
    expect(target.reason).toBe('Omniscio is not running')
    expect(target.destDir).toBe(path.join(fallbackDir, 'my-plugin'))
    expect(fs.existsSync(path.join(target.destDir, 'manifest.json'))).toBe(true)
  })

  it('falls back when the app stops answering mid-lookup', async () => {
    const manifest = writeManifest()
    const fallbackDir = path.join(destParent, 'fallback-plugins')
    const fetchImpl = (async () => {
      throw Object.assign(new Error('The operation was aborted due to timeout'), { name: 'TimeoutError' })
    }) as typeof fetch

    const target = await installPluginToApp(srcDir, manifest, 'my-plugin', {
      token: 'cli-token',
      port: 19531,
      fetchImpl,
      fallbackDir,
    })

    expect(target.source).toBe('fallback')
    expect(target.reason).toBe('Omniscio did not answer in time')
    expect(target.destDir).toBe(path.join(fallbackDir, 'my-plugin'))
  })
})
