import { Command } from 'commander'
import { getStoredToken } from '../lib/auth.js'

export const whoamiCommand = new Command('whoami')
  .description('Show the authenticated GitHub username')
  .action(() => {
    const token = getStoredToken()
    if (!token) {
      console.log('Not signed in. Run `amc-plugin publish` to authenticate.')
      return
    }
    console.log(`Signed in as: ${token.github} (uid: ${token.uid})`)
  })
