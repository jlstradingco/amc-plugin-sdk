# Process

Run a program that your manifest lists, either to completion or in the background, and read what it prints.

**Availability:** Both (backend `ctx.process` / webview `Omniscio.process`)
**Required Permission:** `system`, plus a `process` block in `manifest.json` that lists the programs

::: warning Elevated permission, and a closed list
`system` is an elevated permission. Omniscio shows it to the user as "System: Run approved programs through this app's own launcher, read the clipboard, and open files" and marks it as elevated on the install card. On top of that, any command that is not named in your manifest is refused.
:::

A plugin's backend cannot start programs by itself: Node's `child_process` is refused in the worker. Ask Omniscio to run the program through `ctx.process`, which checks the command first. For commands that act on a project the user granted, use [`ctx.workspace.exec`](./workspace) instead.

## Permissions and manifest

Declare `system` and list the programs in `process.allowedCommands` or `process.pinnedPrograms`.

```json
{
  "permissions": ["system"],
  "process": {
    "allowedCommands": ["git", "node"],
    "pinnedPrograms": [
      {
        "name": "mytool",
        "path": "bin/mytool.exe",
        "sha256": "0000000000000000000000000000000000000000000000000000000000000000",
        "folder": "install",
        "platform": "win32"
      }
    ]
  }
}
```

| Field | Rules |
|---|---|
| `process.allowedCommands` | 1 to 20 names. Each is 1 to 100 characters of letters, digits and `. _ + -` |
| `process.pinnedPrograms` | 1 to 10 entries |
| `pinnedPrograms[].name` | 1 to 100 characters of letters, digits and `. _ + -` |
| `pinnedPrograms[].path` | A path to the program |
| `pinnedPrograms[].sha256` | 64 lowercase hexadecimal characters |
| `pinnedPrograms[].folder` | Optional: `'data'` or `'install'` |
| `pinnedPrograms[].platform` | Optional: `'win32'`, `'darwin'` or `'linux'` |

The `command` you pass to `exec` or `spawn` is a bare name from one of these lists. You cannot choose the working directory; the host runs the program in the plugin's own folder, so pass absolute paths in `args`.

## Methods

### `exec(command: string, args: string[], options?: PluginProcessExecOptions): Promise<{ stdout: string; stderr: string; exitCode: number }>`

Run a program to completion and collect its output.

**Returns:** `Promise<{ stdout: string; stderr: string; exitCode: number }>`

A command that is not listed in your manifest is refused. The call rejects when the program runs longer than `options.timeout`.

---

### `spawn(command: string, args: string[], options?: PluginProcessOptions): Promise<{ processId: string }>`

Start a program in the background. Follow it with `onOutput` and `onExit`.

**Returns:** `Promise<{ processId: string }>`

---

### `kill(processId: string): Promise<void>`

Stop a program started with `spawn`.

---

### `onOutput(handler: (event: PluginProcessOutput) => void): () => void`

Subscribe to the output of programs this plugin started. Returns an unsubscribe function.

On the webview, events are delivered to the plugin's overlay window only.

---

### `onExit(handler: (event: PluginProcessExit) => void): () => void`

Subscribe to the exit of programs this plugin started. Returns an unsubscribe function.

On the webview, events are delivered to the plugin's overlay window only.

## Types

```typescript
interface PluginProcessOptions {
  env?: Record<string, string>
}

interface PluginProcessExecOptions extends PluginProcessOptions {
  timeout?: number
  maxBuffer?: number
}

interface PluginProcessOutput {
  processId: string
  stream: 'stdout' | 'stderr'
  text: string
}

interface PluginProcessExit {
  processId: string
  exitCode: number
  signal?: string
}
```

On the webview the parameter is named `callback` instead of `handler`; the types are the same.

## Example

```typescript
import type { PluginContext } from '@omniscio/plugin-sdk'

export async function activate(ctx: PluginContext) {
  try {
    const { stdout, exitCode } = await ctx.process.exec('git', ['--version'], { timeout: 10000 })
    if (exitCode === 0) ctx.log.info(stdout.trim())
  } catch {
    ctx.log.warn('git is not available to this plugin')
  }

  const { processId } = await ctx.process.spawn('node', ['C:/tools/watch.js'])

  const stopOutput = ctx.process.onOutput((event) => {
    if (event.processId === processId && event.stream === 'stderr') ctx.log.warn(event.text)
  })
  const stopExit = ctx.process.onExit((event) => {
    if (event.processId !== processId) return
    ctx.log.info(`watch.js exited with ${event.exitCode}`)
    stopOutput()
    stopExit()
  })

  return {
    onDisable() {
      return ctx.process.kill(processId)
    },
  }
}
```

## Notes

- `@omniscio/plugin-sdk/browser` exports `BridgeProcess`. `PluginProcess` and its option and event types come from `@omniscio/plugin-sdk`.
- To open a link or document, or to run a program the user confirms case by case, use [Launch](./launch).
