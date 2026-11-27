# Members

List the people in the workspace the user is working in right now, and, with a second
permission, invite someone or remove a member there.

**Availability:** Both for `list` (backend `ctx.members` / webview `Omniscio.members`); webview only
for `invite` and `remove`
**Required Permission:** `members.read`; `invite` and `remove` also need `members.manage`

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

`members.manage` is an **elevated** permission, and it **requires** `members.read` in the same
manifest. It adds `invite` and `remove` and nothing else; reading the team never grants it.

```json
{
  "permissions": ["members.read", "members.manage"]
}
```

## Methods

### `list(): Promise<PluginMember[]>`

The people in the active workspace.

The list follows the workspace the user has switched to. The call takes no workspace argument, so do not cache the result across a long session; call it again when you need it. In the user's personal workspace the list is just the user.

**Returns:** `Promise<PluginMember[]>`

**Rejects** when Omniscio does not yet know which workspace is active.

### `invite(email: string): Promise<BridgeMemberInviteResult>`

Invite someone by email to the active company workspace. Webview only.

Omniscio, not the plugin, decides who is asking and which workspace: the signed-in person and the
workspace they are using. It checks the person is an owner or an admin there, then shows its own
dialog naming your plugin and the address, and invites only after the person says yes. The cloud
checks the person's role again.

**Returns:** `{ status }`, one of `sent`, `email-not-delivered` (the invitation exists but its email
did not arrive), `already-invited` or `not-sent`.

**Rejects** when the person declines, when they could not invite on the People screen (a plain
member, a guest, a chat workspace or the personal workspace), when the address is not an email, or
while another team change from your plugin is still waiting for an answer.

### `remove(memberId: string): Promise<void>`

Remove a member of the active workspace, by the `id` that `list()` returned. Webview only.

The same rules as the People screen apply: nobody removes themselves this way, an admin cannot
remove an owner, and guests are not removed here. Omniscio shows its own dialog naming your plugin
and the person, and removes them only after a yes. They lose access at once.

**Rejects** on the same conditions as `invite`, and when the id is not on the team.

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

interface BridgeMemberInviteResult {
  status: 'sent' | 'email-not-delivered' | 'already-invited' | 'not-sent'
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
- `invite` and `remove` are optional on `BridgeMembers`: a host that predates `members.manage` does
  not have them, so check `typeof omniscio.members.invite === 'function'` before offering the controls.
- `@omniscio/plugin-sdk/browser` exports `BridgeMembers` and `BridgeMemberInviteResult`. `PluginMember` comes from `@omniscio/plugin-sdk`.
