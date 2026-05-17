#!/usr/bin/env node

import { Command } from 'commander'
import { createCommand } from './commands/create.js'

const program = new Command()

program
  .name('amc-plugin')
  .description('CLI tool for building Agent Mission Control plugins')
  .version('1.0.0')

program.addCommand(createCommand)

program.parse()
