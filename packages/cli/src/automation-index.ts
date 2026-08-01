#!/usr/bin/env node

import { Command } from 'commander'
import { createRequire } from 'node:module'
import { initCommand } from './automation/commands/init.js'
import { validateCommand } from './automation/commands/validate.js'
import { publishCommand } from './automation/commands/publish.js'
import { statusCommand } from './automation/commands/status.js'

const require = createRequire(import.meta.url)
const { version } = require('../package.json')

const program = new Command()

program
  .name('amc-automation')
  .description('CLI tool for publishing Agent Mission Control automations')
  .version(version)
  // Without this, commander matches the program's own `-V, --version` ANYWHERE in argv, so
  // `validate --version 1.0.0` and `publish --version 2.0.0` printed the CLI version and exited
  // 0 — silently, having neither validated nor published. Both subcommands declare their own
  // `--version <version>` (the submission's version), which was unreachable as a result.
  // Positional options scope the program's flags to the argv BEFORE the subcommand name, so
  // `amc-automation --version` still reports the CLI version while the subcommands keep theirs.
  .enablePositionalOptions()

program.addCommand(initCommand)
program.addCommand(validateCommand)
program.addCommand(publishCommand)
program.addCommand(statusCommand)

program.parse()
