import { Command } from 'commander'
import { clearToken, getStoredTokenIgnoringExpiry, getTokenPath } from '../lib/auth.js'
import { ok, info, actionableError } from '../lib/output.js'

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
    // Report what actually happened. A failed unlink (the file held open by another
    // AMC process, a read-only home) used to throw a stack trace; claiming "Signed
    // out" instead would be worse still, because the credential is the whole point of
    // the command and it would still be sitting on disk.
    if (!clearToken()) {
      actionableError(
        `Could not remove the stored credential for ${token.github}`,
        `Delete it by hand: ${getTokenPath()}`
      )
      process.exitCode = 1
      return
    }
    ok(`Signed out (was: ${token.github})`)
  })
