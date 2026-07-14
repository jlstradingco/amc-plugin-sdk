# Auth

Read the signed-in AMC user's identity and, when granted, obtain a short-lived provider access token (Google or GitHub) scoped to what your plugin needs. AMC's auth broker owns all credentials — your plugin receives only what these methods return, never the user's raw refresh token or password.

**Availability:** Backend only (`ctx.auth`)
**Required Permission:** `auth` (identity), plus `auth.session` for [`getSession()`](#getsession)

::: warning Identity vs. credentials
The `auth` permission grants **identity only** (`getUser`, `isAuthenticated`, etc.). To request a provider access token via [`getSession()`](#getsession), also declare the `auth.session` permission. Tokens are minted for the specific `scopes` you pass and expire — always treat them as short-lived.
:::

## Methods

### `getUser(): Promise<PluginAuthUser | null>`

Return the currently signed-in AMC user, or `null` if no one is signed in.

**`PluginAuthUser`:**

| Field | Type | Description |
|---|---|---|
| `uid` | `string` | Stable AMC user id |
| `email` | `string` | The user's email |
| `displayName` | `string \| null` | Display name, if set |
| `photoURL` | `string \| null` | Avatar URL, if set |

```typescript
const user = await ctx.auth.getUser()
if (user) ctx.log.info(`Signed in as ${user.email}`)
```

---

### `isAuthenticated(): Promise<boolean>`

Convenience check — `true` when a user is signed in.

```typescript
if (!(await ctx.auth.isAuthenticated())) return
```

---

### `getGoogleIdToken(): Promise<string | null>`

Return a Google **ID token** (a signed identity assertion, not an API access token) for the signed-in user, or `null` if unavailable. Use it to verify identity with your own backend.

```typescript
const idToken = await ctx.auth.getGoogleIdToken()
```

---

### `requestSignIn(): Promise<{ success: boolean }>`

Prompt the user to sign in through AMC's normal auth flow. Resolves once the flow completes.

```typescript
const { success } = await ctx.auth.requestSignIn()
```

---

### `onAuthStateChange(handler): () => void`

Subscribe to sign-in / sign-out changes. The handler receives the new `PluginAuthUser` (or `null` on sign-out). Returns an unsubscribe function.

```typescript
const unsubscribe = ctx.auth.onAuthStateChange((user) => {
  ctx.log.info(user ? `Signed in: ${user.email}` : 'Signed out')
})
```

---

### `getSession(provider, scopes, options?): Promise<PluginAuthSession | null>`

Request a short-lived **provider access token** for `'google'` or `'github'`, scoped to `scopes`. Returns `null` when no session is available (and `createIfNone` is not set). **Requires the `auth.session` permission.**

**Parameters:**

| Name | Type | Description |
|---|---|---|
| `provider` | `'google' \| 'github'` | Which identity provider to mint a session for |
| `scopes` | `string[]` | The OAuth scopes your plugin needs |
| `options.createIfNone` | `boolean` (optional) | Start an interactive sign-in if no session exists |
| `options.forceNewSession` | `boolean` (optional) | Force a fresh session even if one is cached |

**`PluginAuthSession`:**

| Field | Type | Description |
|---|---|---|
| `provider` | `'google' \| 'github'` | The provider this session is for |
| `accessToken` | `string` | The provider access token — send this to the provider's API |
| `scopes` | `string[]` | Scopes actually granted |
| `expiresAt` | `number` | Epoch ms. Re-request near or after this time. For providers without native expiry (GitHub) the broker sets a synthetic 8-hour TTL |
| `account` | `{ uid: string; email: string }` | The account the session belongs to |

**Example:**

```typescript
// Read the user's Google Calendar
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

- Never persist an `accessToken` — request a fresh session when `Date.now()` approaches `expiresAt`.
- Request the **minimum** scopes your feature needs; broad scopes discourage installs and may be refused.
- `getUser()` / `isAuthenticated()` need only `auth`. `getSession()` additionally needs `auth.session` — a plugin that only reads identity should not request `auth.session`.
- Credentials never cross into untrusted UI code. Call `getSession()` from your backend and use the token there.
