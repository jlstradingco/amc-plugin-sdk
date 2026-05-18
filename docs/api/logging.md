# Logging

Structured logging that writes to AMC's log system. Log messages appear in AMC's developer tools and log files, tagged with your plugin's ID.

**Availability:** Backend only (`ctx.log`)
**Required Permission:** None

## Methods

### `info(message: string, ...args: unknown[]): void`

Log an informational message.

**Parameters:**

| Name | Type | Description |
|---|---|---|
| `message` | `string` | The log message |
| `...args` | `unknown[]` | Additional values to log (objects, numbers, etc.) |

**Returns:** `void`

**Example:**

```typescript
ctx.log.info('Plugin activated')
ctx.log.info('Processing batch', { size: 42, source: 'cron' })
ctx.log.info(`Synced ${count} records in ${ms}ms`)
```

---

### `warn(message: string, ...args: unknown[]): void`

Log a warning message. Use for recoverable issues or unexpected-but-handled conditions.

**Parameters:**

| Name | Type | Description |
|---|---|---|
| `message` | `string` | The warning message |
| `...args` | `unknown[]` | Additional values to log |

**Returns:** `void`

**Example:**

```typescript
ctx.log.warn('API rate limit approaching', { remaining: 5 })
ctx.log.warn('Using default config -- settings not configured')
```

---

### `error(message: string, ...args: unknown[]): void`

Log an error message. Use for failures that need attention.

**Parameters:**

| Name | Type | Description |
|---|---|---|
| `message` | `string` | The error message |
| `...args` | `unknown[]` | Additional values to log (include the error object when available) |

**Returns:** `void`

**Example:**

```typescript
try {
  await syncData()
} catch (err) {
  ctx.log.error('Sync failed', err)
}

ctx.log.error('Database write failed', { collection: 'tasks', id: 'abc-123' })
```

---

### `debug(message: string, ...args: unknown[]): void`

Log a debug message. These are only visible when debug-level logging is enabled in AMC.

**Parameters:**

| Name | Type | Description |
|---|---|---|
| `message` | `string` | The debug message |
| `...args` | `unknown[]` | Additional values to log |

**Returns:** `void`

**Example:**

```typescript
ctx.log.debug('Cache hit', { key: 'user:123', ttl: 300 })
ctx.log.debug('Request payload', req.body)
```

## Notes

- All log messages are automatically prefixed with your plugin's ID (e.g. `[my-plugin] Plugin activated`).
- No permission is required. Every plugin can write logs.
- Use the appropriate log level:
  - `info` -- normal operational messages (startup, shutdown, successful operations)
  - `warn` -- recoverable issues or degraded conditions
  - `error` -- failures that need investigation
  - `debug` -- detailed diagnostic output for development
- Additional arguments are serialized and appended to the log message. Pass objects, arrays, or error instances as extra args for structured context.
- Avoid logging sensitive data (API keys, tokens, user credentials). Plugin logs may be visible through AMC's debug tools.
