# Sidebar

Control your plugin's sidebar appearance -- update the badge count and manage the list of items shown beneath your plugin in AMC's sidebar.

**Availability:** Both (backend `ctx.sidebar` / frontend `AgentMC.sidebar`)
**Required Permission:** None

::: danger `status` is REQUIRED, and omitting it fails silently
This page showed `status` as optional. The host validates the whole array against a push
schema and, on any failure, **logs a warning and drops the entire batch** -- it never throws.
So a single item without `status` meant `setItems()` resolved successfully and *nothing*
appeared in the sidebar.

The type has required it since 2026-08-11, so the compiler catches this now. At most **200
items** per call; a longer array is rejected outright.
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
AgentMC.sidebar.setBadge(3)   // Show "3" badge
AgentMC.sidebar.setBadge(0)   // Clear badge

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
AgentMC.sidebar.setItems([
  { id: 'task-1', title: 'Security Audit', status: 'running', progress: 45 },
  { id: 'task-2', title: 'Code Review', status: 'waiting', needsYou: true },
  { id: 'task-3', title: 'Deploy', currentStep: 2, totalSteps: 5 },
])

// Backend
ctx.sidebar.setItems([
  { id: 'scan-1', title: 'Dependency Scan', status: 'complete' },
  { id: 'scan-2', title: 'License Check', status: 'running', progress: 80 },
])

// Clear all items
AgentMC.sidebar.setItems([])
```

## Notes

- The badge count and item list are independent. Setting items does not affect the badge count, and vice versa.
- Calling `setItems()` replaces the entire list. To update a single item, re-send the full array with the updated item included.
- The `needsYou` flag shows an attention indicator (amber dot) on the item, consistent with AMC's "Needs You" pattern for sessions.
- The `progress` field renders a progress bar when provided (0--100 range).
- `currentStep` and `totalSteps` display as "Step 2/5" text when both are provided.
- No permission is required. Every plugin can update its sidebar appearance.
