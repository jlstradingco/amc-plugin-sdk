import { Command } from 'commander'
import { getStoredTokenIgnoringExpiry, isTokenFresh } from '../lib/auth.js'
import { ok, info } from '../lib/output.js'

export const whoamiCommand = new Command('whoami')
  .description('Show the authenticated GitHub username')
  .action(() => {
    // Identity is a local fact, so this reads the file rather than spending a
    // network round trip to renew a credential it never uses. Reading through
    // the expiry check instead would print "Not signed in" once the hour-long
    // ID token lapsed — while the refresh token beside it was still good and
    // the next publish would renew without a browser.
    const token = getStoredTokenIgnoringExpiry()
    if (!token) {
      info('Not signed in. Run `amc-plugin publish` to authenticate.')
      return
    }
    ok(`Signed in as: ${token.github} (uid: ${token.uid})`)
    if (!isTokenFresh(token)) {
      info('Access token has expired; it will renew silently on the next command.')
    }
  })
