import chalk from 'chalk'

export const ok = (msg: string) => console.log(chalk.green(`✓ ${msg}`))
export const fail = (msg: string) => console.error(chalk.red(`✗ ${msg}`))
export const warn = (msg: string) => console.warn(chalk.yellow(`⚠ ${msg}`))
export const info = (msg: string) => console.log(chalk.blue(`ℹ ${msg}`))
export const label = (name: string, value: string) => console.log(`${chalk.bold(name)} ${value}`)
export const filePath = (p: string) => chalk.cyan(p)
export const heading = (msg: string) => console.log(chalk.bold.underline(`\n${msg}\n`))

export function actionableError(message: string, suggestion: string): void {
  console.error(chalk.red(`✗ ${message}`))
  console.error(chalk.dim(`  → ${suggestion}`))
}

export function manifestNotFound(): never {
  actionableError(
    'No manifest.json found in current directory',
    "Run 'amc-plugin create <name>' to scaffold a new plugin."
  )
  process.exit(1)
}

export function notAuthenticated(): never {
  actionableError(
    'Not authenticated with the AMC Marketplace',
    "Run 'amc-plugin publish' to log in via GitHub."
  )
  process.exit(1)
}
