// @script what="Publishes each Omniscio SDK package whose version npm does not have yet, in dependency order, from its packed tarball; --dry-run packs and rehearses every package and publishes nothing." kind="entrypoint" owner="plugin-sdk"
import { spawnSync } from 'node:child_process'
import { mkdtempSync, readFileSync, realpathSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { gunzipSync } from 'node:zlib'

const THIS_FILE = fileURLToPath(import.meta.url)
export const SDK_ROOT = path.dirname(path.dirname(THIS_FILE))
export const PACKAGE_DIRS = ['packages/sdk', 'packages/dev-shell', 'packages/cli']
const DEPENDENCY_FIELDS = ['dependencies', 'peerDependencies', 'optionalDependencies']
const TAR_BLOCK = 512
const TAR_NAME_END = 100
const TAR_SIZE_START = 124
const TAR_SIZE_END = 136
const PACKED_MANIFEST = 'package/package.json'
const NPM_NOT_FOUND = 'E404'

export function readPackage(root, dir) {
  const manifest = JSON.parse(readFileSync(path.join(root, dir, 'package.json'), 'utf8'))
  return { dir, name: manifest.name, version: manifest.version }
}

export function isPublished(result, pkg) {
  if (result.status === 0) return result.stdout.trim().length > 0
  const stderr = result.stderr ?? ''
  if (`${stderr}${result.stdout ?? ''}`.includes(NPM_NOT_FOUND)) return false
  throw new Error(`npm view ${pkg.name}@${pkg.version} failed (exit ${result.status}): ${stderr.trim()}`)
}

export function tarballName(pkg) {
  return `${pkg.name.replace(/^@/, '').replace('/', '-')}-${pkg.version}.tgz`
}

export function packedManifest(tarball) {
  const tar = gunzipSync(tarball)
  for (let at = 0; at + TAR_BLOCK <= tar.length; ) {
    const name = tar.subarray(at, at + TAR_NAME_END).toString('utf8').replace(/\0.*$/s, '')
    const size = parseInt(tar.subarray(at + TAR_SIZE_START, at + TAR_SIZE_END).toString('utf8').trim() || '0', 8)
    if (name === PACKED_MANIFEST) return JSON.parse(tar.subarray(at + TAR_BLOCK, at + TAR_BLOCK + size).toString('utf8'))
    at += TAR_BLOCK + Math.ceil(size / TAR_BLOCK) * TAR_BLOCK
  }
  throw new Error(`the tarball has no ${PACKED_MANIFEST}`)
}

export function workspaceRanges(manifest) {
  return DEPENDENCY_FIELDS.flatMap((field) => Object.entries(manifest[field] ?? {}))
    .filter(([, range]) => String(range).startsWith('workspace:'))
    .map(([name, range]) => `${name}@${range}`)
}

function quoteForCmd(arg) {
  return /[\s"]/.test(arg) ? `"${arg.replace(/"/g, '""')}"` : arg
}

export function runTool(command, args, cwd) {
  const options = { cwd, encoding: 'utf8', windowsHide: true }
  if (process.platform !== 'win32') return spawnSync(command, args, options)
  const line = [command, ...args].map(quoteForCmd).join(' ')
  return spawnSync('cmd.exe', ['/d', '/s', '/c', line], { ...options, windowsVerbatimArguments: true })
}

function mustSucceed(result, what) {
  if (result.status !== 0) throw new Error(`${what} failed (exit ${result.status}): ${(result.stderr ?? '').trim()}`)
  return result
}

function packAndCheck(pkg, { root, run, outDir, read }) {
  mustSucceed(run('pnpm', ['pack', '--pack-destination', outDir], path.join(root, pkg.dir)), `pnpm pack ${pkg.name}`)
  const tarball = path.join(outDir, tarballName(pkg))
  const leaked = workspaceRanges(packedManifest(read(tarball)))
  if (leaked.length > 0) throw new Error(`${pkg.name} packed with workspace ranges: ${leaked.join(', ')}`)
  return tarball
}

export function publishUnreleased({
  root = SDK_ROOT, dryRun = false, run = runTool, read = readFileSync, log = console.log,
  outDir = mkdtempSync(path.join(os.tmpdir(), 'omniscio-sdk-publish-'))
} = {}) {
  const packages = PACKAGE_DIRS.map((dir) => readPackage(root, dir))
  const missing = packages.filter((pkg) => !isPublished(run('npm', ['view', `${pkg.name}@${pkg.version}`, 'version'], root), pkg))
  log(`npm lacks: ${missing.map((pkg) => `${pkg.name}@${pkg.version}`).join(', ') || 'nothing'}`)
  const targets = dryRun ? packages : missing
  for (const pkg of targets) {
    const tarball = packAndCheck(pkg, { root, run, outDir, read })
    const args = ['publish', tarball, '--access', 'public', ...(dryRun ? ['--dry-run'] : [])]
    mustSucceed(run('npm', args, root), `npm publish ${pkg.name}@${pkg.version}`)
    log(`${dryRun ? 'rehearsed' : 'published'} ${pkg.name}@${pkg.version}`)
  }
  return { missing: missing.map((pkg) => pkg.name), handled: targets.map((pkg) => pkg.name) }
}

if (process.argv[1] && realpathSync(process.argv[1]) === realpathSync(THIS_FILE)) {
  try {
    publishUnreleased({ dryRun: process.argv.includes('--dry-run') })
  } catch (error) {
    console.error(`[publish-unreleased] ${error.message}`)
    process.exitCode = 1
  }
}
