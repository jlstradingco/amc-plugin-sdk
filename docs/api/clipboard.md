# Clipboard

Read and write the system clipboard from your plugin's panel.

**Availability:** Webview only (`Omniscio.clipboard`). There is no `ctx.clipboard`.
**Required Permission:** `system` for `readText`, `writeText`, `readImage` and `writeImage`. `has` needs no permission.

::: tip Why `has` is free
`has` answers only whether a format is present. It returns a boolean and never any clipboard content, so a plugin can decide whether to offer a "Paste" button without holding `system`.
:::

## Permissions

`system` is an elevated permission. Omniscio shows it to the user as "System: Run approved programs through this app's own launcher, read the clipboard, and open files" and marks it as elevated on the install card. The same permission also covers [Process](./process) and part of [Shell](./shell).

```json
{
  "permissions": ["system"]
}
```

A call that needs `system` is rejected when the plugin has not declared it.

## Methods

### `has(format?: BridgeClipboardFormat): Promise<boolean>`

Whether the clipboard holds this format. With no argument, whether it holds text or an image. **No permission required.**

---

### `readText(): Promise<string>`

The clipboard's current text. **Requires `system`.**

---

### `writeText(text: string): Promise<void>`

Replace the clipboard with this text, up to 1 MiB. **Requires `system`.**

---

### `readImage(): Promise<{ dataUrl: string } | null>`

The clipboard's image as a data URL, or `null` when there is none. **Requires `system`.**

---

### `writeImage(dataUrl: string): Promise<void>`

Replace the clipboard with an image given as a `data:image/...` URL, up to 10 MiB. Data that does not decode as an image leaves the clipboard unchanged. **Requires `system`.**

## Types

```typescript
type BridgeClipboardFormat = 'text' | 'image' | 'html' | 'rtf'
```

## Example

```typescript
const omniscio = window.Omniscio ?? window.AgentMC

pasteButton.disabled = !(await omniscio.clipboard.has('text'))

pasteButton.addEventListener('click', async () => {
  const text = await omniscio.clipboard.readText()
  editor.value += text
})

copyButton.addEventListener('click', async () => {
  try {
    await omniscio.clipboard.writeText(editor.value)
    omniscio.toast.show({ type: 'success', message: 'Copied' })
  } catch {
    omniscio.toast.show({ type: 'error', message: 'Could not copy. The text may be over 1 MiB.' })
  }
})
```

## Notes

- Webview only.
- `@omniscio/plugin-sdk/browser` exports `BridgeClipboard` and `BridgeClipboardFormat`.
