import { Command } from 'commander'
import { getStoredToken } from '../lib/auth.js'
import { ok, info } from '../lib/output.js'

export const whoamiCommand = new Command('whoami')
  .description('Show the authenticated GitHub username')
  .action(() => {
    const token = getStoredToken()
    if (!token) {
      info('Not signed in. Run `amc-plugin publish` to authenticate.')
      return
    }
    ok(`Signed in as: ${token.github} (uid: ${token.uid})`)
  })
