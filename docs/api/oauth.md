# OAuth

Sign the user in to a third-party service with your own OAuth client, and receive the tokens in your backend.

**Availability:** Backend only (`ctx.oauth`). There is no webview counterpart.
**Required Permission:** `oauth`

::: warning Elevated permission
`oauth` is an elevated permission. Omniscio shows it to the user as "Third-Party Sign-in: Sign you in to third-party services you choose to connect" and marks it as elevated on the install card. Neither `network` nor `auth.session` grants it.
:::

You bring your own OAuth app (its client id and, for a confidential client, its secret). Omniscio's own sign-in credentials are never involved. Omniscio opens the user's browser, receives the redirect on a temporary local address, applies PKCE and a random `state` check, and exchanges the code for tokens. The tokens go to your backend only; they never reach your panel.

`ctx.oauth` is optional on `PluginContext`, so check it before use.

## Permissions

```json
{
  "permissions": ["oauth", "secrets"]
}
```

`secrets` is not required by `oauth`, but you need somewhere to keep the tokens (see below).

## Methods

### `authorize(request: PluginOAuthRequest): Promise<PluginOAuthResult>`

Run one OAuth 2.0 authorization-code sign-in.

**Returns:** `Promise<PluginOAuthResult>`. Every failure is `{ ok: false, error }` with a plain-language message. Always check `ok`.

Only one sign-in per plugin can be in progress. A second call while one is open resolves `ok: false`. A sign-in the user abandons ends after 5 minutes.

## Types

```typescript
interface PluginOAuthRequest {
  /** The service's authorization page address. */
  authUrl: string
  /** The service's token endpoint address. */
  tokenUrl: string
  clientId: string
  clientSecret?: string
  /** A space-separated string or a list of scopes. */
  scopes?: string | string[]
  /** Extra query parameters for the authorization page. The host never lets these replace its own. */
  extraAuthParams?: Record<string, string>
}

interface PluginOAuthTokens {
  accessToken: string
  refreshToken?: string
  tokenType?: string
  scope?: string
  /** Seconds until the access token expires, as the service reported it. */
  expiresIn?: number
  /** When the access token expires, as epoch milliseconds. */
  expiresAt?: number
  idToken?: string
}

type PluginOAuthResult =
  | { ok: true; tokens: PluginOAuthTokens }
  | { ok: false; error: string }
```

## What Omniscio does and refuses

- `authUrl` and `tokenUrl` must be `https://` addresses. Addresses that are, or resolve to, localhost or a private network are refused.
- Any `https://` provider is allowed. The user sees the provider's own consent screen in their browser.
- PKCE (S256) and a random `state` are always used. There is no option to turn them off.
- The redirect address is always a temporary `http://localhost` address on a port Omniscio picks at run time, with the path `/callback`. You cannot supply or change it, so your OAuth app must allow a loopback redirect like that.
- `extraAuthParams` cannot replace the parameters Omniscio sets itself (`client_id`, `redirect_uri`, `response_type`, `code_challenge`, `code_challenge_method`, `state`); a value you pass for one of them is dropped.

## Example

```typescript
import type { PluginContext } from '@omniscio/plugin-sdk'

export async function activate(ctx: PluginContext) {
  async function connect() {
    if (!ctx.oauth) return false

    const result = await ctx.oauth.authorize({
      authUrl: 'https://accounts.example.com/oauth/authorize',
      tokenUrl: 'https://accounts.example.com/oauth/token',
      clientId: 'my-client-id',
      scopes: ['read', 'offline_access'],
    })

    if (!result.ok) {
      ctx.toast.show({ type: 'error', message: result.error })
      return false
    }

    await ctx.secrets.set('example:access', result.tokens.accessToken)
    if (result.tokens.refreshToken) {
      await ctx.secrets.set('example:refresh', result.tokens.refreshToken)
    }
    return true
  }

  return {}
}
```

## Notes

- `authorize` is stateless. Omniscio keeps no copy of the tokens. Store them yourself in [`ctx.secrets`](./secrets).
- There is no refresh helper. To refresh, call your provider's token endpoint yourself with [`ctx.http.fetch`](./http), using the refresh token you stored (this needs the `network` permission).
- Disabling the plugin does not delete what you saved in `ctx.secrets`.
