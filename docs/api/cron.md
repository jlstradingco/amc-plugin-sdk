# Cron

Register and manage scheduled background tasks. Cron jobs run on a recurring schedule defined by a cron expression.

**Availability:** Backend only (`ctx.cron`)
**Required Permission:** `cron`

## Methods

### `register(id: string, schedule: string, handler: () => Promise<void>): void`

Register a handler for a scheduled job. The `id` must match a job declared in your `manifest.json`.

**Parameters:**

| Name | Type | Description |
|---|---|---|
| `id` | `string` | Job ID (must match a declared job in `manifest.json`) |
| `schedule` | `string` | Cron expression (e.g. `*/30 * * * *` for every 30 minutes) |
| `handler` | `() => Promise<void>` | Async function to run on each tick |

**Returns:** `Promise<void>`

::: warning `register` rejects on an invalid cron expression or empty id
Await it. Typed as `void` this used to be an unhandled rejection in the host log, and the
job simply never ran -- with nothing at the call site to tell you.
:::

**Example:**

```typescript
await ctx.cron.register('sync-data', '0 */6 * * *', async () => {
  ctx.log.info('Running 6-hourly data sync')
  const response = await ctx.http.fetch('https://api.example.com/data')
  const data = await response.json()
  await ctx.db.insert('synced_data', {
    timestamp: Date.now(),
    payload: data,
  })
})

await ctx.cron.register('cleanup', '0 3 * * *', async () => {
  ctx.log.info('Running daily cleanup at 3 AM')
  const cutoff = Date.now() - 30 * 24 * 60 * 60 * 1000 // 30 days
  await ctx.db.deleteWhere('logs', { before: cutoff })
})
```

---

### `unregister(id: string): void`

Remove a registered cron handler. The job stops running but remains declared in the manifest.

**Parameters:**

| Name | Type | Description |
|---|---|---|
| `id` | `string` | Job ID to unregister |

**Returns:** `Promise<void>`

**Example:**

```typescript
await ctx.cron.unregister('sync-data')
```

---

### `isRegistered(id: string): Promise<boolean>`

Check whether a handler is currently registered for a given job ID.

**Parameters:**

| Name | Type | Description |
|---|---|---|
| `id` | `string` | Job ID to check |

**Returns:** `Promise<boolean>` -- resolves `true` if a handler is registered.

::: danger AWAIT this
Every `ctx.cron` method crosses an RPC, so all three return promises. This one was
**typed as a bare `boolean`** until 2026-08-11, and the example on this page was the
un-awaited guard below -- which is **always true**, because a Promise is never falsy.
Any plugin that copied it re-registered every time, or skipped the branch entirely.

```typescript
// WRONG -- this condition can never be false
if (!ctx.cron.isRegistered('sync-data')) { /* dead code */ }
```
:::

**Example:**

```typescript
if (!(await ctx.cron.isRegistered('sync-data'))) {
  await ctx.cron.register('sync-data', '0 */6 * * *', syncHandler)
}
```

## Cron Expression Format

Cron expressions use the standard 5-field format:

```
┌───── minute (0-59)
│ ┌───── hour (0-23)
│ │ ┌───── day of month (1-31)
│ │ │ ┌───── month (1-12)
│ │ │ │ ┌───── day of week (0-6, 0 = Sunday)
│ │ │ │ │
* * * * *
```

**Common examples:**

| Expression | Description |
|---|---|
| `*/5 * * * *` | Every 5 minutes |
| `*/30 * * * *` | Every 30 minutes |
| `0 * * * *` | Every hour |
| `0 */6 * * *` | Every 6 hours |
| `0 9 * * *` | Daily at 9:00 AM |
| `0 3 * * *` | Daily at 3:00 AM |
| `0 9 * * 1` | Every Monday at 9:00 AM |
| `0 0 1 * *` | First day of every month at midnight |

## Notes

- Every cron job must be declared in the `cron.jobs` array in `manifest.json` before it can be registered. The `id` you pass to `register()` must match a declared job ID. See [Manifest > Cron Block](../guide/manifest#cron-block).
- If your handler throws an error, AMC logs the failure and the job will run again at the next scheduled tick. Errors do not disable the job.
- Cron schedules use the system's local timezone.
- Register your cron handlers in your plugin's `activate()` function so they start running as soon as the plugin loads.
