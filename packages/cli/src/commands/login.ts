import { Command } from 'commander'
import { authenticate, getStoredToken, getTokenPath, resolveGithubLogin } from '../lib/auth.js'
import { SWITCH_ACCOUNT_GUIDANCE } from '../lib/publish-account.js'
import { actionableError, info, ok } from '../lib/output.js'

export async function runLogin(): Promise<void> {
  const stored = getStoredToken()
  if (stored) {
    const github = (await resolveGithubLogin(stored)) ?? stored.github
    ok(`Signed in as ${github} (uid: ${stored.uid})`)
    info(`Credential: ${getTokenPath()}`)
    info("To switch accounts, run 'omniscio-plugin logout' and then 'omniscio-plugin login'.")
    console.log(SWITCH_ACCOUNT_GUIDANCE)
    return
  }

  info('You are about to sign in to the Omniscio Marketplace with GitHub.')
  console.log(SWITCH_ACCOUNT_GUIDANCE)
  console.log('')

  try {
    const token = await authenticate()
    ok(`Signed in as ${token.github} (uid: ${token.uid})`)
    info(`Credential saved to ${getTokenPath()}`)
  } catch (err) {
    actionableError(
      err instanceof Error ? err.message : 'GitHub sign-in did not complete.',
      "Check your network connection, then run 'omniscio-plugin login' again."
    )
    process.exitCode = 1
  }
}

export const loginCommand = new Command('login')
  .description('Sign in to the Omniscio Marketplace with GitHub')
  .action(runLogin)
