# Inbox

Surface items in Omniscio's inbox -- the unified list where the user reviews things that need their attention.

**Availability:** Both (backend `ctx.inbox` / frontend `Omniscio.inbox`)
**Required Permission:** `inbox` (`inbox.read` for `listMine`)

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

### `onDismiss(handler: (dismissal: InboxDismissal) => void): () => void`

**Availability:** backend only (`ctx.inbox`); the webview `Omniscio.inbox` has no `onDismiss`.

Find out when the user dismisses one of your inbox rows, or undoes that dismissal. Without a handler your plugin is never told, so its own screen can keep showing a row the user already cleared.

**Requires the `inbox` permission.**

| Name | Type | Description |
|---|---|---|
| `handler` | `(dismissal: InboxDismissal) => void` | Called once per dismissal or undo of one of YOUR rows |

**Returns:** a function that removes the handler.

```typescript
interface InboxDismissal {
  itemId: string      // the `id` you pushed, with no host prefix
  dismissed: boolean  // true = dismissed, false = the dismissal was undone
}
```

```typescript
ctx.inbox.onDismiss(({ itemId, dismissed }) => {
  void markRead(itemId, dismissed)
})
```

A handler only hears about your own rows, never another plugin's. A timed "remind me later" snooze is not a dismissal and does not call it. In tests, `createTestContext()` returns `dismissInboxItem(itemId, dismissed = true)` to simulate one.

### `listMine(query?: PluginMyInboxQuery): Promise<PluginMyInboxPage>`

**Availability:** backend only (`ctx.inbox`); a panel call is refused.

See the titles of what is waiting for the user: their open inbox items and the sessions waiting on them, newest first. Each item carries its title, its kind, when it arrived and whether it is asking the user something, and never its contents.

**Requires the `inbox.read` permission** (elevated). It is separate from `inbox`: `inbox` alone cannot list, and `inbox.read` alone cannot post. Available when the user has turned on Plugin access to your inbox in Labs; otherwise the call rejects.

| Name | Type | Description |
|---|---|---|
| `query.limit` | `number` | Optional. A whole number from 1 to 100; 25 when left out |

**Returns:** `Promise<PluginMyInboxPage>`

```typescript
interface PluginMyInboxItem {
  id: string
  kind: 'alert' | 'session'
  title: string       // a session reads "<session name> - <project name>"
  createdAt: string   // ISO time it arrived, or the session started waiting
  asksYou: boolean    // true only when whoever raised it said it asks the user something
}

interface PluginMyInboxPage {
  items: PluginMyInboxItem[]
  truncated: boolean  // true when more items were left out
}
```

```typescript
const { items, truncated } = await ctx.inbox.listMine({ limit: 10 })
const questions = items.filter((item) => item.asksYou)
```

What is never returned:

- an item's text, links, files, the prompt or form it carries, its fields, where it would take the user, who sent it, or which session raised it
- snoozed or answered items, items filed for an agent crew, and items any plugin posted (your own included)
- private sessions (such as AI Coaching), hidden or background plugin sessions, review sessions, and sessions running on another computer

At most 60 reads a minute per plugin, shared with the other work-data reads; a faster call rejects with `RATE_LIMITED`. Every read is written to the host's read log. In tests, `createTestContext()` answers an empty page.

## The `InboxItem` type

```typescript
interface InboxItem {
  id: string
  title: string
  timestamp: string   // REQUIRED -- the inbox orders on it
  subtitle?: string
  dotColor?: string
  quiet?: boolean
}
```

| Field | Type | Description |
|---|---|---|
| `id` | `string` | Stable identifier. Reuse the same `id` across updates so the row is replaced, not duplicated |
| `title` | `string` | Headline shown in the inbox row |
| `timestamp` | `string` | **Required** ISO timestamp. This is the inbox's sort key -- your plugin owns recency |
| `subtitle` | `string` | Optional supporting text |
| `dotColor` | `string` | Optional override of the per-source dot colour |
| `quiet` | `boolean` | Optional. `true` keeps the row in the Inbox and on your own screen but leaves it out of the number on your sidebar row and out of that number's popover. Use it for reminders that do not need the user |

::: warning `quiet` must be a boolean
Any other value fails the same silent batch validation below: the host drops the whole batch.
:::

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
await Omniscio.inbox.setItems([
  { id: 'welcome', title: 'Finish setup', body: 'Connect an account to get started.' },
])
```

## Notes

- `setItems()` is a full replace. Keep the complete current set in memory and publish it whenever it changes.
- Use stable `id` values so an item that stays relevant across updates keeps its place instead of flickering.
- Use `dotColor` sparingly to flag genuine urgency -- colouring everything dulls the signal.
- At most **500 items** per call; a longer array is rejected.
