# Members

List the people in the workspace the user is working in right now.

**Availability:** Both (backend `ctx.members` / webview `Omniscio.members`)
**Required Permission:** `members.read`

::: tip The minimum, on purpose
Each person comes back with four fields: an id, a display name, an avatar address and a role. Email addresses, invite state and anything else about a person are never included. Omniscio describes the permission to the user as "See your workspace's people: Read the names, pictures and roles of the people in the workspace you are using. Never their email addresses."
:::

## Permissions

`members.read` is a standard permission.

```json
{
  "permissions": ["members.read"]
}
```

Without it, a plugin sees nothing.

## Methods

### `list(): Promise<PluginMember[]>`

The people in the active workspace.

The list follows the workspace the user has switched to. The call takes no workspace argument, so do not cache the result across a long session; call it again when you need it. In the user's personal workspace the list is just the user.

**Returns:** `Promise<PluginMember[]>`

**Rejects** when Omniscio does not yet know which workspace is active.

## Types

```typescript
interface PluginMember {
  /** The person's stable id. */
  id: string
  displayName: string
  /** `null` when the person has no profile picture. */
  avatarUrl: string | null
  role: 'owner' | 'admin' | 'member' | 'guest'
}
```

## Example

```typescript
// Webview
const omniscio = window.Omniscio ?? window.AgentMC

try {
  const people = await omniscio.members.list()
  const admins = people.filter((p) => p.role === 'owner' || p.role === 'admin')
  renderAssigneePicker(people, admins)
} catch {
  renderAssigneePicker([], [])
}
```

```typescript
// Backend
import type { PluginContext } from '@omniscio/plugin-sdk'

export async function activate(ctx: PluginContext) {
  const people = (await ctx.members?.list()) ?? []
  ctx.log.info(`${people.length} people in the active workspace`)
  return {}
}
```

## Notes

- On the backend `ctx.members` is optional on `PluginContext`; check it before use. On the webview it is always typed.
- `@omniscio/plugin-sdk/browser` exports `BridgeMembers`. `PluginMember` comes from `@omniscio/plugin-sdk`.
