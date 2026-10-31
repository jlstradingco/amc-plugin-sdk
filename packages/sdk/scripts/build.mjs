// @script what="Builds @agent-mc/plugin-sdk into dist: compiles the ESM and CommonJS outputs with the package's own TypeScript, then marks dist/cjs as CommonJS." kind="entrypoint" owner="plugin-sdk"
import { execFileSync } from 'node:child_process'
import { writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

const PACKAGE_DIR = fileURLToPath(new URL('..', import.meta.url))
const TSC = createRequire(join(PACKAGE_DIR, 'package.json')).resolve('typescript/bin/tsc')
const TS_CONFIGS = ['tsconfig.json', 'tsconfig.cjs.json']
const CJS_PACKAGE_JSON = join(PACKAGE_DIR, 'dist', 'cjs', 'package.json')

for (const config of TS_CONFIGS) {
  execFileSync(process.execPath, [TSC, '-p', join(PACKAGE_DIR, config)], {
    cwd: PACKAGE_DIR,
    stdio: 'inherit',
    windowsHide: true
  })
}
writeFileSync(CJS_PACKAGE_JSON, JSON.stringify({ type: 'commonjs' }))
