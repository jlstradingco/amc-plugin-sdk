# Auth Demo

Minimal Omniscio plugin demonstrating the **auth** identity API and the **auth.session** scoped-token API.

## What It Shows

- `Omniscio.auth.isAuthenticated()` — is anyone signed in to Omniscio
- `Omniscio.auth.getUser()` — the signed-in user's `uid`, `email`, `displayName`, `photoURL`
- `Omniscio.auth.requestSignIn()` — prompt the user to sign in
- `Omniscio.auth.onAuthStateChange(handler)` — react to sign-in / sign-out
- `Omniscio.auth.getSession(provider, scopes)` — request a scoped OAuth access token for Google or GitHub

## Permissions

| Permission | Why |
|---|---|
| `auth` | Read the signed-in identity (name / email) |
| `auth.session` | Request scoped Google / GitHub access tokens |
| `network` | Included so you can call the provider APIs with the returned token |

The identity methods (`getUser`, `isAuthenticated`, `requestSignIn`, `onAuthStateChange`) need only `auth`.
`getSession()` additionally needs `auth.session`.

## A Note On Tokens

`getSession()` returns a real OAuth access token. This demo **masks** it before rendering — never
display or log a raw access token in a production plugin. GitHub sessions carry a synthetic 8h TTL;
Google sessions expose the provider's real `expiresAt` (epoch ms).

## Running

```bash
cd examples/auth-demo
npm install
npm run build
npm run dev
```
