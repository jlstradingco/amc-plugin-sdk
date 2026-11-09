// @script what="Runs one SDK package entry through the Omniscio repo's own work runner when this folder sits inside that repo, and runs it directly in the standalone public copy." kind="entrypoint" owner="plugin-sdk"
import { spawnSync } from 'node:child_process'
import { existsSync, readFileSync, realpathSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const THIS_FILE = fileURLToPath(import.meta.url)
const SDK_ROOT = path.dirname(path.dirname(THIS_FILE))
export const DEFAULT_HOST_ROOT = path.dirname(SDK_ROOT)
const ADAPTER_PATH = ['scripts', 'run-work-entry.mjs']
const HOST_MARKER_KEY = 'omniscioWork'
const USAGE_EXIT = 2
const BROKEN_HOST_EXIT = 2
const KILLED_EXIT = 1

export function hostAdapter(hostRoot) {
  return path.join(hostRoot, ...ADAPTER_PATH)
}

function declaresHost(manifestPath) {
  if (!existsSync(manifestPath)) return false
  return Object.hasOwn(JSON.parse(readFileSync(manifestPath, 'utf8')), HOST_MARKER_KEY)
}

export function hostMode(hostRoot = DEFAULT_HOST_ROOT) {
  if (!declaresHost(path.join(hostRoot, 'package.json'))) return 'standalone'
  return existsSync(hostAdapter(hostRoot)) ? 'host' : 'broken'
}

export function nodeArguments(mode, argv, hostRoot = DEFAULT_HOST_ROOT) {
  return mode === 'host' ? [hostAdapter(hostRoot), ...argv] : argv
}

export function exitCodeOf(result) {
  if (result.error) return KILLED_EXIT
  return typeof result.status === 'number' ? result.status : KILLED_EXIT
}

export function runWorkEntry(argv, hostRoot = DEFAULT_HOST_ROOT) {
  if (!argv[0] || argv[0].startsWith('-')) {
    console.error('Usage: node scripts/run-work-entry.mjs <entry-file> [arguments...]')
    return USAGE_EXIT
  }
  const mode = hostMode(hostRoot)
  if (mode === 'broken') {
    console.error(`[run-work-entry] ${hostRoot} is the Omniscio repo but ${hostAdapter(hostRoot)} is missing, ` +
      'so this entry cannot run through its work runner. Restore that file; the entry was not run.')
    return BROKEN_HOST_EXIT
  }
  const result = spawnSync(process.execPath, nodeArguments(mode, argv, hostRoot), { stdio: 'inherit', windowsHide: true })
  return exitCodeOf(result)
}

if (process.argv[1] && realpathSync(process.argv[1]) === realpathSync(THIS_FILE)) {
  process.exitCode = runWorkEntry(process.argv.slice(2))
}
