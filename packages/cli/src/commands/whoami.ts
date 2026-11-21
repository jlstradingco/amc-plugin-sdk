import { Command } from 'commander'
import { getStoredTokenIgnoringExpiry, isTokenFresh, resolveGithubLogin } from '../lib/auth.js'
import { ok, info } from '../lib/output.js'

export const whoamiCommand = new Command('whoami')
  .description('Show the authenticated GitHub username')
  .action(async () => {
    const token = getStoredTokenIgnoringExpiry()
    if (!token) {
      info('Not signed in. Run `omniscio-plugin login` to sign in.')
      return
    }
    const github = (await resolveGithubLogin(token)) ?? token.github
    ok(`Signed in as: ${github} (uid: ${token.uid})`)
    if (!isTokenFresh(token)) {
      info('Access token has expired; the next command should renew it without a browser.')
      info('If it asks you to sign in again, the session was revoked.')
    }
  })
