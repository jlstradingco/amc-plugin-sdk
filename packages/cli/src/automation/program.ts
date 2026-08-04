import { Command } from 'commander'
import { createInitCommand } from './commands/init.js'
import { createValidateCommand } from './commands/validate.js'
import { createPublishCommand } from './commands/publish.js'
import { createStatusCommand } from './commands/status.js'

/**
 * Build the `amc-automation` command tree.
 *
 * Extracted from the entrypoint so the argv WIRING is reachable from tests. Every existing
 * automation test drives the `run*` functions directly, which bypasses commander entirely —
 * that is precisely how the `--version` shadowing below survived: no test ever parsed an
 * argv array. Anything that depends on how flags are matched must go through this factory.
 *
 * The returned program is not configured for output capture; callers that need to assert on
 * stdout/stderr should use {@link configureProgramForTest}.
 *
 * @param version - The CLI's own version, reported by the top-level `--version`.
 * @returns A fully wired, unparsed commander program.
 */
export function buildAutomationProgram(version: string): Command {
  const program = new Command()

  program
    .name('amc-automation')
    .description('CLI tool for publishing Agent Mission Control automations')
    .version(version)
    // Without this, commander matches the program's own `-V, --version` ANYWHERE in argv, so
    // `validate --version 1.0.0` and `publish --version 2.0.0` printed the CLI version and
    // exited 0 — silently, having neither validated nor published. Both subcommands declare
    // their own `--version <version>` (the submission's version), which was unreachable as a
    // result, pinning every automation to DEFAULT_PUBLISH_VERSION forever.
    //
    // Positional options scope the program's flags to the argv BEFORE the subcommand name, so
    // `amc-automation --version` still reports the CLI version while the subcommands keep
    // theirs. Consequence to preserve: any FUTURE program-level option must be passed before
    // the subcommand name, never after it.
    .enablePositionalOptions()

  // FRESH instances per build. Commander stores parsed option values on the Command
  // object, so sharing module-level singletons here made every "new" program inherit the
  // last parse's flags — two builds were never independent.
  program.addCommand(createInitCommand())
  program.addCommand(createValidateCommand())
  program.addCommand(createPublishCommand())
  program.addCommand(createStatusCommand())

  return program
}

/**
 * Stop a program from killing the test process and let its output be asserted on.
 *
 * Commander's default behaviour on `--version`, `--help`, and parse errors is to write to the
 * real stdout/stderr and call `process.exit`. Both are fatal inside vitest, so tests need the
 * exit turned into a throw and the writers redirected before parsing.
 *
 * @param program - The program to reconfigure, usually from {@link buildAutomationProgram}.
 * @param sink - Receives every chunk commander would have written to stdout or stderr.
 * @returns The same program, for chaining.
 */
export function configureProgramForTest(program: Command, sink: string[]): Command {
  const capture = {
    writeOut: (str: string) => sink.push(str),
    writeErr: (str: string) => sink.push(str)
  }
  // exitOverride() and configureOutput() are PER-COMMAND, not inherited. Applying them to the
  // program alone left every subcommand still calling process.exit — so `validate --nope`
  // (unknown option), `validate --version` (missing argument) and `validate --help` killed the
  // test worker instead of throwing a CommanderError the assertion could inspect.
  program.exitOverride().configureOutput(capture)
  for (const sub of program.commands) {
    sub.exitOverride().configureOutput(capture)
  }
  return program
}
