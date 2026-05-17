#!/usr/bin/env node

import { Command } from 'commander'
import { createCommand } from './commands/create.js'
import { buildCommand } from './commands/build.js'
import { validateCommand } from './commands/validate.js'
import { packageCommand } from './commands/package.js'

const program = new Command()

program
  .name('amc-plugin')
  .description('CLI tool for building Agent Mission Control plugins')
  .version('1.0.0')

program.addCommand(createCommand)
program.addCommand(buildCommand)
program.addCommand(validateCommand)
program.addCommand(packageCommand)

program.parse()
