import { execFileSync } from 'node:child_process'
import { createRequire } from 'node:module'
import * as path from 'node:path'

const SDK_PACKAGE = path.resolve(__dirname, '../../../sdk')
const CLI_PACKAGE = path.resolve(__dirname, '../..')

export function buildSdkAndCli(): void {
  execFileSync(process.execPath, [path.join(SDK_PACKAGE, 'scripts', 'build.mjs')], { stdio: 'pipe' })
  const tsc = createRequire(path.join(CLI_PACKAGE, 'package.json')).resolve('typescript/bin/tsc')
  execFileSync(process.execPath, [tsc, '-p', CLI_PACKAGE], { stdio: 'pipe' })
}
