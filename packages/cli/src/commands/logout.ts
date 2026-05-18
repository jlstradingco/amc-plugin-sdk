import { Command } from 'commander'
import { clearToken, getStoredToken } from '../lib/auth.js'

export const logoutCommand = new Command('logout')
  .description('Clear stored marketplace authentication token')
  .action(() => {
    const token = getStoredToken()
    if (!token) {
      console.log('Not signed in.')
      return
    }
    clearToken()
    console.log(`Signed out (was: ${token.github})`)
  })
