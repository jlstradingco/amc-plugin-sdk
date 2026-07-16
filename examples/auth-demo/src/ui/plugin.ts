import type { AgentMC } from '@agent-mc/plugin-sdk/browser'

const amc = (window as unknown as { AgentMC: AgentMC }).AgentMC

const identityPre = document.getElementById('identity') as HTMLPreElement
const sessionPre = document.getElementById('session') as HTMLPreElement
const whoBtn = document.getElementById('btn-who') as HTMLButtonElement
const signinBtn = document.getElementById('btn-signin') as HTMLButtonElement
const googleBtn = document.getElementById('btn-google') as HTMLButtonElement
const githubBtn = document.getElementById('btn-github') as HTMLButtonElement

// Never render a raw access token — mask everything but a short prefix.
function maskToken(token: string): string {
  if (token.length <= 8) return '••••••'
  return `${token.slice(0, 6)}…(${token.length} chars)`
}

async function refreshIdentity() {
  const [authed, user] = await Promise.all([amc.auth.isAuthenticated(), amc.auth.getUser()])
  if (!user) {
    identityPre.textContent = authed ? 'Signed in, but no profile returned.' : 'Not signed in.'
    return
  }
  identityPre.textContent = JSON.stringify(
    {
      authenticated: authed,
      uid: user.uid,
      email: user.email,
      displayName: user.displayName,
      photoURL: user.photoURL
    },
    null,
    2
  )
}

async function requestToken(provider: 'google' | 'github', scopes: string[]) {
  sessionPre.textContent = `Requesting ${provider} token…`
  try {
    const session = await amc.auth.getSession(provider, scopes, { createIfNone: true })
    if (!session) {
      sessionPre.textContent = `No ${provider} session available (the user declined or is not signed in).`
      return
    }
    sessionPre.textContent = JSON.stringify(
      {
        provider: session.provider,
        accessToken: maskToken(session.accessToken),
        scopes: session.scopes,
        expiresAt: new Date(session.expiresAt).toISOString(),
        account: session.account
      },
      null,
      2
    )
  } catch (err) {
    sessionPre.textContent = `Token request failed: ${String(err)}`
  }
}

whoBtn.addEventListener('click', refreshIdentity)

signinBtn.addEventListener('click', async () => {
  const result = await amc.auth.requestSignIn()
  if (result.success) await refreshIdentity()
})

googleBtn.addEventListener('click', () =>
  requestToken('google', ['https://www.googleapis.com/auth/calendar.readonly'])
)
githubBtn.addEventListener('click', () => requestToken('github', ['repo']))

// Keep the identity card live as the user signs in or out.
amc.auth.onAuthStateChange(() => {
  refreshIdentity()
})

refreshIdentity()
