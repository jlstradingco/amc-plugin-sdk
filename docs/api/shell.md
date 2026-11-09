# Shell

Open web links and files, and show the system's own file pickers and message box.

**Availability:** Webview only (`Omniscio.shell`). There is no `ctx.shell`.
**Required Permission:** None for `openExternal` (web links), `showOpenDialog`, `showSaveDialog` and `showMessageBox`. `system` for `openPath`, for `showItemInFolder`, and for `openExternal` with a scheme other than `http` or `https`.

::: tip The dialog is the consent
The open and save dialogs are the system's own. The user sees them and chooses the path themselves, so they need no permission. The path the user picks becomes usable by your plugin, and nothing else does.
:::

## Permissions

`system` is an elevated permission. Omniscio shows it to the user as "System: Run approved programs through this app's own launcher, read the clipboard, and open files" and marks it as elevated on the install card. Declare it only if you call `openPath` or `showItemInFolder`.

```json
{
  "permissions": ["system"]
}
```

## Methods

### `openExternal(url: string): Promise<{ opened: true }>`

Open a link in the default browser. **No permission required** for `http` and `https` links. Other schemes need `system`, and `file:` links are always refused.

---

### `openPath(path: string): Promise<{ opened: true }>`

Open a file or folder with the system's default program. **Requires `system`.**

The path must be inside a folder the user picked with `showOpenDialog`, `showSaveDialog` or `Omniscio.export.pickFolder`.

---

### `showItemInFolder(path: string): Promise<void>`

Show a file in the system file manager. **Requires `system`.** The same folder rule as `openPath` applies.

---

### `showOpenDialog(opts?: BridgeOpenDialogOptions): Promise<BridgeOpenDialogResult>`

Let the user choose files or folders. The chosen paths become usable by this plugin. **No permission required.**

---

### `showSaveDialog(opts?: BridgeSaveDialogOptions): Promise<BridgeSaveDialogResult>`

Let the user choose where to save a file. Only that exact file becomes usable by this plugin. **No permission required.**

---

### `showMessageBox(opts: BridgeMessageBoxOptions): Promise<{ buttonIndex: number }>`

Show a message box. Resolves the zero-based index of the button the user pressed. **No permission required.**

## Types

```typescript
interface BridgeDialogFilter {
  name: string
  /** Extensions without the dot. */
  extensions: string[]
}

interface BridgeOpenDialogOptions {
  title?: string
  filters?: BridgeDialogFilter[]
  /** Allow choosing several items. */
  multiple?: boolean
  /** Choose a folder instead of a file. */
  directory?: boolean
}

interface BridgeOpenDialogResult {
  /** The chosen paths; empty when cancelled. */
  paths: string[]
  cancelled: boolean
}

interface BridgeSaveDialogOptions {
  title?: string
  defaultPath?: string
  filters?: BridgeDialogFilter[]
}

interface BridgeSaveDialogResult {
  /** The chosen file path; absent when cancelled. */
  path?: string
  cancelled: boolean
}

interface BridgeMessageBoxOptions {
  title: string
  message: string
  /** Defaults to `'none'`. */
  type?: 'none' | 'info' | 'warning' | 'error' | 'question'
  /** Up to 10 button labels. Defaults to a single `OK`. */
  buttons?: string[]
}
```

## Example

```typescript
const omniscio = window.Omniscio ?? window.AgentMC

async function exportAndReveal(text: string) {
  const choice = await omniscio.shell.showSaveDialog({
    title: 'Save report',
    defaultPath: 'report.txt',
    filters: [{ name: 'Text', extensions: ['txt'] }],
  })
  if (choice.cancelled || !choice.path) return

  // ... write the file to choice.path ...

  const { buttonIndex } = await omniscio.shell.showMessageBox({
    title: 'Report saved',
    message: 'Show the file in its folder?',
    type: 'question',
    buttons: ['Show', 'Not now'],
  })
  if (buttonIndex === 0) {
    await omniscio.shell.showItemInFolder(choice.path)
  }
}

helpLink.addEventListener('click', () => omniscio.shell.openExternal('https://example.com/help'))
```

## Notes

- Webview only.
- `@omniscio/plugin-sdk/browser` exports `BridgeShell` and the dialog types above.
- To open a link or document from a backend, use [Launch](./launch).
