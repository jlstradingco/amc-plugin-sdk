# Board Links

Link a board item to something your plugin owns, and find those links again later.

**Availability:** Webview only (`Omniscio.boardLinks`). There is no `ctx.boardLinks`.
**Required Permission:** `boards.link`

::: tip Links only, never edits
`boards.link` lets a plugin attach and detach its own content on tasks the user has granted it, without changing the tasks themselves. Omniscio shows it to the user as "Attach to your tasks" and marks it as an elevated permission on the install card.
:::

## Permissions

Items you can link must sit on a board the user has shared with your plugin. Sharing happens through [`Omniscio.boards.requestAccess()`](./boards), which needs `boards.read`, so a plugin that links items declares both.

```json
{
  "permissions": ["boards.read", "boards.link"]
}
```

Omniscio decides the kind of link from your plugin's id and refuses every call from a plugin it has not given a link kind.

## Methods

### `searchItems(opts: { query: string; limit?: number }): Promise<BridgeBoardLinkItem[]>`

Search items on the boards shared with this plugin.

**Parameters:**

| Name | Type | Description |
|---|---|---|
| `opts.query` | `string` | The text to search for |
| `opts.limit` | `number` | Optional, 1 to 50. Defaults to 20 |

**Returns:** `Promise<BridgeBoardLinkItem[]>`

---

### `listForEntity(opts: { entityId: string }): Promise<BridgeBoardLink[]>`

The links attached to one of your own entities, limited to boards shared with this plugin.

**Returns:** `Promise<BridgeBoardLink[]>`

---

### `create(opts: { itemId: string; entityId: string; label?: string }): Promise<BridgeBoardLink>`

Link an item to one of your entities.

**Returns:** `Promise<BridgeBoardLink>`

**Rejects** when the item is missing or its board is not shared with your plugin.

---

### `remove(opts: { linkId: string }): Promise<boolean>`

Remove one of your links.

**Returns:** `Promise<boolean>`. Resolves `true` also when the link is already gone.

## Types

```typescript
interface BridgeBoardLinkItem {
  id: string
  name: string
  boardId: string
  boardName: string
}

interface BridgeBoardLink {
  id: string
  itemId: string
  itemName: string
  boardId: string
  /** `null` when the link was created without a label. */
  label: string | null
}
```

## Example

```typescript
const omniscio = window.Omniscio ?? window.AgentMC

async function linkNoteToTask(noteId: string, query: string) {
  const items = await omniscio.boardLinks.searchItems({ query, limit: 5 })
  if (items.length === 0) return null

  try {
    return await omniscio.boardLinks.create({
      itemId: items[0].id,
      entityId: noteId,
      label: 'Meeting notes',
    })
  } catch {
    omniscio.toast.show({ type: 'error', message: 'That task is no longer shared with this plugin.' })
    return null
  }
}

const links = await omniscio.boardLinks.listForEntity({ entityId: 'note-42' })
for (const link of links) {
  console.log(`${link.itemName} (${link.label ?? 'no label'})`)
}
```

## Notes

- Webview only.
- `@omniscio/plugin-sdk/browser` exports `BridgeBoardLinks`, `BridgeBoardLinkItem` and `BridgeBoardLink`.
