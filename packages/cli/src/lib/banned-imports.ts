import * as fs from 'node:fs'
import * as path from 'node:path'

// Plugin backend code runs against a deliberately narrow surface: it must never
// reach for the Electron runtime, a native SQLite driver, raw worker threads, or a
// child process — those are host-only capabilities the plugin API withholds on
// purpose. `validate` scans the shippable JS and REFUSES a plugin that smuggles one
// in; `build` scans the same way but only warns, so an author sees it early.
// (`package` does NOT scan — it validates the manifest only.)
//
// `child_process` is the costliest of the four to get wrong, and the reason this list
// is enforced at all: a marketplace plugin backend runs under Node's --permission,
// which denies spawning, so a plugin built on it passes review, publishes, installs — and then fails every
// single call at runtime. Catching it here is the difference between a build error
// and a shipped plugin that can never work.
//
// Every banned module is matched in ALL the forms a plugin can actually emit:
//   - CJS      `require('x')`
//   - ESM      `import … from 'x'` / `export … from 'x'` / side-effect `import 'x'`
//   - dynamic  `import('x')`
// AMC plugins are ESM (`"type": "module"`), so tsc compiles their source to the
// `from` form — the require-only patterns this replaces silently missed a plain
// `import Database from 'better-sqlite3'`.
// Both spellings of a node: builtin are listed, because a plugin can legally write
// either and tsc preserves whichever the author typed.
const BANNED_MODULES = [
  'electron',
  'better-sqlite3',
  'worker_threads',
  'node:worker_threads',
  'child_process',
  'node:child_process',
]

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

interface BannedModuleMatcher {
  module: string
  patterns: RegExp[]
}

export const BANNED_MODULE_MATCHERS: BannedModuleMatcher[] = BANNED_MODULES.map((module) => {
  const mod = escapeRegExp(module)
  return {
    module,
    patterns: [
      new RegExp(`require\\(\\s*['"]${mod}['"]\\s*\\)`),
      new RegExp(`from\\s+['"]${mod}['"]`),
      new RegExp(`import\\s+['"]${mod}['"]`),
      new RegExp(`import\\(\\s*['"]${mod}['"]\\s*\\)`),
    ],
  }
})

/**
 * Return the banned modules referenced by a single string of JS. Pure (no
 * filesystem) so the matching logic is unit-testable in isolation.
 */
export function findBannedImports(content: string): string[] {
  const hits: string[] = []
  for (const { module, patterns } of BANNED_MODULE_MATCHERS) {
    if (patterns.some((pattern) => pattern.test(content))) hits.push(module)
  }
  return hits
}

/**
 * Recursively scan a directory's `.js` files for banned imports, returning a
 * `"<file>: <module>"` line per offending reference. A missing / non-directory
 * path scans to nothing.
 */
export function scanBannedImports(dir: string): string[] {
  const errors: string[] = []
  if (!fs.existsSync(dir) || !fs.statSync(dir).isDirectory()) return errors
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const fullPath = path.join(dir, entry.name)
    if (entry.isDirectory()) {
      errors.push(...scanBannedImports(fullPath))
    } else if (entry.name.endsWith('.js')) {
      const content = fs.readFileSync(fullPath, 'utf-8')
      for (const module of findBannedImports(content)) {
        errors.push(`${fullPath}: ${module}`)
      }
    }
  }
  return errors
}
