# Auth

Read the identity of the signed-in AMC user, and request scoped access tokens for Google and GitHub on their behalf.

**Availability:** Backend only (`ctx.auth`)

::: danger The webview's `AgentMC.auth` is a DIFFERENT, one-method namespace
This page previously said "Both". None of the six methods below exists on the webview
bridge -- calling `AgentMC.auth.getUser()` is a `TypeError`, not a permission error.

`AgentMC.auth` has exactly one method, `getWebAuth()`, which returns AMC's Firebase config
plus a custom token so your webview can sign into the same identity via the Firebase Web
SDK. Everything on this page is the **backend** surface. If your UI needs any of it, call it
from your backend and forward the result over `ctx.events` -> `AgentMC.events`.
:::
**Required Permission:** `auth` (identity) -- plus `auth.session` for `getSession()`

There are two levels here:

- **Identity** (`auth` permission) -- see who is signed in and react to sign-in state.
- **Account access** (`auth.session` permission) -- obtain a scoped OAuth access token to call Google or GitHub APIs as the user.

## Identity methods

These require the `auth` permission.

### `getUser(): Promise<PluginAuthUser | null>`

Return the currently signed-in user, or `null` if nobody is signed in.

### `isAuthenticated(): Promise<boolean>`

Return whether a user is currently signed in.

### `getGoogleIdToken(): Promise<string | null>`

Return a Google ID token for the signed-in user, or `null` if unavailable. Use this to verify identity to your own backend.

### `onAuthStateChange(handler: (user: PluginAuthUser | null) => void): () => void`

Subscribe to sign-in state changes. The handler is called with the user (or `null` on sign-out). Returns an unsubscribe function.

### `requestSignIn(): Promise<{ success: boolean }>`

Prompt the user to sign in to AMC. Resolves with `{ success }` reflecting the outcome.

### The `PluginAuthUser` type

```typescript
interface PluginAuthUser {
  uid: string
  email: string
  displayName: string | null
  photoURL: string | null
}
```

## Account access

### `getSession(provider, scopes, options?): Promise<PluginAuthSession | null>`

Request a scoped access token for a provider so your plugin can call that provider's API as the user.

**Requires the `auth.session` permission.**

**Parameters:**

| Name | Type | Description |
|---|---|---|
| `provider` | `'google' \| 'github'` | Which provider to get a session for |
| `scopes` | `string[]` | The OAuth scopes your plugin needs |
| `options.createIfNone` | `boolean` | Start an interactive sign-in if no matching session exists |
| `options.forceNewSession` | `boolean` | Force a fresh session even if one already exists |

**Returns:** `Promise<PluginAuthSession | null>` -- `null` if no session is available and one was not (or could not be) created.

### The `PluginAuthSession` type

```typescript
interface PluginAuthSession {
  provider: 'google' | 'github'
  accessToken: string
  scopes: string[]
  expiresAt: number
  account: { uid: string; email: string }
}
```

| Field | Type | Description |
|---|---|---|
| `provider` | `'google' \| 'github'` | The provider this session is for |
| `accessToken` | `string` | The scoped access token to send to the provider's API |
| `scopes` | `string[]` | The scopes actually granted |
| `expiresAt` | `number` | Epoch milliseconds. Re-request near or after this time. For providers without native expiry (GitHub), the broker sets a synthetic 8-hour TTL |
| `account` | `{ uid: string; email: string }` | The account the session belongs to |

## Examples

```typescript
// Backend -- who is signed in?
const user = await ctx.auth.getUser()
if (user) {
  ctx.log.info(`Signed in as ${user.email}`)
}

// React to sign-in / sign-out
const unsubscribe = ctx.auth.onAuthStateChange((user) => {
  if (!user) ctx.log.info('User signed out')
})
```

```typescript
// Backend -- call a Google API as the user
const session = await ctx.auth.getSession(
  'google',
  ['https://www.googleapis.com/auth/calendar.readonly'],
  { createIfNone: true },
)

if (session) {
  const res = await ctx.http.fetch(
    'https://www.googleapis.com/calendar/v3/users/me/calendarList',
    { headers: { Authorization: `Bearer ${session.accessToken}` } },
  )
}
```

## Notes

- `getSession()` requires the `auth.session` permission; the identity methods only require `auth`. Declare both only if you need both.
- Access tokens are short-lived. Check `expiresAt` and re-request rather than caching a token indefinitely.
- Request the minimum scopes your plugin needs -- the user sees them during the access prompt.
- Calling a provider's API also needs the `network` permission for `ctx.http.fetch`.
