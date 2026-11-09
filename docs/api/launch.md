# Launch

Open a link or a document, or run a program that the user confirms.

**Availability:** Backend only (`ctx.launch`). There is no webview counterpart.
**Required Permission:** `launch`

::: warning Elevated permission
`launch` is an elevated permission. Omniscio shows it to the user as "Launch: Open links and files, and run programs you confirm" and marks it as elevated on the install card. Holding another permission, such as `system`, does not grant it.
:::

Your plugin never starts anything itself. It asks, and Omniscio decides. For anything that runs code, the user is asked to confirm first and the plugin cannot answer for them.

`ctx.launch` is optional on `PluginContext`, so check it before use.

## Permissions

```json
{
  "permissions": ["launch"]
}
```

## Methods

### `open(request: PluginLaunchRequest): Promise<PluginLaunchResult>`

Open or run the target named by `request`.

**Returns:** `Promise<PluginLaunchResult>`. A refusal or a cancelled confirmation is `ok: false` with a plain-language `error`; it is never a thrown error. Always check `ok`.

## Types

```typescript
interface PluginLaunchRequest {
  kind: 'url' | 'path' | 'exe' | 'cmd'
  value: string
}

interface PluginLaunchResult {
  ok: boolean
  /** A plain-language reason, present when `ok` is `false`. */
  error?: string
}
```

## The four kinds

| `kind` | What it does | Does the user confirm? |
|---|---|---|
| `url` | Opens an `http://` or `https://` link in the default browser. Any other scheme is refused | No |
| `path` | Opens a document or folder with the system's default program | Only for a file type Omniscio does not recognise as a plain document |
| `exe` | Runs a program file | Always |
| `cmd` | Runs a command | Always |

### `path` rules

- Network paths (such as `\\server\share\file`) are refused.
- Program and script files are refused with a message pointing you to `kind: 'exe'`. This includes Windows programs and scripts and interpreted scripts such as `.py`, `.sh` and `.rb`, as well as trailing-dot and trailing-space variants of those names.
- A known document type or a folder opens straight away. A file type outside Omniscio's list of known document types asks the user to confirm first.

### `exe` and `cmd` rules

- Every launch asks the user to confirm. There is no option to skip or remember the answer, and a cancelled confirmation runs nothing.
- When no window is available to show the confirmation, the launch is refused instead of run.
- `exe` checks that the file exists before asking.
- A launched program does not inherit Omniscio's own sign-in credentials.

## Example

```typescript
import type { PluginContext } from '@omniscio/plugin-sdk'

export async function activate(ctx: PluginContext) {
  async function openReport(url: string) {
    if (!ctx.launch) return
    const result = await ctx.launch.open({ kind: 'url', value: url })
    if (!result.ok) {
      ctx.toast.show({ type: 'error', message: result.error ?? 'Could not open the link.' })
    }
  }

  async function runTool(exePath: string) {
    if (!ctx.launch) return
    const result = await ctx.launch.open({ kind: 'exe', value: exePath })
    if (!result.ok) {
      ctx.log.info(`Launch not done: ${result.error ?? 'declined'}`)
    }
  }

  return {}
}
```

## Notes

- Backend only. From a webview you can open web links with [`Omniscio.shell.openExternal`](./shell).
- To run a fixed, listed program and read its output, use [Process](./process) instead.
