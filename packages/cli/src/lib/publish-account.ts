/**
 * Publish identity gating. GitHub OAuth silently reuses whatever account the
 * default browser is already signed into, so a publish can go out under the
 * wrong identity. These pure helpers decide whether to proceed, confirm the
 * identity interactively, or abort — the command module does the I/O.
 */

export type PublishAccountGate =
  | { action: 'proceed' }
  | { action: 'confirm'; github: string }
  | { action: 'abort'; message: string; suggestion: string }

/**
 * The publish command whose `--switch-account` the abort advice should name.
 * Both binaries share ONE token file, so either command can perform the switch —
 * but the advice should name the one the author is actually running.
 */
const DEFAULT_PUBLISH_COMMAND = 'amc-plugin publish'

export function evaluatePublishAccount(
  storedGithub: string | null,
  opts: { as?: string; yes?: boolean; commandName?: string } = {}
): PublishAccountGate {
  const command = opts.commandName ?? DEFAULT_PUBLISH_COMMAND
  if (opts.as && storedGithub && storedGithub.toLowerCase() !== opts.as.toLowerCase()) {
    return {
      action: 'abort',
      message: `Signed in as "${storedGithub}", but --as expected "${opts.as}"`,
      suggestion: `Run '${command} --switch-account' to sign in as the intended GitHub account.`
    }
  }
  if (opts.yes) return { action: 'proceed' }
  if (storedGithub) return { action: 'confirm', github: storedGithub }
  return { action: 'proceed' }
}

export const SWITCH_ACCOUNT_GUIDANCE = [
  'GitHub sign-in reuses whatever account your default browser is already logged into.',
  'To publish under a different account, do ONE of these first:',
  '  - Open an incognito / private window and sign into the correct GitHub account, or',
  '  - Sign out of the wrong account at https://github.com/logout, then re-run this.'
].join('\n')
