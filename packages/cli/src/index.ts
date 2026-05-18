#!/usr/bin/env node

import { Command } from 'commander'
import { createCommand } from './commands/create.js'
import { buildCommand } from './commands/build.js'
import { validateCommand } from './commands/validate.js'
import { packageCommand } from './commands/package.js'
import { publishCommand } from './commands/publish.js'
import { whoamiCommand } from './commands/whoami.js'
import { logoutCommand } from './commands/logout.js'
import { statusCommand } from './commands/status.js'

const program = new Command()

program
  .name('amc-plugin')
  .description('CLI tool for building Agent Mission Control plugins')
  .version('1.0.0')

program.addCommand(createCommand)
program.addCommand(buildCommand)
program.addCommand(validateCommand)
program.addCommand(packageCommand)
program.addCommand(publishCommand)
program.addCommand(whoamiCommand)
program.addCommand(logoutCommand)
program.addCommand(statusCommand)

program.parse()
