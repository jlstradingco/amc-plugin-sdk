# Workspace

Read, write, and run test or build commands against the user's **real project checkouts and
worktrees** -- not your plugin's sandboxed data directory.

**Availability:** Backend only (`ctx.workspace`)
**Required Permission:** `workspace.read`, `workspace.write`, `workspace.exec`

::: danger Not implemented by the host yet
There is **no host-side `workspace` namespace**. Every method on this page currently rejects
at runtime with `Unknown namespace: "workspace"`, on every AMC build.

This page documents a capability the SDK types **ahead of** the host, so plugin authors can
write and package against it. Two things follow, and both matter:

- **`amc-plugin preflight` passing is not evidence the host supports this.** The CLI validates
  your manifest's *shape*. It cannot tell you whether the runtime exists.
- **The SDK's mocks refuse to fake it.** `createTestContext()` and the dev shell both reject on
  every `ctx.workspace.*` call, deliberately. A green plugin test against a working fake would
  be evidence of nothing -- this SDK has been burned by exactly that before, when `ctx.events`
  was mocked as a live event emitter while the production path was dead in both directions.

Track the host side before shipping anything that depends on it.
:::

## Why it is not `ctx.fs`

[`ctx.fs`](./fs) is hard-sandboxed to `<userData>/plugins/<id>/data` -- relative paths, text
only, five methods. It cannot see a user's project at all.

`ctx.workspace` is the opposite: it reaches into real checkouts, so every call is gated twice.
An **install-time permission** grants the capability; a **per-project runtime grant** the user
makes (and can revoke) grants the resource. Worktrees inherit their project's grant.

## The handle model

Three types carry every path in this API, and the shape is what makes escapes unrepresentable.

```typescript
type WorktreeRef = string | null            // absolute worktree ROOT path; null = main checkout
interface WorkspaceScope { projectId: string; worktree: WorktreeRef }
interface WorkspaceHandle extends WorkspaceScope { path: string }   // RELATIVE
```

**`path` is always relative.** The host joins it to the scope's root and re-checks the result,
so `../../etc/passwd` cannot be expressed as a valid handle -- and a symlink pointing out of
scope dies at the host's realpath check.

**A worktree is its absolute path**, with `null` meaning the main checkout. Worktrees have no
ID and no table in AMC, so the path *is* the identity. A forged or stale value fails the scope
check rather than resolving to something unexpected.

`resolve(absolutePath)` is the single door an absolute path enters by. It returns `null` when
the path is outside everything you can reach.

## Three things to know before you use it

None of these are visible in the type signatures.

**A list-valued variable expands to N arguments.** In `exec(scope, slot, vars)`, `vars` is
`Record<string, string | string[]>`. An array becomes N separate argv entries -- or **zero**
entries when it is empty. Values are never concatenated into a shell string, because there is
no shell.

**`execResults` is a cursor read, not a file read.** It returns whole JSONL records only, never
a partial line, and you call it repeatedly with the `cursor` it hands back. There is
deliberately no `execArtifact`: no end-of-run blob survives an interrupted run, so a
whole-artifact read is the wrong shape for output that must be legible mid-flight.

**There is no way to write a command binding.** `requestBinding()` opens the host's own modal
and carries **no command text** -- not at exec time, and not as a suggested default. The user
binds a base command per (project, package); the host appends your slot's manifest-static
arguments. This is what closes command injection by construction: there is no plugin-supplied
string for anything to inject into. Do not look for a setter; its absence is the feature.

## Command slots

Your manifest declares **named slots**, each with a static argument template. The user supplies
the base command. The host spawns `execFile` with `shell: false`.

```jsonc
{
  "permissions": ["workspace.read", "workspace.write", "workspace.exec"],
  "workspace": {
    "binding": { "granularity": "package" },
    "commandSlots": [
      { "name": "vitest.run",  "args": ["--config", "{reporterConfig}", "{files}"] },
      { "name": "jest.run",    "args": ["--reporters={reporter}", "--forceExit", "{files}"] },
      { "name": "generic.run", "args": [] }
    ]
  }
}
```

Because `args` is manifest-static, **every flag your plugin can ever pass is visible at
marketplace review**. A runtime `{args}` placeholder was rejected outright -- it would let a
plugin choose `--reporter=./evil.js` at runtime, invisible to an install-time audit.

`{reporter}` and `{reporterConfig}` are host-reserved and host-minted. So is `{outFile}`, which
**does not belong in `args` at all**: the results path travels to the child process as an
environment variable, so it never appears in argv. A plugin cannot name a write target.

An empty `args` array is legal -- `generic.run` above is exactly that.

## Methods

Grouped by the permission that gates them.

