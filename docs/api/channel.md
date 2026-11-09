# Channel

Keep a long-lived outbound WebSocket open to a service you choose, without handling the socket yourself.

**Availability:** Backend only (`ctx.channel`). There is no webview counterpart.
**Required Permission:** `channel`

::: warning Elevated permission
`channel` is an elevated permission. Omniscio shows it to the user on the install card as "Live Connection: Maintain a live connection to an external service you choose" and marks it as elevated. Neither `network` nor `oauth` grants it.
:::

Omniscio owns the socket. It reconnects after a drop, keeps the connection alive, and bounds how many channels and how much traffic a plugin may use. A channel is closed when the plugin is disabled. Your plugin never receives a raw socket.

`ctx.channel` is optional on `PluginContext`, so check it before use.

## Permissions

```json
{
  "permissions": ["channel"]
}
```

## Methods

### `connect(options: PluginChannelConnectOptions, onMessage: (event: PluginChannelEvent) => void): Promise<PluginChannelHandle>`

Open a channel. The promise resolves as soon as the channel is created, not when the socket is open. Watch for the `open` event before sending.

**Parameters:**

| Name | Type | Description |
|---|---|---|
| `options` | `PluginChannelConnectOptions` | Where to connect. See below |
| `onMessage` | `(event: PluginChannelEvent) => void` | Called for every event on the channel |

**Returns:** `Promise<PluginChannelHandle>`

**Rejects** with a plain-language message when Omniscio refuses the request: a bad address, too many channels, or the connect rate limit.

### `PluginChannelHandle.send(data: string): Promise<PluginChannelSendResult>`

Send one text message.

A refusal is a value, not a rejection. `send` resolves `{ ok: false, error }` when the channel is not open yet, is closed, or the message is too large.

### `PluginChannelHandle.close(): Promise<void>`

Close the channel for good. Safe to call more than once.

## Types

```typescript
interface PluginChannelConnectOptions {
  /** Only `'ws'` (an outbound WebSocket) is supported. `'webhook'` is refused by the host. */
  kind?: 'ws'
  /** A `wss://` address. Plain `ws://` and any local or private-network address is refused. */
  url: string
  /** Optional WebSocket sub-protocol name or names. */
  protocols?: string | string[]
  /** Extra request headers for the handshake. The host refuses connection-control headers. */
  headers?: Record<string, string>
}

type PluginChannelEvent =
  | { type: 'open' }
  | { type: 'message'; data: string }
  | { type: 'close'; code: number; reason: string }
  | { type: 'error'; message: string }

type PluginChannelSendResult = { ok: true } | { ok: false; error: string }

interface PluginChannelHandle {
  send(data: string): Promise<PluginChannelSendResult>
  close(): Promise<void>
}
```

## What Omniscio refuses

- Anything other than `wss://`. Plain `ws://` is refused.
- Localhost, loopback, private-network and link-local addresses, whether written as a literal address or reached through a host name.
- `kind: 'webhook'`. Only outbound WebSockets are supported; Omniscio has no public address to receive inbound requests.
- Handshake headers that control the connection itself, such as `Host`, `Connection`, `Upgrade` and the `sec-websocket-*` family.

## Limits

- Text frames only. Binary messages from the server are dropped.
- A plugin may hold up to 4 channels at once.
- Connect attempts and outgoing messages are rate limited, and each message has a size cap.
- `send` before the `open` event resolves `{ ok: false }`; Omniscio does not queue it.

## Example

```typescript
import type { PluginContext, PluginChannelHandle } from '@omniscio/plugin-sdk'

export async function activate(ctx: PluginContext) {
  if (!ctx.channel) return {}

  const token = await ctx.secrets.get('socket-token')
  if (token === null) {
    ctx.log.warn('No socket token saved yet')
    return {}
  }

  let handle: PluginChannelHandle | undefined

  handle = await ctx.channel.connect(
    { kind: 'ws', url: 'wss://example.com/socket', headers: { Authorization: `Bearer ${token}` } },
    async (event) => {
      if (event.type === 'open') {
        const sent = await handle?.send(JSON.stringify({ type: 'hello' }))
        if (sent && !sent.ok) ctx.log.warn(`Send refused: ${sent.error}`)
      } else if (event.type === 'message') {
        ctx.log.info(`Received ${event.data.length} characters`)
      } else if (event.type === 'close') {
        ctx.log.info(`Channel closed (${event.code})`)
      } else if (event.type === 'error') {
        ctx.log.warn(event.message)
      }
    }
  )

  return {
    onDisable() {
      return handle?.close()
    },
  }
}
```

## Notes

- Keep tokens in [`ctx.secrets`](./secrets), not in storage.
- Omniscio reconnects a dropped channel on its own. Do not open a second channel to replace one that dropped; call `close()` only when you are finished with it.
- Backend only. To show channel data in your panel, forward it with [`ctx.events`](./events).
