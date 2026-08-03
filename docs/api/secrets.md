# Secrets

Store and read your plugin's own credentials, encrypted by the operating system's keychain
(macOS Keychain, Windows DPAPI, libsecret) instead of the plaintext rows [Storage](./storage)
and [Database](./db) use.

**Availability:** Both (backend `ctx.secrets` / frontend `AgentMC.secrets`)
**Required Permission:** `secrets`

Use this for anything that would be damaging to leak -- an API key, a database password, an
access token. Use [Storage](./storage) for everything else; secrets are deliberately more
awkward (keys only, no bulk read) and that is not the shape you want for ordinary data.

Secrets are scoped to your plugin and live in their own table, so a plugin holding `storage`
but not `secrets` cannot read your values or even list their keys.

## Four things to know before you use it

These are easy to miss because none of them are visible in the type signatures.

**`set` throws when the machine has no keyring.** There is no plaintext fallback at any layer,
so a `set` that resolves is a value that was definitely encrypted. Handle the rejection --
surface it to the user rather than treating a secret as saved.

**`get` returns `null` for two different situations:** the key was never set, *and* the key was
set but is no longer decryptable (a restored backup, a rotated OS credential). Do not read
`null` as "nothing here, safe to overwrite" if overwriting would lose something.

**`list` returns keys only.** There is no read-all-values primitive anywhere in the stack, by
design.

**Bounds:** a key is 1--256 characters, a value 1--8192. An empty value is rejected rather than
stored, so `''` is never something you can read back.

## Methods

### `get(key: string): Promise<string | null>`

Read a stored secret.

**Parameters:**

| Name | Type | Description |
|---|---|---|
| `key` | `string` | The key to look up (1--256 characters) |

**Returns:** `Promise<string | null>` -- the decrypted secret, or `null` if it is missing **or**
no longer decryptable.

**Example:**

```typescript
// Backend
const password = await ctx.secrets.get(`server:${serverId}:password`)
if (password === null) {
  // Missing, or stored but undecryptable -- ask the user to re-enter it.
}
```

---

### `set(key: string, value: string): Promise<void>`

Encrypt a secret with the OS keychain and store it. Replaces any existing value for the key.

**Parameters:**

| Name | Type | Description |
|---|---|---|
| `key` | `string` | The key to store under (1--256 characters) |
| `value` | `string` | The secret (1--8192 characters; empty is rejected) |

**Returns:** `Promise<void>`

**Throws** when this computer has no available keychain. Nothing is written in that case.

**Example:**

```typescript
try {
  await ctx.secrets.set(`server:${serverId}:password`, password)
} catch (e) {
  // No keyring available. The secret was NOT saved -- say so rather than
  // silently continuing as though it were.
}
```

---

### `delete(key: string): Promise<void>`

Remove a secret. Succeeds whether or not the key existed.

**Parameters:**

| Name | Type | Description |
|---|---|---|
| `key` | `string` | The key to remove |

**Returns:** `Promise<void>`

**Example:**

```typescript
await ctx.secrets.delete(`server:${serverId}:password`)
```

---

### `list(): Promise<string[]>`

The keys your plugin has stored, sorted. Never the values.

**Returns:** `Promise<string[]>` -- an empty array when nothing is stored.

**Example:**

```typescript
const keys = await ctx.secrets.list()
// ['server:abc:password', 'server:def:password']
```

## Testing

`createTestContext()` gives you an in-memory `ctx.secrets` backed by its own map -- separate
from the storage map, mirroring the host's separate table.

```typescript
import { createTestContext } from '@agent-mc/plugin-sdk/testing'

const { ctx } = createTestContext()
await ctx.secrets.set('token', 'abc123')
expect(await ctx.secrets.get('token')).toBe('abc123')
expect(await ctx.secrets.list()).toEqual(['token'])
```
