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
| `pinnedPrograms[].companions` | Optional: 1 to 10 entries of `{ path, sha256 }`, files the program needs beside it |

Omniscio copies a pinned program and its `companions` together into one folder your plugin cannot write, and checks every file against its pin on each run. The files in that group need different file names. The person's approval covers the exact set of files, so an update that changes a companion asks again. See [Companion files](../guide/manifest#companion-files).

The `command` you pass to `exec` or `spawn` is a bare name from one of these lists. You cannot choose the working directory; the host runs the program in the plugin's own folder, so pass absolute paths in `args`.

## Methods

### `exec(command: string, args: string[], options?: PluginWorkerProcessExecOptions): Promise<{ stdout: string; stderr: string; exitCode: number }>`

Run a program to completion and collect its output.

**Returns:** `Promise<{ stdout: string; stderr: string; exitCode: number }>`

A command that is not listed in your manifest is refused. The call rejects when the program runs longer than `options.timeout`.

With the default `encoding: 'utf8'`, `stdout` and `stderr` are text. Pass `encoding: 'base64'` for a program that prints binary data, such as an image: the two fields then hold the program's bytes as base64 text, unchanged. Output is capped at 5 MiB of raw bytes either way.

---

### `spawn(command: string, args: string[], options?: PluginWorkerProcessSpawnOptions): Promise<{ processId: string }>`

Start a program in the background. Follow it with `onOutput` and `onExit`.

**Returns:** `Promise<{ processId: string }>`

`encoding: 'base64'` makes every `onOutput` event carry its bytes as base64 text and say so in its `encoding` field. Pass `stdin: true` to keep the program's standard input open for `write` and `closeStdin`; without it the program has no input and `write` is refused.

---

### `kill(processId: string): Promise<void>`

Stop a program started with `spawn`.

---

### `write(processId: string, data: string, options?: PluginProcessWriteOptions): Promise<void>`

Send input to a program started with `spawn(..., { stdin: true })`. `data` is text by default; pass `encoding: 'base64'` to send bytes. One write carries at most 1 MiB of bytes. The call is refused when the program was not started with `stdin: true`, is no longer running, or has had its input closed.

Backend only: the webview `Omniscio.process` has no `write`.

---

### `closeStdin(processId: string): Promise<void>`

Close the standard input of a program started with `spawn(..., { stdin: true })`, which tells a program that reads until the end of its input that nothing more is coming.

Backend only: the webview `Omniscio.process` has no `closeStdin`.

---

### `onOutput(handler: (event: PluginWorkerProcessOutput) => void): () => void`

Subscribe to the output of programs this plugin started. Returns an unsubscribe function. When the program was started with `encoding: 'base64'`, `event.encoding` is `'base64'` and `event.text` holds base64 text.

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

type PluginProcessEncoding = 'utf8' | 'base64'

interface PluginWorkerProcessExecOptions extends PluginProcessExecOptions {
  encoding?: PluginProcessEncoding
}

interface PluginWorkerProcessSpawnOptions extends PluginProcessOptions {
  encoding?: PluginProcessEncoding
  stdin?: boolean
}

interface PluginWorkerProcessOutput extends PluginProcessOutput {
  encoding?: PluginProcessEncoding
}

interface PluginProcessWriteOptions {
  encoding?: PluginProcessEncoding
}

interface PluginProcessExit {
  processId: string
  exitCode: number
  signal?: string
}
```

On the webview the parameter is named `callback` instead of `handler`, and `exec`, `spawn` and `onOutput` use `PluginProcessExecOptions`, `PluginProcessOptions` and `PluginProcessOutput`, without `encoding` or `stdin`.

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
