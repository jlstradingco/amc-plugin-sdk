# Inbox

Surface items in AMC's inbox -- the unified list where the user reviews things that need their attention.

**Availability:** Both (backend `ctx.inbox` / frontend `AgentMC.inbox`)
**Required Permission:** `inbox`

Use the inbox to raise plugin-owned items the user should look at: a finished report, a review request, a detected problem. Items you set replace the plugin's previous set, so you always publish the current list rather than appending one at a time.

## Methods

### `setItems(items: InboxItem[]): Promise<void>`

Replace the plugin's inbox items with the given list. Pass an empty array to clear them.

**Requires the `inbox` permission.**

**Parameters:**

| Name | Type | Description |
|---|---|---|
| `items` | `InboxItem[]` | The full current set of items for this plugin |

**Returns:** `Promise<void>`

### `postAlert(opts: { title: string; body: string; dedupKey?: string }): Promise<void>`

Raise a one-off alert, independent of the `setItems` list.

| Name | Type | Description |
|---|---|---|
| `title` | `string` | Required, 1-300 chars |
| `body` | `string` | Required markdown, 1-50,000 chars |
| `dedupKey` | `string` | Optional. Suppresses repeats; namespaced to your plugin host-side, so it cannot collide with another plugin's |

```typescript
await ctx.inbox.postAlert({
  title: 'Scan failed',
  body: 'The nightly scan could not reach the registry.',
  dedupKey: 'scan-failure',
})
```

## The `InboxItem` type

```typescript
interface InboxItem {
  id: string
  title: string
  timestamp: string   // REQUIRED -- the inbox orders on it
  subtitle?: string
  dotColor?: string
}
```

| Field | Type | Description |
|---|---|---|
| `id` | `string` | Stable identifier. Reuse the same `id` across updates so the row is replaced, not duplicated |
| `title` | `string` | Headline shown in the inbox row |
| `timestamp` | `string` | **Required** ISO timestamp. This is the inbox's sort key -- your plugin owns recency |
| `subtitle` | `string` | Optional supporting text |
| `dotColor` | `string` | Optional override of the per-source dot colour |

::: danger A wrong shape fails SILENTLY
Until 2026-08-11 this page documented `body`, `icon`, `priority`, `actionLabel` and
`actionId`. **None of them exist**, and `timestamp` was shown as optional when the host
requires it.

That combination is worse than a normal error, because the host validates the array
against a push schema and, on any failure, **logs a warning and drops the entire batch**
-- it never throws and never rejects. So `setItems()` resolved successfully and nothing
ever reached the inbox. If your plugin's rows have silently failed to appear, this is why.
:::

## Example

```typescript
// Backend
await ctx.inbox.setItems([
  {
    id: 'scan-report',
    title: 'Security scan finished',
    subtitle: 'Found 3 issues across 2 dependencies.',
    dotColor: '#ef4444',
    timestamp: new Date().toISOString(),
  },
])

// Later, clear the plugin's inbox items
await ctx.inbox.setItems([])
```

```typescript
// Frontend
await AgentMC.inbox.setItems([
  { id: 'welcome', title: 'Finish setup', body: 'Connect an account to get started.' },
])
```

## Notes

- `setItems()` is a full replace. Keep the complete current set in memory and publish it whenever it changes.
- Use stable `id` values so an item that stays relevant across updates keeps its place instead of flickering.
- Use `dotColor` sparingly to flag genuine urgency -- colouring everything dulls the signal.
- At most **500 items** per call; a longer array is rejected.
