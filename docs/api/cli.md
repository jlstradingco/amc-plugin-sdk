# CLI Endpoints

Register HTTP endpoint handlers on AMC's CLI control server. This lets external tools, scripts, and automations interact with your plugin over HTTP.

**Availability:** Backend only (`ctx.cli`)
**Required Permission:** `cli`

## Types

```typescript
interface CliRequest {
  method: string                     // HTTP method (GET, POST, PUT, DELETE, etc.)
  path: string                       // The endpoint path
  body?: unknown                     // Parsed JSON body (for POST/PUT/PATCH)
  query?: Record<string, string>     // URL query parameters
}

interface CliResponse {
  status: number    // HTTP status code
  body?: unknown    // Response body (will be JSON-serialized)
}

type CliHandler = (req: CliRequest) => Promise<CliResponse>
```

## Methods

### `handle(path: string, handler: CliHandler): void`

Register a handler for a CLI endpoint. The `path` must match an endpoint declared in `manifest.json`.

**Parameters:**

| Name | Type | Description |
|---|---|---|
| `path` | `string` | Endpoint path (must match a declared endpoint in `manifest.json`) |
| `handler` | `CliHandler` | Async function that processes the request and returns a response |

**Returns:** `void`

**Example:**

```typescript
// Simple status endpoint
ctx.cli.handle('status', async (req) => {
  const count = await ctx.db.query('tasks', { where: { done: false } })
  return {
    status: 200,
    body: {
      healthy: true,
      pendingTasks: count.length,
    },
  }
})

// Endpoint that processes POST data
ctx.cli.handle('tasks/create', async (req) => {
  if (req.method !== 'POST') {
    return { status: 405, body: { error: 'Method not allowed' } }
  }

  const { title, priority } = req.body as { title: string; priority: number }
  const task = await ctx.db.insert('tasks', { title, priority, done: false })

  return {
    status: 201,
    body: task,
  }
})

// Endpoint with query parameters
ctx.cli.handle('tasks/search', async (req) => {
  const { q, limit } = req.query ?? {}
  const tasks = await ctx.db.query('tasks', {
    limit: limit ? parseInt(limit) : 20,
  })

  const filtered = tasks.filter((t) =>
    String(t.title).toLowerCase().includes((q ?? '').toLowerCase())
  )

  return {
    status: 200,
    body: { results: filtered },
  }
})
```

---

### `removeHandler(path: string): void`

Remove a previously registered endpoint handler.

**Parameters:**

| Name | Type | Description |
|---|---|---|
| `path` | `string` | Endpoint path to remove |

**Returns:** `void`

**Example:**

```typescript
ctx.cli.removeHandler('tasks/create')
```

## Accessing Endpoints

Endpoints are available at:

```
http://127.0.0.1:19519/plugins/<plugin-id>/<path>
```

For example, a plugin with ID `my-plugin` and an endpoint at path `status`:

```bash
# From a terminal or script
curl http://127.0.0.1:19519/plugins/my-plugin/status

# With query parameters
curl "http://127.0.0.1:19519/plugins/my-plugin/tasks/search?q=review&limit=5"

# POST with JSON body
curl -X POST http://127.0.0.1:19519/plugins/my-plugin/tasks/create \
  -H "Content-Type: application/json" \
  -d '{"title": "Review PR", "priority": 1}'
```

::: warning
AMC's CLI control server uses bearer-token authentication on certain endpoints. Requests to plugin endpoints go through AMC's standard auth. See AMC's CLI Control documentation for details.
:::

## Notes

- Every endpoint must be declared in the `cli.endpoints` array in `manifest.json` before it can be handled. The `path` you pass to `handle()` must match a declared endpoint path. See [Manifest > CLI Block](../guide/manifest#cli-block).
- The handler receives a parsed `CliRequest` and must return a `CliResponse` with a numeric `status` code. The `body` is JSON-serialized automatically.
- Register your CLI handlers in your plugin's `activate()` function so they are ready as soon as the plugin loads.
- The CLI control server port defaults to `19519` but can be overridden by the `AMC_CLI_PORT` environment variable.
