# Sidebar

Control your plugin's sidebar appearance -- update the badge count and manage the list of items shown beneath your plugin in Omniscio's sidebar.

**Availability:** Both (backend `ctx.sidebar` / frontend `Omniscio.sidebar`)
**Required Permission:** None

::: danger `status` is REQUIRED, and a row without it never appears
The host checks every row you send. A row that fails a check is **dropped**, and the rows around it are kept. A row without `status` fails, so `setItems()` resolves successfully and *that row* does not appear. The host writes **one warning to its log per call** naming the first dropped row.

If **every** row fails, you have sent an empty list, so your list empties. At most **200 items** per call; a longer array is rejected outright.

The type has required `status` since 2026-08-11, so the compiler catches this. To see which rows Omniscio would drop and why, use [`validateSidebarItems`](#checking-rows-before-you-send-them).
:::

## SidebarItem

The `setItems()` method accepts an array of `SidebarItem` objects:

```typescript
interface SidebarItem {
  id: string               // Unique identifier for the item
  title: string            // Display text
  status: string           // REQUIRED status label (shown as a chip)
  needsYou?: boolean       // If true, item shows an attention indicator
  progress?: number        // Progress percentage (0-100)
  currentStep?: number     // Current step in a multi-step process
  totalSteps?: number      // Total steps in a multi-step process
}
```

## Methods

### `setBadge(count: number): void`

Set the numeric badge shown on your plugin's sidebar icon. Pass `0` to clear the badge.

**Parameters:**

| Name | Type | Description |
|---|---|---|
| `count` | `number` | Badge count to display. `0` hides the badge |

**Returns:** `void`

**Example:**

```typescript
// Frontend
Omniscio.sidebar.setBadge(3)   // Show "3" badge
Omniscio.sidebar.setBadge(0)   // Clear badge

// Backend
ctx.sidebar.setBadge(5)
```

---

### `setItems(items: SidebarItem[]): void`

Replace the list of items shown under your plugin in the sidebar. Each item can display a title, status, progress, and attention indicator.

**Parameters:**

| Name | Type | Description |
|---|---|---|
| `items` | `SidebarItem[]` | Array of sidebar items to display |

**Returns:** `void`

**Example:**

```typescript
// Frontend
Omniscio.sidebar.setItems([
  { id: 'task-1', title: 'Security Audit', status: 'running', progress: 45 },
  { id: 'task-2', title: 'Code Review', status: 'waiting', needsYou: true },
  { id: 'task-3', title: 'Deploy', status: 'building', currentStep: 2, totalSteps: 5 },
])

// Backend
ctx.sidebar.setItems([
  { id: 'scan-1', title: 'Dependency Scan', status: 'complete' },
  { id: 'scan-2', title: 'License Check', status: 'running', progress: 80 },
])

// Clear all items
Omniscio.sidebar.setItems([])
```

## Notes

- Rows are checked one by one. Good rows show, bad rows are dropped, and a batch where every row is bad empties your list. The page and your backend go through the same check.
- The badge count and item list are independent. Setting items does not affect the badge count, and vice versa.
- Calling `setItems()` replaces the entire list. To update a single item, re-send the full array with the updated item included.
- The `needsYou` flag shows an attention indicator (amber dot) on the item, consistent with Omniscio's "Needs You" pattern for sessions.
- The `progress` field renders a progress bar when provided (0--100 range).
- `currentStep` and `totalSteps` display as "Step 2/5" text when both are provided.
- No permission is required. Every plugin can update its sidebar appearance.

## Checking rows before you send them

`validateSidebarItems(items)` from `@omniscio/plugin-sdk` runs the same row checks as Omniscio, with limits generated from the app. It returns the rows Omniscio would keep, the rows it would drop, and a refusal when the whole batch is turned away (more than 200 rows, or not a list).

```typescript
import { validateSidebarItems } from '@omniscio/plugin-sdk'

const check = validateSidebarItems([
  { id: 'a', title: 'Scan', status: 'running' },
  { id: 'b', title: 'Deploy' },
])
// check.kept    -> [{ id: 'a', ... }]
// check.dropped -> [{ index: 1, id: 'b', reason: '...' }]
// check.refused -> undefined
```

Each dropped entry has the row's `index`, its `id` when it has one, and the first `reason` the row failed. The [dev shell](../guide/dev-shell) shows your rows and the dropped ones with their reasons.

## Which sidebar feature should I use?

Omniscio has two sidebar surfaces, and a plugin can use either or both.

| | Widget tiles | Sidebar rows |
|---|---|---|
| What it is | A tile you declare in `ui.widgets` and fill with `widget.set` | A list of rows from `sidebar.setItems`, plus a badge from `setBadge` |
| Where it shows | In the person's Widget Sidebar, where they add it from the **Add** picker | Under your plugin in Omniscio's sidebar |
| What you send | A [widget spec](./widget): a number, a list, a chart, a note, or progress, with optional buttons | Rows with a title, a required `status`, and optional progress, steps or an attention flag |
| Permission | `chrome` and `chrome.widget` | None |

Use a **widget tile** for a glanceable reading the person chooses to keep in view. Use **sidebar rows** for the plugin's own list of things, such as scans or tasks, with the badge beside it. See [Widget](./widget).
