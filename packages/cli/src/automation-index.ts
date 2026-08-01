#!/usr/bin/env node

import { createRequire } from 'node:module'
import { buildAutomationProgram } from './automation/program.js'

const require = createRequire(import.meta.url)
const { version } = require('../package.json')

buildAutomationProgram(version).parse()
