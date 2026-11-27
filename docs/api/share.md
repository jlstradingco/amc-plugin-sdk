# Share

Publish an HTML page or one picture to Omniscio Shares as a public link, and take the link down again.

**Availability:** Webview only (`Omniscio.share`). There is no `ctx.share`.
**Required Permission:** `firebase` (`publishArtifact`, `revokeArtifact`); `share.images` (`publishImage`)

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

`share.images` is an elevated permission, shown as "Share Pictures". It covers `publishImage` only. A plugin that also takes its pictures down with `revokeArtifact` declares both.

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

### `publishImage(opts: BridgeSharePublishImageRequest): Promise<BridgeSharePublishResult>`

Publish one PNG (up to 5,242,880 bytes) or one GIF (up to 8,388,608 bytes) as an image page and resolve its link. Requires `share.images`, which is shown to the user as "Share Pictures"; `firebase` does not grant it.

- Omniscio reads the picture type from the bytes. A GIF named `.png` is published as a GIF; anything that is not a PNG or GIF is refused.
- The link is always a page with a report link and comments off. The call has no option to turn comments on.
- Comment and application blocks in a GIF are removed (its loop count is kept), and so are a PNG's text chunks.
- `expiresInDays` is 1, 7 or 30. Omit it for 30 days.

**Rejects** with `SHARE_TOO_LARGE` for a picture over its type's limit and `SHARE_SIGN_IN_REQUIRED` when the user is not signed in.

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
  /**
   * A SHORTER life than the 30-day default, in whole days from 1 to 30. Omit it for 30 days.
   * A value outside that range is refused rather than clamped.
   */
  expiresInDays?: number
}

interface BridgeSharePublishImageRequest {
  /** One PNG or GIF as plain base64, no `data:` prefix. */
  base64: string
  /** Shown as the picture's name. Its extension is replaced by the real type. */
  fileName?: string
  title?: string
  /** 1, 7 or 30. Omit it for 30 days. */
  expiresInDays?: 1 | 7 | 30
}

interface BridgeSharePublishResult {
  /** Pass this to `revokeArtifact` to take the link down. */
  token: string
  /** The public link. */
  url: string
  /** When the link stops working, as an ISO timestamp. `null` for a link that never expires. */
  expiresAt: string | null
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
    const { token, url } = await omniscio.share.publishArtifact({
      html,
      title: 'Weekly report',
      expiresInDays: 14
    })
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
- A link published without an expiry set lasts 30 days. Ask for a shorter one with `expiresInDays`, from 1 to 30 whole days; a value outside that range is refused. A link is never given a longer life than 30 days.
- The result reports `expiresAt`, the moment the link stops working. Read it rather than assuming it matches what you asked for: publishing a page that already has a live link can shorten that link, and the date you get back is always the real one.
- A page must be one self-contained HTML document of at most 20 MB.
- `@omniscio/plugin-sdk/browser` exports `BridgeShare`, `BridgeSharePublishRequest`, `BridgeSharePublishImageRequest`, `BridgeSharePublishResult`, `BridgeShareRevokeResult` and `BridgeHostFailureCode`.
