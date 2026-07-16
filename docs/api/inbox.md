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

## The `InboxItem` type

```typescript
interface InboxItem {
  id: string
  title: string
  body?: string
  icon?: string
  priority?: 'low' | 'normal' | 'high'
  actionLabel?: string
  actionId?: string
  timestamp?: string
}
```

| Field | Type | Description |
|---|---|---|
| `id` | `string` | Stable identifier for the item. Reuse the same `id` across updates so the row is replaced, not duplicated |
| `title` | `string` | Headline shown in the inbox row |
| `body` | `string` | Optional supporting text |
| `icon` | `string` | Optional icon name |
| `priority` | `'low' \| 'normal' \| 'high'` | Optional priority; higher-priority items sort toward the top |
| `actionLabel` | `string` | Optional label for the item's action button |
| `actionId` | `string` | Optional action identifier your plugin recognizes when the user clicks the action |
| `timestamp` | `string` | Optional ISO timestamp shown on the row |

## Example

```typescript
// Backend
await ctx.inbox.setItems([
  {
    id: 'scan-report',
    title: 'Security scan finished',
    body: 'Found 3 issues across 2 dependencies.',
    priority: 'high',
    actionLabel: 'View report',
    actionId: 'open-report',
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
- Reserve `priority: 'high'` for items the user genuinely needs to act on -- overusing it dulls the signal.
