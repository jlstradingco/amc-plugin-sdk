# Navigation

Move the user to another part of Omniscio: one of their sessions, or a conversation with a teammate.

**Availability:** Webview only (`Omniscio.navigation`). There is no `ctx.navigation`.
**Required Permission:** `navigation`

## Permissions

`navigation` is a standard permission. Omniscio shows it to the user as "Navigation: Navigate Omniscio to your sessions, projects, and views".

```json
{
  "permissions": ["navigation"]
}
```

::: warning Rate limited
Calls are limited per plugin to 10 in 5 seconds, so a runaway loop cannot keep taking the user's focus. Call these methods in response to something the user did, such as a click.
:::

## Methods

### `goToSession(sessionId: string): Promise<void>`

Show one of Omniscio's own sessions.

**Parameters:**

| Name | Type | Description |
|---|---|---|
| `sessionId` | `string` | The id of the session to show |

**Returns:** `Promise<void>`

---

### `openTeamChat(uid: string): Promise<void>`

Open the direct-message conversation with a teammate. This only opens the conversation. It sends nothing.

**Parameters:**

| Name | Type | Description |
|---|---|---|
| `uid` | `string` | The teammate's user id |

**Returns:** `Promise<void>`

## Example

```typescript
const omniscio = window.Omniscio ?? window.AgentMC

openButton.addEventListener('click', async () => {
  try {
    await omniscio.navigation.goToSession(row.sessionId)
  } catch {
    omniscio.toast.show({ type: 'error', message: 'Could not open that session.' })
  }
})

messageButton.addEventListener('click', () => omniscio.navigation.openTeamChat(teammateUid))
```

## Notes

- Webview only.
- To get a session id to navigate to, create one with [Sessions](./sessions) or read a granted one with [Session History](./session-history).
- `@omniscio/plugin-sdk/browser` exports `BridgeNavigation`.
