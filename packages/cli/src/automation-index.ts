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

program.addCommand(initCommand)
program.addCommand(validateCommand)
program.addCommand(publishCommand)
program.addCommand(statusCommand)

program.parse()
