# Boards

Ask the user which of their boards your plugin may use, then read those boards and change them from your plugin's backend.

**Availability:** The webview (`Omniscio.boards`) lists the boards the user shared and opens the picker: `list()` and `requestAccess()`. The backend (`ctx.boards`) lists them too, reads a board and its items (`getBoard`, `listItems`), and changes boards (`createItem`, `updateItem`, `setValue`, `comment`).
**Required Permission:** `boards.read` for everything on this page. The four changes on the backend also need `boards.write`.

::: tip Default-deny
Declaring `boards.read` grants nothing by itself. Your plugin sees no boards until the user picks specific ones in the picker that `requestAccess()` opens. A board that is not shared, and a board that does not exist, answer the same way, so a plugin cannot probe for boards it was not given. Once a board is shared, the backend can read its items and the values in its columns, except for columns the user cannot see.
:::

::: tip Available when the person turns it on
Reading board content and changing boards from the backend are available when the person has turned on **Plugin access to boards and tasks** in Labs. Until then, a read rejects with "This feature is not available." and a change resolves `{ ok: false, code: 'FEATURE_OFF' }`.
:::

## Permissions

`boards.read` is a standard permission. Omniscio describes it to the user as "Boards: Read the full contents of boards you grant it, including every item, column value and status".

`boards.write` is an elevated permission. Omniscio describes it as "Change boards: Add, move and update items and post comments on the boards you choose. Assigning a person or commenting asks you first." It **requires** `boards.read` in the same manifest.

```json
{
  "permissions": ["boards.read", "boards.write"]
}
```

The user can review each board grant, and every change your plugin made, in the same review panel as other plugin grants. They can revoke a grant there. Disabling or uninstalling the plugin revokes them.

A plugin can never change more than the user could change themselves. A board the user can only read stays read-only for your plugin.

## Webview methods

### `list(): Promise<BridgeGrantedBoard[]>`

The boards this plugin may currently use.

**Returns:** `Promise<BridgeGrantedBoard[]>`. The array is empty until the user has shared a board. A board the user has since deleted is left out.

---

### `requestAccess(): Promise<BridgeBoardAccessOutcome>`

Open Omniscio's board picker so the user can choose which boards to share. Resolves when the picker closes, with the full list of shared boards, so no second call to `list()` is needed.

**Returns:** `Promise<BridgeBoardAccessOutcome>`. When the user closes the picker without choosing, `cancelled` is `true`; `boards` still holds anything shared earlier.

## Backend methods

Each backend method is on `ctx.boards`. Reads are limited to 60 a minute per plugin, and changes to 10 a minute per plugin. A read that fails for an unexpected reason rejects with "Something went wrong. Try again."

### `list(): Promise<PluginGrantedBoard[]>`

The boards this plugin may currently use. The same list the webview sees.

---

### `getBoard(boardId: string): Promise<PluginBoardView>`

One shared board: its name, its groups and its columns. Columns the user cannot see are left out.

**Rejects** with "Board not found" when the board is not shared with your plugin, does not exist, or is not visible to the user.

---

### `listItems(boardId: string, query?: PluginBoardItemsQuery): Promise<PluginBoardItemsPage>`

One page of a shared board's items, each with its values keyed by column id. Values in columns the user cannot see are left out, and so are values in columns that show other boards' data (mirrors, links to other boards and dependencies). `getBoard` still lists those columns.

| Name | Type | Description |
|---|---|---|
| `boardId` | `string` | A board the user shared |
| `query.groupId` | `string` | Optional. Only items in this group |
| `query.limit` | `number` | Optional, 1 to 200. Defaults to 50 |
| `query.cursor` | `string` | Optional. The `nextCursor` of the previous page |

**Returns:** `Promise<PluginBoardItemsPage>`. `nextCursor` is `null` on the last page.

**Rejects** with "Board not found" in the same cases as `getBoard`.

---

### `createItem(boardId: string, input: PluginBoardItemInput): Promise<PluginWriteResult<PluginBoardCreatedItem>>`

Add an item to a shared board. With no `input.groupId`, the item goes in the board's first group. `input.values` is keyed by column id.

**Returns:** `{ ok: true, value: { id } }`. When some values could not be saved, `value.unsavedColumnIds` lists their column ids; the item itself was still created.

**Asks the user first** when `input.values` assigns a person in a people column.

---

### `updateItem(itemId: string, patch: PluginBoardItemPatch): Promise<PluginWriteResult<{ id: string }>>`

Rename an item, move it to another group on the same board, or both. Give `patch.name`, `patch.groupId`, or both.

---

### `setValue(itemId: string, columnId: string, value: unknown): Promise<PluginWriteResult<{ id: string }>>`

Set one column value on an item. The value has to fit the column's type.

**Asks the user first** when the column is a people column, whether you assign someone or clear the column.

---

### `comment(itemId: string, text: string): Promise<PluginWriteResult<{ id: string }>>`

