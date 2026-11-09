# Boards

Ask the user which of their boards your plugin may use, and list the boards they chose.

**Availability:** Webview only (`Omniscio.boards`). There is no `ctx.boards`.
**Required Permission:** `boards.read`

::: tip Default-deny
Declaring `boards.read` grants nothing by itself. Your plugin sees no boards until the user picks specific ones in the picker that `requestAccess()` opens. This API never hands your plugin raw board items; it only tells you which boards you may use.
:::

## Permissions

`boards.read` is a standard permission. Omniscio describes it to the user as "Boards: Read the full contents of boards you grant it, including every item, column value and status".

```json
{
  "permissions": ["boards.read"]
}
```

The user can review and revoke each board grant in the same review panel as other plugin grants. Disabling or uninstalling the plugin revokes them.

## Methods

### `list(): Promise<BridgeGrantedBoard[]>`

The boards this plugin may currently read.

**Returns:** `Promise<BridgeGrantedBoard[]>`. The array is empty until the user has shared a board. A board the user has since deleted is left out.

---

### `requestAccess(): Promise<BridgeBoardAccessOutcome>`

Open Omniscio's board picker so the user can choose which boards to share. Resolves when the picker closes, with the full list of shared boards, so no second call to `list()` is needed.

**Returns:** `Promise<BridgeBoardAccessOutcome>`. When the user closes the picker without choosing, `cancelled` is `true`; `boards` still holds anything shared earlier.

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
```

## Example

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

## Notes

- Webview only. A backend that needs to know which boards were shared should receive that from its webview with [`ctx.events`](./events).
- To attach your plugin's own content to items on the boards the user shared, see [Board Links](./board-links).
- `@omniscio/plugin-sdk/browser` exports `BridgeBoards`, `BridgeGrantedBoard` and `BridgeBoardAccessOutcome`.
