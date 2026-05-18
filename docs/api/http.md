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
- API keys and secrets should be stored in plugin settings (configured by the user in AMC's Settings > Plugins panel) and read via the [Settings](./settings) API. Never hardcode credentials.
- There are no restrictions on which URLs you can fetch, but users see that your plugin has the `network` permission during installation.
