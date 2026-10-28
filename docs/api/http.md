# HTTP

Make outbound HTTP requests from your plugin's backend. Follows the standard [Fetch API](https://developer.mozilla.org/en-US/docs/Web/API/Fetch_API) interface.

**Availability:** Backend only (`ctx.http`)
**Required Permission:** `network`

## Methods

### `fetch(url: string, options?: RequestInit): Promise<Response>`

Send an HTTP request and receive a response.

**Parameters:**

| Name | Type | Description |
|---|---|---|
| `url` | `string` | The URL to fetch |
| `options` | `RequestInit` (optional) | Standard Fetch API options (method, headers, body, etc.) |

**Returns:** `Promise<Response>` -- a standard [Response](https://developer.mozilla.org/en-US/docs/Web/API/Response) object.

**Example:**

```typescript
// Simple GET request
const response = await ctx.http.fetch('https://api.example.com/health')
const data = await response.json()
ctx.log.info(`API status: ${data.status}`)

// POST with JSON body
const response = await ctx.http.fetch('https://api.example.com/webhooks', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${apiToken}`,
  },
  body: JSON.stringify({
    event: 'build.complete',
    project: 'my-app',
  }),
})

if (!response.ok) {
  ctx.log.error(`Webhook failed: ${response.status} ${response.statusText}`)
}

// Download text content
const response = await ctx.http.fetch('https://example.com/data.csv')
const csv = await response.text()
await ctx.fs.writeFile('imports/data.csv', csv)
```

## Notes

- The `options` parameter accepts all standard Fetch API options: `method`, `headers`, `body`, `signal`, etc.
- Responses follow the standard [Response](https://developer.mozilla.org/en-US/docs/Web/API/Response) interface with `.json()`, `.text()`, `.blob()`, `.ok`, `.status`, and other standard properties.
- API keys and secrets should be stored in plugin settings (configured by the user in Omniscio's Settings > Plugins panel) and read via the [Settings](./settings) API. Never hardcode credentials.
- There are no restrictions on which URLs you can fetch, but users see that your plugin has the `network` permission during installation.

## Uploading a file the person shared — `AgentMC.http.uploadFile`

**Availability:** Plugin panel only (`window.AgentMC.http.uploadFile`)
**Required Permission:** `network.upload`, plus an `uploadHosts` list in your manifest

Send one file from a folder the person picked for your plugin (with `AgentMC.export.pickFolder`) to a website your manifest lists. Omniscio reads the file and streams it to the site itself, so the bytes never pass through your plugin's code.

```json
{
  "permissions": ["network.upload"],
  "uploadHosts": ["rupload.facebook.com"]
}
```

```typescript
const picked = await window.AgentMC.export.pickFolder({ title: 'Choose your reels folder' })
if (picked.selected) {
  const answer = await window.AgentMC.http.uploadFile({
    url: `https://rupload.facebook.com/video-upload/v21.0/${videoId}`,
    filePath: `${picked.path}/reel.mp4`,
    headers: { Authorization: `OAuth ${pageToken}`, offset: '0' },
    sizeHeader: 'file_size',
  })
  if (!answer.ok) console.warn(`Upload refused by the site: ${answer.status} ${answer.bodyText}`)
}
```

**Request fields:**

| Name | Type | Description |
|---|---|---|
| `url` | `string` | An `https://` address whose site is exactly one of your `uploadHosts`. No port, no username or password. |
| `filePath` | `string` | An absolute path to a regular file inside a folder the person picked for your plugin. |
| `method` | `'POST' \| 'PUT'` (optional) | Defaults to `POST`. |
| `headers` | `Record<string, string>` (optional) | Your own headers. `Host`, `Content-Length`, `Transfer-Encoding` and other connection headers are dropped; Omniscio sets the length. |
| `sizeHeader` | `string` (optional) | A header name Omniscio fills with the file's size in bytes, for sites that need it (`file_size` for Facebook). |

**Returns:** `{ ok, status, statusText, headers, bodyText }` — the site's answer as plain data.

**What Omniscio enforces (your code cannot change any of it):**

- **https only**, and only to a site your manifest lists. Entries are exact names: no wildcards, subdomains, ports or IP addresses, at most 10.
- **The person approves your list once.** The first upload shows a native dialog naming your plugin and every listed site. Nothing is sent before they allow it. A "no" is remembered until the app restarts or your plugin is turned off and on, so asking again in a loop shows nothing.
- **A new site asks again.** If an update adds a site, the next upload asks about the new list. A site you removed is never sent to.
- **Only files from picked folders**, judged after following links, and never a credentials, key or `.env` file even inside one. Files up to 2 GB.
- **Redirects are not followed.** A `3xx` answer comes back to you as is.
- **Turning your plugin off, or uninstalling it, forgets the approval.**
- A refused upload rejects with an error that names the rule, such as `http.uploadFile: only https uploads are allowed`.
