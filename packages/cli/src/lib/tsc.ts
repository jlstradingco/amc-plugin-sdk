import * as path from 'node:path'
import { execFileSync } from 'node:child_process'
import { createRequire } from 'node:module'

const TYPESCRIPT_BIN = 'typescript/bin/tsc'

export class TypeScriptNotInstalledError extends Error {
  constructor() {
    super("Run 'npm install' in the plugin folder first — the plugin's own TypeScript is the only compiler this runs.")
    this.name = 'TypeScriptNotInstalledError'
  }
}

export function resolveTypeScriptBinary(cwd: string): string {
  try {
    return createRequire(path.join(cwd, 'package.json')).resolve(TYPESCRIPT_BIN)
  } catch {
    throw new TypeScriptNotInstalledError()
  }
}

export function runTypeScript(cwd: string, args: string[], stdio: 'inherit' | 'pipe'): void {
  execFileSync(process.execPath, [resolveTypeScriptBinary(cwd), ...args], { cwd, stdio })
}
