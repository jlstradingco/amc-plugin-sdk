import { describe, it, expect, beforeEach } from 'vitest'
import type { Command } from 'commander'
import { buildAutomationProgram, configureProgramForTest } from '../program.js'
import { DEFAULT_PUBLISH_VERSION, DEFAULT_PUBLISH_CATEGORY } from '../lib/envelope.js'

// These tests exist because every OTHER automation test drives the `run*` functions directly,
// which skips commander. That gap let `--version` shadowing ship: the subcommands' own
// `--version <version>` was unreachable, and both `validate` and `publish` exited 0 having
// silently done nothing. Anything here must go through argv, never through `run*`.

const CLI_VERSION = '9.9.9'

/**
 * Each `buildAutomationProgram` call now yields FRESH subcommand instances, so spying an
 * action here cannot leak into another test — and, more importantly, neither can a parsed
 * option value. They were module-level singletons until 2026-08-04, which meant commander
 * carried `--version 1.0.0` from one parse into the next and the default-value tests below
 * passed alone but failed in a full run.
 */
function programWithSpiedAction(name: string): {
  program: Command
  calls: Array<{ arg: unknown; options: Record<string, unknown> }>
} {
  const program = buildAutomationProgram(CLI_VERSION)
  const calls: Array<{ arg: unknown; options: Record<string, unknown> }> = []
  const sub = program.commands.find((c) => c.name() === name)
  if (!sub) throw new Error(`no such subcommand: ${name}`)
  sub.action((arg: unknown, options: Record<string, unknown>) => {
    calls.push({ arg, options })
  })
  return { program, calls }
}

/** Parse user-supplied args, with commander's exit turned into a throw. */
async function parse(program: Command, args: string[], sink: string[] = []): Promise<void> {
  await configureProgramForTest(program, sink).parseAsync(args, { from: 'user' })
}

