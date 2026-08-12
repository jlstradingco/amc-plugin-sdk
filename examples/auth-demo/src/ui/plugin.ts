import type { AgentMC } from '@agent-mc/plugin-sdk/browser'

const amc = (window as unknown as { AgentMC: AgentMC }).AgentMC

const identityPre = document.getElementById('identity') as HTMLPreElement
const sessionPre = document.getElementById('session') as HTMLPreElement
const whoBtn = document.getElementById('btn-who') as HTMLButtonElement
const signinBtn = document.getElementById('btn-signin') as HTMLButtonElement
const googleBtn = document.getElementById('btn-google') as HTMLButtonElement
const githubBtn = document.getElementById('btn-github') as HTMLButtonElement

// Never render a raw token — mask everything but a short prefix.
function maskToken(token: string): string {
  if (token.length <= 8) return '••••••'
  return `${token.slice(0, 6)}…(${token.length} chars)`
}

/**
 * WHAT CHANGED, AND WHY IT MATTERS FOR YOUR PLUGIN.
 *
 * This demo used to call `AgentMC.auth.getUser()`, `.isAuthenticated()`,
 * `.getSession()`, `.requestSignIn()` and `.onAuthStateChange()`. None of those
 * exist on the webview bridge — they are the BACKEND surface (`ctx.auth`), and
 * the SDK wrongly declared them here, so every one was a TypeError and this
 * example could never have run.
 *
 * The webview's auth namespace has exactly one method: `getWebAuth()`. It hands
 * back AMC's Firebase config plus a custom token, so your webview can sign into
 * the SAME identity AMC holds, using the Firebase Web SDK.
 *
 * If you need `getUser` / `getSession` / OAuth provider tokens, do that in your
 * plugin's BACKEND (`ctx.auth`) and pass the result to your webview — through
 * `ctx.events` / `AgentMC.events`, or via the host's `AgentMC.backend.invoke`
 * request/response bridge.
 */
async function refreshIdentity() {
  identityPre.textContent = 'Requesting web auth handoff…'
  try {
    const webAuth = await amc.auth.getWebAuth()
    identityPre.textContent = JSON.stringify(
      {
        projectId: webAuth.config.projectId,
        authDomain: webAuth.config.authDomain,
        organizationId: webAuth.organizationId,
        customToken: maskToken(webAuth.customToken)
      },
      null,
      2
    )
    sessionPre.textContent =
      'Next step: pass this config + customToken to the Firebase Web SDK and call\n' +
      'signInWithCustomToken(auth, customToken). Your webview is then signed in as\n' +
      'the same user AMC is.'
  } catch (err) {
    // The host throws a humanized error when AMC holds no cached identity.
    identityPre.textContent = `No web auth available: ${String(err)}`
    sessionPre.textContent = 'Sign in to AMC itself first, then try again.'
  }
}

function explainBackendOnly(what: string) {
  sessionPre.textContent =
    `${what} is a BACKEND capability (ctx.auth), not a webview one.\n\n` +
    'Call it from your plugin backend and forward the result to this webview\n' +
    'over ctx.events / AgentMC.events. See the comment at the top of this file.'
}

whoBtn.addEventListener('click', refreshIdentity)
signinBtn.addEventListener('click', () => explainBackendOnly('requestSignIn()'))
googleBtn.addEventListener('click', () => explainBackendOnly('getSession("google", …)'))
githubBtn.addEventListener('click', () => explainBackendOnly('getSession("github", …)'))

refreshIdentity()
