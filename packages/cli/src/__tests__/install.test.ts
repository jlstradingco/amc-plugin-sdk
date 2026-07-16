import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import * as fs from 'node:fs'
import * as path from 'node:path'
import * as os from 'node:os'
import { copyPluginToDir } from '../lib/install.js'

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
    // AMC persists plugin fs data under <dest>/data — it must survive re-install.
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
