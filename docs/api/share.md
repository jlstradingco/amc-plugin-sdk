# Share

Publish an HTML page to Omniscio Shares as a public link, and take the link down again.

**Availability:** Webview only (`Omniscio.share`). There is no `ctx.share`.
**Required Permission:** `firebase`

::: warning The link is public
Anyone with the link can read the page. Publish only what the user has asked you to publish, and tell them that a link was created.
:::

## Permissions

`firebase` is a standard permission. Omniscio shows it to the user as "Firebase: List your signed-in Firebase accounts and projects, and start a Firebase login". The same permission covers the [Firebase API](./firebase) and this one.

```json
{
  "permissions": ["firebase"]
}
```

## Methods

### `publishArtifact(opts: BridgeSharePublishRequest): Promise<BridgeSharePublishResult>`

Publish a page and resolve its link.

**Returns:** `Promise<BridgeSharePublishResult>`. Keep the `token`: it is the only way to take the link down later.

**Rejects** when the share is refused. Branch on `err.code` rather than the message:

| `err.code` | Meaning |
|---|---|
| `SHARE_SIGN_IN_REQUIRED` | The user is not signed in, so Omniscio cannot publish |
| `SHARE_TOO_LARGE` | The page is over the size limit |

Treat any other code as a generic failure.

---

### `revokeArtifact(opts: { token: string }): Promise<BridgeShareRevokeResult>`

Take down a link this plugin published.

**Returns:** `Promise<BridgeShareRevokeResult>`

A plugin can only revoke links it published itself. For any other token (another plugin's, one the user made, or one that does not exist) the call resolves `{ revoked: false, deferred: false }`.

## Types

```typescript
interface BridgeSharePublishRequest {
  /** The page to publish, as one self-contained HTML document, up to 20 MB. */
  html: string
  /** Defaults to `artifact.html`. */
  fileName?: string
  /** Defaults to `Shared artifact`. */
  title?: string
  /** Show the page edge to edge. Defaults to `false`. */
  fullBleed?: boolean
  /** Who may read and post comments: anyone with the link (the default), or workspace members only. */
  commentAudience?: 'link' | 'workspace'
}

interface BridgeSharePublishResult {
  /** Pass this to `revokeArtifact` to take the link down. */
  token: string
  /** The public link. */
  url: string
}

interface BridgeShareRevokeResult {
  /** `true` once the link no longer works. */
  revoked: boolean
  /** `true` when taking the link down could not finish yet and will be retried. */
  deferred: boolean
}
```

## Example

```typescript
const omniscio = window.Omniscio ?? window.AgentMC

let lastToken: string | null = null

async function shareReport(html: string): Promise<string | null> {
  try {
    const { token, url } = await omniscio.share.publishArtifact({ html, title: 'Weekly report' })
    lastToken = token
    return url
  } catch (err) {
    const code = (err as { code?: string }).code
    if (code === 'SHARE_SIGN_IN_REQUIRED') {
      omniscio.toast.show({ type: 'warning', message: 'Sign in to Omniscio to share.' })
    } else if (code === 'SHARE_TOO_LARGE') {
      omniscio.toast.show({ type: 'error', message: 'That page is too large to share.' })
    } else {
      omniscio.toast.show({ type: 'error', message: 'Could not publish the page.' })
    }
    return null
  }
}

async function unshare() {
  if (lastToken === null) return
  const result = await omniscio.share.revokeArtifact({ token: lastToken })
  if (result.deferred) {
    omniscio.toast.show({ type: 'info', message: 'The link will be taken down shortly.' })
  }
}
```

## Notes

- Webview only.
- A link published without an expiry set lasts 30 days. The bridge does not let you choose the expiry.
- A page must be one self-contained HTML document of at most 20 MB.
- `@omniscio/plugin-sdk/browser` exports `BridgeShare`, `BridgeSharePublishRequest`, `BridgeSharePublishResult`, `BridgeShareRevokeResult` and `BridgeHostFailureCode`.