### Discovery

Available with any `workspace.*` permission -- without these you cannot construct your first
handle.

| Method | Returns |
|---|---|
| `listProjects()` | Projects you currently hold a grant for |
| `listWorktrees(projectId)` | Live, blocking worktree list -- not a cached snapshot |
| `requestAccess()` | Opens the host's grant picker; resolves with what you can now reach |
| `resolve(absolutePath)` | `WorkspaceHandle` or `null` when out of scope |

### `workspace.read`

| Method | Notes |
|---|---|
| `glob(scope, patterns, opts?)` | Returns `{ path, size, mtimeMs, isDir }` -- enumeration and the invalidation key in one round trip |
| `stat(handle)` | `WorkspaceEntry` or `null` |
| `exists(handle)` | |
| `readFile(handle)` | UTF-8 text |
| `readFiles(handles)` | Chunked host-side at 500 files / ~4.8 MB per call |
| `listBindings(scope)` | Read-only. **No setter exists.** |

The host owns the default excludes -- `.git`, `node_modules`, the project's own worktree roots,
and `.gitignore` applied as a walk. You can override them via `WorkspaceGlobOpts`.

### `workspace.write` (implies read)

```typescript
writeFile(handle, content, { expectedMtimeMs: number | null }): Promise<{ mtimeMs: number }>
deleteFile(handle, { expectedMtimeMs: number }): Promise<void>
```

**`expectedMtimeMs` is a required compare-and-swap token**, and `null` on `writeFile` means
*the file must not already exist*. It closes torn writes and lost updates together, and it
costs you nothing to obtain because `glob()` already returned it. Writes are atomic
temp-plus-rename, and `writeFile` creates parent directories.

### `workspace.exec`

```typescript
requestBinding(scope, packagePath): Promise<WorkspaceBindingResult>   // carries NO command text
exec(scope, slot, vars?): Promise<{ jobId: string }>
execStatus(jobId, { since? }): Promise<WorkspaceExecStatus>
execResults(jobId, { since? }): Promise<WorkspaceExecResults>
execCancel(jobId): Promise<void>
```

Runs are **jobs, not blocking calls** -- forced, not chosen. The plugin worker rejects any RPC
past four minutes, and a full test suite can run for hours.

There is **no wall-clock cap**; an idle timeout is used instead, because a wall-clock limit
kills a legitimately slow suite at the same threshold as a deadlocked one. Output is
disk-buffered with head and tail retained when the cap is hit (`truncated` tells you). At most
**one job per (project, worktree)** may run at a time.

## Reading a run while it is in flight

The governing rule is **durable read for correctness, push for liveness**.

Poll `execStatus` / `execResults` with the cursor you were last given -- the disk buffer is
authoritative. Events are only a hint that there is more to read; the event bus has no replay
and no delivery guarantee, so nothing may depend on it for correctness.

::: warning The `host.*` event channels
The only host-to-plugin broadcast channel that exists today is **`host.activeProjectChanged`**,
and the host's allowlist is closed -- it refuses and logs anything else.

Channels named in the capability's design notes for run output and session turns
(`host.runChunk`, `host.sessionOutput`) are **planned, not implemented**. There is no
`runChunk` anywhere in the host source. Poll the cursor; do not wait for a push that never
arrives.
:::

## v1 is text only

UTF-8 text, throughout. An `encoding` option is reserved on `readFile` and `writeFile` so
binary support can be added without a breaking change, but it does nothing today.

`WorktreeStatus` mirrors the host's union verbatim: `'active' | 'merging' | 'merged' |
'cleanup' | 'conflict' | 'failed'`. Note **`'cleanup'` has zero assignment sites** in the host
-- it is carried for parity, and you should never expect to see it.

## Types

Every type on this page is importable by name from the package root:

```typescript
import type {
  WorkspaceApi, WorkspaceScope, WorkspaceHandle, WorkspaceEntry,
  WorkspaceGlobOpts, WorkspaceExecStatus, WorkspaceExecResults,
  WorkspaceBinding, WorkspaceBindingResult, WorkspaceCheckout,
  WorktreeRef, WorktreeInfo, WorktreeStatus,
} from '@agent-mc/plugin-sdk'
```

## Permissions

| Permission | Grants |
|---|---|
| `workspace.read` | Discovery, `glob`, `stat`, `exists`, `readFile`, `readFiles`, `listBindings` |
| `workspace.write` | The read set, plus `writeFile` and `deleteFile` |
| `workspace.exec` | `requestBinding`, `exec`, `execStatus`, `execResults`, `execCancel` |

`workspace.write` implies `workspace.read`. Each is also gated per project by the runtime grant
described at the top of this page.
