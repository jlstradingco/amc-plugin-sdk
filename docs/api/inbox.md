# Inbox

Surface plugin items in AMC's Inbox — the unified list where the user handles alerts, approvals, and things that need their attention. Use it to raise items the user should see even when your plugin's panel is not open.

**Availability:** Backend only (`ctx.inbox`)
**Required Permission:** `inbox`

## Methods

### `setItems(items: InboxItem[]): Promise<void>`

Replace the plugin's current set of inbox items. This is a **declarative** set operation — pass the complete list your plugin wants shown, not a delta. Passing an empty array clears all of the plugin's inbox items.

**Parameters:**

| Name | Type | Description |
|---|---|---|
| `items` | `InboxItem[]` | The complete list of items to show for this plugin |

**Returns:** `Promise<void>`

### `InboxItem`

| Field | Type | Description |
|---|---|---|
| `id` | `string` | Stable, plugin-unique id. Reusing an id updates the existing item rather than adding a new one |
| `title` | `string` | The item's headline text |
| `body` | `string` (optional) | Secondary detail line |
| `icon` | `string` (optional) | Icon name to display alongside the item |
| `priority` | `'low' \| 'normal' \| 'high'` (optional) | Sort/emphasis hint; defaults to `normal` |
| `actionLabel` | `string` (optional) | Label for the item's primary action button |
| `actionId` | `string` (optional) | Identifier delivered back to your plugin when the action is clicked |
| `timestamp` | `string` (optional) | ISO timestamp shown as the item's time |

**Example:**

```typescript
// Raise two items the user should act on
await ctx.inbox.setItems([
  {
    id: 'pr-review-4821',
    title: 'PR #4821 needs review',
    body: 'feat: add publish preflight checks',
    priority: 'high',
    actionLabel: 'Open PR',
    actionId: 'open-pr:4821',
    timestamp: new Date().toISOString(),
  },
  {
    id: 'stale-branch-warning',
    title: '3 branches are 200+ commits behind master',
    priority: 'low',
  },
])

// Later — clear everything this plugin has posted
await ctx.inbox.setItems([])
```

## Notes

- `setItems` is a **full replace** for this plugin's items. To remove one item, call `setItems` again with that item omitted.
- Ids are the identity key: keep them stable across calls so an item updates in place instead of flickering out and back in.
- Use `priority: 'high'` sparingly — reserve it for things the user genuinely needs to act on.
- Inbox items are per-plugin. Setting items from your plugin never affects items posted by AMC or other plugins.
