# Notifications

Show system notifications that respect Focus Mode and that your plugin can close again.

**Availability:** Webview (`Omniscio.notifications`) and backend (`ctx.notifications`), with the same two methods and the same options.
**Required Permission:** None from your panel; `notifications` from a backend

## Permissions

A panel needs no permission to show and clear its own notifications: every notification it fires belongs to your plugin and can only be cleared by your plugin. The `notifications` permission ("Notifications: Show toasts and system notifications") is what a backend declares for `ctx.notifications` and `ctx.toast.notify`.

## Methods

### `fire(opts: BridgeNotification): Promise<void>`

Show a notification.

**Returns:** `Promise<void>`. Resolves with no value.

---

### `clear(opts: { tag: string }): Promise<void>`

Close the open notification that has this tag, if any.

**Returns:** `Promise<void>`. Resolves with no value.

## `BridgeNotification`

```typescript
interface BridgeNotification {
  /** 1 to 120 characters. */
  title: string
  /** Up to 500 characters. */
  body: string
  /** 1 to 120 characters. Names the notification so `clear` can close it; scoped to your plugin. */
  tag: string
  /** Defaults to `'info'`. */
  category?: 'email' | 'task' | 'alert' | 'info'
  /** Where a click opens your own plugin's panel. `pluginId` must be your own plugin's id; a link that names any other plugin is dropped and the notification shows with no click action. */
  deepLink?: { pluginId: string; path: string }
  sound?: string
  /** Show the notification even while Focus Mode is on. */
  bypassFocusMode?: boolean
  silent?: boolean
}
```

| Field | Notes |
|---|---|
| `title` | Required, 1 to 120 characters |
| `body` | Required, up to 500 characters |
| `tag` | Required, 1 to 120 characters. Use it later with `clear`. Tags are scoped to your plugin, so they cannot clash with another plugin's |
| `category` | `'email'`, `'task'`, `'alert'` or `'info'`. Defaults to `'info'` |
| `deepLink` | Where a click should lead, as a plugin id and a path inside it. `pluginId` must be your own plugin's id: a link that names any other plugin is dropped, and the notification still shows with no click action. A click opens your plugin's panel and hands `path` to your plugin's `navigate` command; nothing happens when your plugin is not installed and enabled |
| `bypassFocusMode` | Show the notification even while the user has Focus Mode on. Use it only for something the user is waiting for |

## Example

```typescript
const omniscio = window.Omniscio ?? window.AgentMC

async function reportExport(done: boolean, fileName: string) {
  if (!done) {
    await omniscio.notifications.clear({ tag: 'export-finished' })
    return
  }
  await omniscio.notifications.fire({
    title: 'Export finished',
    body: `${fileName} is ready.`,
    tag: 'export-finished',
    category: 'task',
  })
}
```

## Notes

- A backend calls the same two methods as `ctx.notifications.fire` and `ctx.notifications.clear` (options type `PluginNotificationOptions`). The simpler [`ctx.toast.notify`](./toast) has no tag, no category, no click link and no `clear`.
- `fire` and `clear` resolve with no value, so there is nothing to read back from them.
- `@omniscio/plugin-sdk/browser` exports `BridgeNotifications` and `BridgeNotification`.
