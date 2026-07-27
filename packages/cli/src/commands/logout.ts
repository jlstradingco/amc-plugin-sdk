import { Command } from 'commander'
import { clearToken, getStoredTokenIgnoringExpiry } from '../lib/auth.js'
import { ok, info } from '../lib/output.js'

export const logoutCommand = new Command('logout')
  .description('Clear stored marketplace authentication token')
  .action(() => {
    // Deliberately ignores expiry. Reading through the expiry check meant an
    // expired token made logout print "Not signed in" and return WITHOUT
    // deleting the file — leaving the long-lived refresh token on disk, which
    // silent renewal then makes a working credential again. Sign-out has to
    // remove the credential precisely when it looks stale.
    const token = getStoredTokenIgnoringExpiry()
    if (!token) {
      info('Not signed in')
      return
    }
    clearToken()
    ok(`Signed out (was: ${token.github})`)
  })