describe('amc-automation argv wiring', () => {
  describe('the top-level --version still reports the CLI version', () => {
    let sink: string[]

    beforeEach(() => {
      sink = []
    })

    it('prints the CLI version for --version with no subcommand', async () => {
      const program = buildAutomationProgram(CLI_VERSION)
      await expect(parse(program, ['--version'], sink)).rejects.toMatchObject({
        code: 'commander.version'
      })
      expect(sink.join('')).toContain(CLI_VERSION)
    })

    it('prints the CLI version for the -V short flag too', async () => {
      const program = buildAutomationProgram(CLI_VERSION)
      await expect(parse(program, ['-V'], sink)).rejects.toMatchObject({
        code: 'commander.version'
      })
      expect(sink.join('')).toContain(CLI_VERSION)
    })

    it('still renders --help', async () => {
      const program = buildAutomationProgram(CLI_VERSION)
      await expect(parse(program, ['--help'], sink)).rejects.toMatchObject({
        code: 'commander.helpDisplayed'
      })
      const out = sink.join('')
      expect(out).toContain('amc-automation')
      for (const name of ['init', 'validate', 'publish', 'status']) {
        expect(out).toContain(name)
      }
    })
  })

  // The regression the fix exists for. Before enablePositionalOptions() every case in this
  // block printed CLI_VERSION and exited 0 with the action never invoked.
  describe('regression: subcommand --version is no longer swallowed by the program', () => {
    it('routes validate --version to the validate action', async () => {
      const { program, calls } = programWithSpiedAction('validate')
      await parse(program, ['validate', '--version', '1.0.0'])
      expect(calls).toHaveLength(1)
      expect(calls[0]?.options.version).toBe('1.0.0')
    })

    it('routes publish --version to the publish action', async () => {
      const { program, calls } = programWithSpiedAction('publish')
      await parse(program, ['publish', '--version', '2.0.0'])
      expect(calls).toHaveLength(1)
      expect(calls[0]?.options.version).toBe('2.0.0')
    })

    it('does not print the CLI version when a subcommand consumes --version', async () => {
      const sink: string[] = []
      const { program } = programWithSpiedAction('validate')
      await parse(program, ['validate', '--version', '1.0.0'], sink)
      expect(sink.join('')).not.toContain(CLI_VERSION)
    })

    it('passes a malformed version through rather than short-circuiting on it', async () => {
      // The CLI must reach its own validator so the user gets a version error. Previously the
      // value was never seen and the command reported success.
      const { program, calls } = programWithSpiedAction('validate')
      await parse(program, ['validate', '--version', 'not-a-version'])
      expect(calls[0]?.options.version).toBe('not-a-version')
    })

    it('keeps a version that merely looks like a flag value intact', async () => {
      const { program, calls } = programWithSpiedAction('publish')
      await parse(program, ['publish', '--version', '10.20.30'])
      expect(calls[0]?.options.version).toBe('10.20.30')
    })
  })

  describe('defaults still apply when --version is omitted', () => {
    it('defaults validate to the shared publish version', async () => {
      const { program, calls } = programWithSpiedAction('validate')
      await parse(program, ['validate'])
      expect(calls[0]?.options.version).toBe(DEFAULT_PUBLISH_VERSION)
    })

    it('defaults publish to the shared publish version', async () => {
      const { program, calls } = programWithSpiedAction('publish')
      await parse(program, ['publish'])
      expect(calls[0]?.options.version).toBe(DEFAULT_PUBLISH_VERSION)
    })

    it('defaults the category alongside it', async () => {
      const { program, calls } = programWithSpiedAction('validate')
      await parse(program, ['validate'])
      expect(calls[0]?.options.category).toBe(DEFAULT_PUBLISH_CATEGORY)
    })
  })

  describe('the other subcommand flags were not collateral damage', () => {
    it('parses validate --check', async () => {
      const { program, calls } = programWithSpiedAction('validate')
      await parse(program, ['validate', '--check'])
      expect(calls[0]?.options.check).toBe(true)
    })

    it('parses validate --json', async () => {
      const { program, calls } = programWithSpiedAction('validate')
      await parse(program, ['validate', '--json'])
      expect(calls[0]?.options.json).toBe(true)
    })

    it('parses validate --category', async () => {
      const { program, calls } = programWithSpiedAction('validate')
      await parse(program, ['validate', '--category', 'productivity'])
      expect(calls[0]?.options.category).toBe('productivity')
    })

    it('parses the positional file argument', async () => {
      const { program, calls } = programWithSpiedAction('validate')
      await parse(program, ['validate', 'my.recipe.json'])
      expect(calls[0]?.arg).toBe('my.recipe.json')
    })

    it('parses a file argument and --version together', async () => {
      const { program, calls } = programWithSpiedAction('validate')
      await parse(program, ['validate', 'my.recipe.json', '--version', '3.0.0'])
      expect(calls[0]?.arg).toBe('my.recipe.json')
      expect(calls[0]?.options.version).toBe('3.0.0')
    })

    it('parses several flags at once without them interfering', async () => {
      const { program, calls } = programWithSpiedAction('validate')
      await parse(program, [
        'validate',
        '--check',
        '--json',
        '--version',
        '4.5.6',
        '--category',
        'productivity'
      ])
      expect(calls[0]?.options).toMatchObject({
        check: true,
        json: true,
        version: '4.5.6',
        category: 'productivity'
      })
    })

    it('renders subcommand help rather than the program version', async () => {
      const sink: string[] = []
      const program = buildAutomationProgram(CLI_VERSION)
      await expect(parse(program, ['validate', '--help'], sink)).rejects.toMatchObject({
        code: 'commander.helpDisplayed'
      })
      const out = sink.join('')
      expect(out).toContain('--version')
      expect(out).not.toContain(CLI_VERSION)
    })
  })

  describe('positional options do not weaken error reporting', () => {
    it('still rejects an unknown subcommand flag', async () => {
      const program = buildAutomationProgram(CLI_VERSION)
      await expect(parse(program, ['validate', '--nope'])).rejects.toMatchObject({
        code: 'commander.unknownOption'
      })
    })

    it('still rejects an unknown subcommand', async () => {
      const program = buildAutomationProgram(CLI_VERSION)
      await expect(parse(program, ['nope'])).rejects.toMatchObject({
        code: 'commander.unknownCommand'
      })
    })

    it('still rejects --version given no value on a subcommand', async () => {
      const program = buildAutomationProgram(CLI_VERSION)
      await expect(parse(program, ['validate', '--version'])).rejects.toMatchObject({
        code: 'commander.optionMissingArgument'
      })
    })
  })
})
