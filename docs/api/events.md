# Events

Pub/sub messaging across your whole plugin. Emit on a channel and every subscriber of your plugin hears it -- in your backend, in your UI, or both.

**Availability:** Both (backend `ctx.events` / frontend `AgentMC.events`)
**Required Permission:** None

::: tip One bus, two surfaces
An `emit` fans out to **both** halves of your plugin: your backend worker's `ctx.events.on` handlers and your webview's `AgentMC.events.on` subscribers. Delivery is self-inclusive, like any pub/sub -- the surface that emitted also receives, if it subscribed to that channel.

The flip side: re-emitting from inside your own handler for that channel will loop. The host does not guard against it, so that one is yours to avoid.
:::

## Backend Methods

### `emit(channel: string, data: unknown): void`

Emit an event on a named channel. It reaches every subscriber of your plugin on both surfaces, including the backend itself.

**Parameters:**

| Name | Type | Description |
|---|---|---|
| `channel` | `string` | The event channel name |
| `data` | `unknown` | The event payload (must be JSON-serializable) |

**Returns:** `void`

**Example:**

```typescript
// Tell the UI a task finished, so it can update without polling
ctx.events.emit('task:complete', {
  taskId: 'abc-123',
  result: 'success',
  duration: 4500,
})

// A bare progress signal
ctx.events.emit('sync:started', { source: 'cron' })
```

---

### `on(channel: string, handler: (data: unknown) => void): void`

Subscribe to a channel. The handler fires for events emitted anywhere in your plugin -- elsewhere in the backend, or from your UI via `AgentMC.events.emit`.

**Parameters:**

| Name | Type | Description |
|---|---|---|
| `channel` | `string` | The event channel name to listen on |
| `handler` | `(data: unknown) => void` | Callback invoked when an event is emitted on the channel |

**Returns:** `void`. There is **no unsubscribe on this surface** -- see below.

**Example:**

```typescript
// Act on a request from the UI
ctx.events.on('task:cancel', (data) => {
  const { taskId } = data as { taskId: string }
  ctx.log.info(`UI asked to cancel ${taskId}`)
  cancelTask(taskId)
})
```

::: danger There is no backend unsubscribe, and there is no fix in flight
The host's `ctx.events.on` has no return statement, the worker protocol has no unsubscribe
message, and the handler set is append-only -- so a subscription lives until the worker exits.

This page previously typed the return as `() => void` and called the gap "a host fix in
flight", **while both the mock context and the test harness returned a working
unsubscribe.** That is the same failure this SDK cites as its cautionary tale about
`ctx.events`: green tests over a dead production path. As of 2026-08-11 the type says
`void` and both mocks return nothing, so the compiler now catches `off()` instead of
letting it throw at runtime.

If you need to detach a handler, gate inside it -- hold your own flag or `Set` and return
early. Do not build teardown into `onDisable` expecting it to work.
:::

## Frontend Methods

`AgentMC.events` is the same bus as the backend half, typed as `BridgeEvents`. `emit` and `on` are identical to `ctx.events`, so a channel means the same thing on either side; the UI adds one member the backend has no use for.

### `emit(channel: string, data: unknown): void`

Emit on a channel. It reaches your backend worker's `ctx.events.on` handlers and your own webview subscribers.

Fire-and-forget: it returns nothing and tells you nothing about whether anyone was listening. A failure -- an oversized payload, or a bridge error -- is logged to your plugin's devtools console rather than thrown, so you cannot catch it.

```typescript
AgentMC.events.emit('sync:request', null)
AgentMC.events.emit('task:cancel', { taskId: 'abc-123' })
```

### `on(channel: string, handler: (data: unknown) => void): () => void`

Subscribe to a channel. Call the returned function to stop. Unlike the backend half, the UI's `on` does return a working unsubscribe.

```typescript
const unsubscribe = AgentMC.events.on('sync:complete', (data) => {
  const { count } = data as { count: number }
  showToast(`Synced ${count} records`)
})

// Later, unsubscribe
unsubscribe()
```

### `onSessionStatus(callback: (event: unknown) => void): () => void`

Subscribe to session status changes. Call the returned function to stop.

::: danger Two things this does NOT do
**It is not scoped to your plugin.** The host broadcasts *every* session's status change to
*every* open subscriber, including the user's own sessions and other plugins'. There is no
ownership filter and no permission gate. Filter on `sessionId` yourself against sessions you
created.

**It only fires in an overlay window.** The host sends this channel solely to plugin overlay
windows. The method exists in an in-panel webview because both share a preload, but nothing
delivers the channel there, so a subscription from a panel is **silently never called**. For a
panel, poll `AgentMC.session.getStatus()` instead.
:::

```typescript
const unsubscribe = AgentMC.events.onSessionStatus((event) => {
  const { sessionId, status } = event as { sessionId: string; status: string }
  if (sessionId !== mySessionId) return
  console.log('My session is now:', status)
})

unsubscribe()
```

## Patterns

### Coordinating cron jobs and CLI endpoints

Several entry points produce the same outcome; one listener reacts to all of them.

```typescript
export function activate(ctx: PluginContext) {
  const runSync = async () => {
    const data = await fetchExternalData()
    await ctx.db.insert('synced', { data, timestamp: Date.now() })
    ctx.events.emit('sync:complete', { count: data.length })
  }

  // Cron job emits when sync finishes
  ctx.cron.register('sync', '0 */6 * * *', runSync)

  // CLI endpoint emits on manual trigger
  ctx.cli.handle('sync/trigger', async () => {
    await runSync()
    return { status: 200, body: { ok: true } }
  })

  // Single listener handles both sources
  ctx.events.on('sync:complete', (data) => {
    const { count } = data as { count: number }
    ctx.toast.show({ type: 'success', message: `Synced ${count} records` })
    ctx.sidebar.setBadge(count)
  })
}
```

### Keeping the UI live without polling

The same `sync:complete` events already reach your webview -- no extra work in the backend. The UI subscribes, and can drive the backend on another channel.

```typescript
// UI
AgentMC.events.on('sync:complete', (data) => {
  const { count } = data as { count: number }
  render(`Synced ${count} records`)
})

syncButton.onclick = () => {
  AgentMC.events.emit('sync:request', null)
  render('Syncing...')
}
```

```typescript
// backend -- the UI's Sync button lands here
ctx.events.on('sync:request', () => {
  void runSync()
})
```

`emit` is fire-and-forget: it tells you nothing about whether the other surface was listening. If the backend has not started, or the panel is closed, the event is simply not received by that side. Render an optimistic state as above, and let the next real event correct it.

## Notes

- Events are scoped to your plugin. You cannot emit or listen for events from other plugins, and no other plugin can reach yours.
- Event data must be JSON-serializable. It crosses a process boundary, so a `Date` arrives as an ISO string, `undefined` object properties are dropped, and a `Map` or `Set` arrives as `{}`.
- `emit` is fire-and-forget on both surfaces. It returns nothing, does not wait for handlers, and does not report whether anyone was listening.
- A channel name is capped at 200 characters and a payload at 1 MiB. Exceed either and the emit fails without throwing.
- You may hold at most 200 live subscriptions at a time.
- If a handler throws, the other handlers on that channel still run and the error is logged.
- Always unsubscribe when you no longer need to listen, to avoid memory leaks -- subject to the host gap noted above for the backend half.
- No permission is required. Every plugin can use the Events API.
