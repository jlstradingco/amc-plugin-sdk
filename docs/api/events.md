# Events

Pub/sub event system for communication within your plugin's backend. Emit events from one part of your code and listen for them elsewhere.

**Availability:** Backend only (`ctx.events`)
**Required Permission:** None

## Methods

### `emit(channel: string, data: unknown): void`

Emit an event on a named channel. All registered listeners for that channel are called synchronously with the provided data.

**Parameters:**

| Name | Type | Description |
|---|---|---|
| `channel` | `string` | The event channel name |
| `data` | `unknown` | The event payload (must be JSON-serializable) |

**Returns:** `void`

**Example:**

```typescript
// Emit when a task completes
ctx.events.emit('task:complete', {
  taskId: 'abc-123',
  result: 'success',
  duration: 4500,
})

// Emit a simple notification
ctx.events.emit('sync:started', { source: 'cron' })
```

---

### `on(channel: string, handler: (data: unknown) => void): () => void`

Subscribe to events on a named channel.

**Parameters:**

| Name | Type | Description |
|---|---|---|
| `channel` | `string` | The event channel name to listen on |
| `handler` | `(data: unknown) => void` | Callback invoked when an event is emitted on the channel |

**Returns:** `() => void` -- call this function to unsubscribe.

**Example:**

```typescript
// Listen for task completions
const unsubscribe = ctx.events.on('task:complete', (data) => {
  const { taskId, result } = data as { taskId: string; result: string }
  ctx.log.info(`Task ${taskId} finished: ${result}`)

  if (result === 'success') {
    ctx.sidebar.setBadge(0)
  }
})

// Later, unsubscribe
unsubscribe()
```

## Patterns

### Coordinating cron jobs and CLI endpoints

```typescript
export function activate(ctx: PluginContext) {
  // Cron job emits when sync finishes
  ctx.cron.register('sync', '0 */6 * * *', async () => {
    const data = await fetchExternalData()
    await ctx.db.insert('synced', { data, timestamp: Date.now() })
    ctx.events.emit('sync:complete', { count: data.length })
  })

  // CLI endpoint emits on manual trigger
  ctx.cli.handle('sync/trigger', async () => {
    const data = await fetchExternalData()
    await ctx.db.insert('synced', { data, timestamp: Date.now() })
    ctx.events.emit('sync:complete', { count: data.length })
    return { status: 200, body: { synced: data.length } }
  })

  // Single listener handles both sources
  ctx.events.on('sync:complete', (data) => {
    const { count } = data as { count: number }
    ctx.toast.show({ type: 'success', message: `Synced ${count} records` })
    ctx.sidebar.setBadge(count)
  })
}
```

## Notes

- Events are scoped to your plugin. You cannot emit or listen for events from other plugins.
- Event data must be JSON-serializable.
- Listeners are called synchronously in registration order. If a listener throws, subsequent listeners for the same channel still run, and the error is logged.
- Always call the returned unsubscribe function when you no longer need to listen, to avoid memory leaks.
- No permission is required. Every plugin can use the Events API.
