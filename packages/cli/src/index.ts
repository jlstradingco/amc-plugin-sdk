#!/usr/bin/env node

import { Command } from 'commander'
import { createRequire } from 'node:module'
import { createCommand } from './commands/create.js'
import { buildCommand } from './commands/build.js'
import { validateCommand } from './commands/validate.js'
import { packageCommand } from './commands/package.js'
import { installCommand } from './commands/install.js'
import { preflightCommand } from './commands/preflight.js'
import { publishCommand } from './commands/publish.js'
import { whoamiCommand } from './commands/whoami.js'
import { logoutCommand } from './commands/logout.js'
import { statusCommand } from './commands/status.js'
import { devCommand } from './commands/dev.js'
import { infoCommand } from './commands/info.js'
import { updateCommand } from './commands/update.js'
import { testCommand } from './commands/test.js'
import { doctorCommand } from './commands/doctor.js'

const require = createRequire(import.meta.url)
const { version } = require('../package.json')

const program = new Command()

program
  .name('amc-plugin')
  .description('CLI tool for building Agent Mission Control plugins')
  .version(version)

program.addCommand(createCommand)
program.addCommand(buildCommand)
program.addCommand(validateCommand)
program.addCommand(packageCommand)
program.addCommand(installCommand)
program.addCommand(preflightCommand)
program.addCommand(publishCommand)
program.addCommand(whoamiCommand)
program.addCommand(logoutCommand)
program.addCommand(statusCommand)
program.addCommand(devCommand)
program.addCommand(infoCommand)
program.addCommand(updateCommand)
program.addCommand(testCommand)
program.addCommand(doctorCommand)

program.parse()
