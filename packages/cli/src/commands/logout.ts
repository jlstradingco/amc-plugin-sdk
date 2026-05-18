import { Command } from 'commander'
import { clearToken, getStoredToken } from '../lib/auth.js'
import { ok, info } from '../lib/output.js'

export const logoutCommand = new Command('logout')
  .description('Clear stored marketplace authentication token')
  .action(() => {
    const token = getStoredToken()
    if (!token) {
      info('Not signed in')
      return
    }
    clearToken()
    ok(`Signed out (was: ${token.github})`)
  })
