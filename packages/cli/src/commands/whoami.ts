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
      // Deliberately "should", not "will": renewal needs the refresh token to still be
      // accepted, and a revoked session fails exactly here. Promising a silent renewal
      // for a credential that is actually dead sends the user to the wrong diagnosis.
      info('Access token has expired; the next command should renew it without a browser.')
      info('If it asks you to sign in again, the session was revoked.')
    }
  })
