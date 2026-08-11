# Toast

Display in-app toast messages and OS-level desktop notifications.

**Availability:** Both (backend `ctx.toast` / frontend `AgentMC.toast`)
**Required Permission:** `notifications` (for `notify()` only)

## Methods

### `show(opts: { message: string; type?: 'info' | 'success' | 'warning' | 'error'; durationMs?: number }): void`

Display an in-app toast message. These appear briefly in AMC's toast area and dismiss automatically.

**No permission required.**

**Parameters:**

| Name | Type | Description |
|---|---|---|
| `opts.type` | `'info' \| 'success' \| 'warning' \| 'error'` | Optional toast style. `'warning'` was missing from this SDK until 2026-08-11 |
| `opts.durationMs` | `number` | Optional, up to 60000 |
| `opts.message` | `string` | The message to display |

**Returns:** `void`

**Example:**

```typescript
// Frontend
AgentMC.toast.show({ type: 'success', message: 'Task completed' })
AgentMC.toast.show({ type: 'error', message: 'Failed to sync data' })
AgentMC.toast.show({ type: 'info', message: 'Scan in progress...' })

// Backend
ctx.toast.show({ type: 'success', message: 'Report generated' })
ctx.toast.show({ type: 'error', message: 'Connection lost' })
```

---

### `notify(opts: { title: string; body?: string }): void`

Send an OS-level desktop notification (system tray notification). These appear outside AMC's window and can reach the user even when AMC is minimized.

**Requires the `notifications` permission.**

**Parameters:**

| Name | Type | Description |
|---|---|---|
| `opts.title` | `string` | Notification title |
| `opts.body` | `string` | Notification body text |

**Returns:** `void`

**Example:**

```typescript
// Frontend
AgentMC.toast.notify({
  title: 'Build Complete',
  body: 'Your project has been built successfully.',
})

// Backend
ctx.toast.notify({
  title: 'Scan Finished',
  body: 'Found 3 vulnerabilities in your dependencies.',
})
```

## Notes

- `show()` does not require any permission and is available to all plugins. Use it for routine feedback (success confirmations, transient errors, progress updates).
- `notify()` requires the `notifications` permission declared in `manifest.json`. Use it sparingly for important events the user needs to see even when AMC is not focused.
- Toast messages from `show()` auto-dismiss after a few seconds. The user does not need to interact with them.
- OS notifications from `notify()` follow the operating system's notification behavior (sound, banner, action center, etc.).