Post a comment on an item. `text` is 1 to 2,000 characters. The question the user sees shows the whole comment.

**Asks the user first, every time.**

## Results and refusals

A change never throws because it was refused. It resolves `{ ok: false, code }`, so check `ok` before you use `value`.

| `code` | What it means |
|---|---|
| `FEATURE_OFF` | The user has not turned on Plugin access to boards and tasks |
| `NOT_FOUND` | The board or item does not exist, or it is not shared with your plugin. The two look the same on purpose |
| `FORBIDDEN` | The user themselves may not make this change, for example on a board they can only read, or a comment on a board that does not take comments |
| `INVALID` | The change does not fit the board: an unknown column or group, a value the column cannot hold, a column type plugins cannot set (links to other boards, dependencies, approvals and documents), or a board with no group to put the item in |
| `CONFLICT` | The change could not be completed right now, for example because the board changed or could not be reached. Try again |
| `RATE_LIMITED` | More than 10 changes in a minute |
| `DECLINED` | The user said no when asked |
| `BUSY` | The user is already looking at another question from your plugin. Wait for it to be answered, then ask again |
| `FAILED` | Something unexpected went wrong inside Omniscio. Nothing is promised about whether the change happened; read the item again before you retry |

::: tip Ask first
People column values and comments ask the user every time. The text of the question is written by Omniscio from its own records, with the board name, the item name and the people's names, so your plugin cannot word it. The change runs only after the user allows it, and Omniscio checks the grant and the user's rights again after the answer. Only one question per plugin can be open at a time. Everything else on this page runs without asking.
:::

## Types

```typescript
interface BridgeGrantedBoard {
  id: string
  name: string
}

interface BridgeBoardAccessOutcome {
  /** `true` when the person dismissed the picker without choosing. */
  cancelled: boolean
  /** Every board this plugin may now read, including ones shared earlier. */
  boards: BridgeGrantedBoard[]
}

type PluginWriteCode =
  | 'FEATURE_OFF' | 'NOT_FOUND' | 'FORBIDDEN' | 'INVALID'
  | 'CONFLICT' | 'RATE_LIMITED' | 'DECLINED' | 'BUSY' | 'FAILED'

type PluginWriteResult<T> = { ok: true; value: T } | { ok: false; code: PluginWriteCode }

interface PluginBoardView {
  id: string
  name: string
  groups: { id: string; name: string }[]
  columns: { id: string; title: string; type: string }[]
}

interface PluginBoardItem {
  id: string
  name: string
  groupId: string
  values: Record<string, unknown>
}

interface PluginBoardItemsPage {
  items: PluginBoardItem[]
  /** `null` on the last page. */
  nextCursor: string | null
}

interface PluginBoardItemsQuery {
  groupId?: string
  limit?: number
  cursor?: string
}

interface PluginBoardItemInput {
  name: string
  groupId?: string
  values?: Record<string, unknown>
}

interface PluginBoardItemPatch {
  name?: string
  groupId?: string
}

interface PluginBoardCreatedItem {
  id: string
  /** Column ids whose value was not saved. Absent when every value was saved. */
  unsavedColumnIds?: string[]
}
```

## Example

In the webview, ask the user for boards:

```typescript
const omniscio = window.Omniscio ?? window.AgentMC

async function ensureBoards(): Promise<BridgeGrantedBoard[]> {
  const shared = await omniscio.boards.list()
  if (shared.length > 0) return shared

  const outcome = await omniscio.boards.requestAccess()
  if (outcome.cancelled && outcome.boards.length === 0) {
    omniscio.toast.show({ type: 'info', message: 'No boards shared yet.' })
  }
  return outcome.boards
}
```

In the backend, read a shared board and add an item to its first group:

```typescript
import type { PluginContext } from '@omniscio/plugin-sdk'

export async function addFollowUp(ctx: PluginContext, boardId: string, name: string): Promise<string | null> {
  const board = await ctx.boards!.getBoard(boardId)
  const page = await ctx.boards!.listItems(boardId, { limit: 100 })
  ctx.log.info(`${board.name} has ${page.items.length} items on this page`)

  const result = await ctx.boards!.createItem(boardId, { name })
  if (!result.ok) {
    ctx.log.warn(`Could not add the item: ${result.code}`)
    return null
  }
  return result.value.id
}
```

## Notes

- A backend that needs to know which boards were shared can call `ctx.boards.list()` itself, or receive the list from its webview with [`ctx.events`](./events).
- To attach your plugin's own content to items on the boards the user shared, see [Board Links](./board-links).
- To work with the user's task lists the same way, see [Tasks](./tasks).
- `ctx.boards` is optional on `PluginContext`, so a context double written before the SDK typed it still compiles. Use `ctx.boards!` or check for it first.
- `@omniscio/plugin-sdk/browser` exports `BridgeBoards`, `BridgeGrantedBoard` and `BridgeBoardAccessOutcome`. The backend types (`PluginBoards` and the shapes above) are exported from `@omniscio/plugin-sdk`.
