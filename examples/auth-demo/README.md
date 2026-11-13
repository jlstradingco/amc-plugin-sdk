# Auth Demo

Minimal Omniscio plugin demonstrating the **auth** identity API and the **auth.session** scoped-token API.

## Requirements

Requires `@omniscio/plugin-sdk` 3.6.0 or newer.

This example declares `auth.actAsUser` for `getWebAuth()`. No published kit carries that permission
yet: `npm install` today brings 3.5.0, so the published CLI refuses this manifest with
`Manifest validation failed` and `Invalid enum value … received 'auth.actAsUser'` — for `build`,
`validate`, `dev` and `package` alike. Until 3.6.0 is published, run this example with the CLI from
a checkout of this SDK repository instead of the published one:

```bash
# from the root of the repo that holds this SDK workspace
cd plugin-sdk && pnpm install && pnpm build

# then, in this example
cd examples/auth-demo
npm install                    # the published SDK's types; the pinned range stays copyable
node ../../packages/cli/dist/index.js build
node ../../packages/cli/dist/index.js dev     # or validate / package
```

Those paths are this checkout's layout — the workspace is `plugin-sdk/` inside the Omniscio repo and
the repo root in the published SDK repo. A folder you copy OUT of this repo cannot reach the workspace
CLI or SDK, so a copied-out copy of this example needs the published 3.6.0 kit (or newer).

## What It Shows

- `Omniscio.auth.getWebAuth()` — the webview's one auth method: Omniscio's Firebase config plus a
  custom token for the signed-in person, so your page signs in as the same identity Omniscio holds
- Which auth calls are backend-only (`ctx.auth.getUser` / `isAuthenticated` / `requestSignIn` /
  `onAuthStateChange` / `getSession`) and how a webview hands the work to its own backend instead

## Permissions

| Permission | Why |
|---|---|
| `auth` | Read the signed-in identity (name / email) |
| `auth.actAsUser` | Sign a webview into the person's own account through `getWebAuth()` |
| `auth.session` | Request scoped Google / GitHub access tokens |
| `network` | Included so you can call the provider APIs with the returned token |

The backend identity methods (`getUser`, `isAuthenticated`, `requestSignIn`, `onAuthStateChange`) need
only `auth`; `getSession()` additionally needs `auth.session`. The webview's `getWebAuth()` needs
`auth.actAsUser`, because the custom token it mints acts as the signed-in person.

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

With a published kit older than 3.6.0 these commands stop at `Manifest validation failed` — see
**Requirements** above for the commands that work until 3.6.0 ships.
