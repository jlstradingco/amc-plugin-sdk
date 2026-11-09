# CLI Reference

The `omniscio-plugin` CLI is a Commander.js-based tool for building, validating, packaging, and publishing Omniscio plugins.

## Install

```bash
npm install -g @omniscio/plugin-cli
```

---

## Commands

### `create`

Scaffold a new plugin project with starter files, manifest, and optional git init.

**Usage:**

```bash
omniscio-plugin create <name> [options]
```

**Arguments:**

| Name | Description |
|---|---|
| `name` | Plugin name in kebab-case (e.g. `my-plugin`) |

**Options:**

| Flag | Description | Default |
|---|---|---|
| `-t, --template <template>` | Template variant: `basic`, `with-backend`, `full`, `webview` (flat JS, no build step), `widget` (a `webview` plugin with a titlebar widget and its popover page) | `basic` |
| `--display-name <name>` | Display name (skips interactive prompt) | &mdash; |
| `--description <desc>` | Plugin description | &mdash; |
| `--author <author>` | Plugin author | &mdash; |
| `--category <category>` | Category: `planning`, `development`, `testing`, `devops`, `productivity`, `other` | `other` |
| `--tags <tags>` | Comma-separated discoverability tags (≤10, ≤30 chars each). Blank falls back to the category | category |
| `--icon <icon>` | Path to your logo inside the package, or a Lucide icon name for a generic glyph. A placeholder SVG is written at the default path for you to replace | `assets/icon.svg` |
| `--skip-install` | Skip `npm install` after scaffolding | `false` |
| `--skip-git` | Skip `git init` and initial commit | `false` |

**Example:**

```bash
# Interactive mode
omniscio-plugin create my-plugin

# Non-interactive (CI-friendly)
omniscio-plugin create my-plugin \
  --template with-backend \
  --display-name "My Plugin" \
  --description "Does cool things" \
  --author "Jane Doe" \
  --tags "linter, security" \
  --skip-git
```

**Exit codes:** `0` success, `1` error (invalid name, template, or cancelled prompt).

---

### `build`

Compile TypeScript, copy non-TS UI files to `dist/`, bundle each panel script, and scan for banned imports.

**Usage:**

```bash
omniscio-plugin build
```

**Options:** None.

**What it does:**

1. Validates `manifest.json` against the SDK schema.
2. Runs `tsc` to compile TypeScript to `dist/`.
3. Copies non-TS files from `src/ui/` to `dist/ui/` (HTML, CSS, images).
4. Bundles each panel script. For every `<script src="X.js">` in a page under `dist/ui/` (not `type="module"`, and loaded from the plugin itself), it takes the matching source in `src/ui/` (`X.ts`, `.tsx`, `.js`, `.jsx` or `.mjs`) and writes one self-contained script to `dist/ui/X.js`, with every import inlined. A script that already loads as a plain script (a vendored library, for example) ships exactly as it is. `tsc` alone leaves `export {};` at the end of the file, and a page that loads it as a plain script stops on its first line with a blank panel. Bundling also means you can split your UI across files and import npm packages. Type-only imports from `@omniscio/plugin-sdk` disappear in the bundle; the host provides `window.Omniscio` at runtime.
5. Scans `dist/` for banned imports (`electron`, `better-sqlite3`, `worker_threads`, `child_process` — the last two in both their bare and `node:`-prefixed spellings) and **warns** on a hit. `validate` runs the same scan and fails instead.

**Example:**

```bash
cd my-plugin
omniscio-plugin build
```

**Exit codes:** `0` success, `1` manifest invalid, TypeScript compilation failed, or a panel script import could not be resolved.

`dev`, `install`, `package` (when `dist/` is missing) and the dev shell's hot reload all build the same way.

---

### `validate`

Run all validation checks without building. CI-friendly -- returns a non-zero exit code on any failure.

**Usage:**

```bash
omniscio-plugin validate
```

**Options:** None.

**Checks performed:**

| Check | Description |
|---|---|
| Manifest schema | Validates `manifest.json` against the SDK schema |
| Command tables | Fails on a table that can hold a runnable command; warns on fuzzier shapes — see [Command tables](#command-tables) |
| SDK version | Ensures `sdkVersion` field is present |
| UI entry point | Verifies the declared UI entry file exists (see [Entry points before a build](#entry-points-before-a-build)) |
| Widget entry point | Verifies the file declared as `ui.widget.entryPoint` exists (only when declared) |
| Backend entry point | Verifies the declared backend entry file exists |
| TypeScript | Runs `tsc --noEmit` to check for type errors |
| Banned imports | Scans `dist/` for disallowed Node/Electron imports — see below |

**Entry points before a build.** Each entry point is checked at the path the manifest declares, and the pass line names it (`✓ UI entry point exists (dist/ui/index.html)`). When there is no `dist/` folder yet, `validate` checks the source the build would compile instead (`src/ui/index.html`, or `src/backend/index.ts` for `dist/backend/index.js`) and prints a warning saying so; the exit code stays 0, because `package` builds a missing `dist/` first. When `dist/` exists but lacks the declared file, `validate` fails: your build is out of date, and `package` would ship that `dist/` as it is. Run `amc-plugin build` and validate again.

**Banned imports, in detail.** The scan reads every `.js`, `.mjs` and `.cjs` file under `dist/` (for a flat plugin: the entry folders and single entry files you ship as authored) and rejects
`electron`, `better-sqlite3`, `worker_threads` and `child_process`, matching all four
forms a plugin can emit (`require('x')`, `import … from 'x'`, side-effect `import 'x'`,
and dynamic `import('x')`), for both the bare and `node:`-prefixed spellings of the two
Node builtins. Only the module name inside the quotes is matched, so a package that
merely starts with a banned name — `electron-store`, `child_process-promise` — is not
flagged.

Because the scan walks all of `dist/`, it also sees any dependency you vendor in there.
`child_process` in particular is common in third-party code, so if you bundle
dependencies into `dist/` rather than declaring them, expect the scan to find them. That
is working as intended: whatever ships in `dist/` runs under Node's `--permission`, which
denies spawning a process regardless of which file asked.

**Where the scan looks — and its one limit.** It reads your project on disk (`dist/`, or a
flat plugin's as-authored entry dirs), not the `.amcplugin` archive itself. `build`,
`validate` and `publish`'s preflight all resolve that location the same way, so they never
disagree about what "the shipped files" means. The limit: if you build an archive and then
delete the output it was made from, there is nothing left to inspect — which is exactly
why that case warns instead of passing. Treat this as a guardrail against accident, not a
sandbox; the runtime boundary is the worker itself, which cannot reach these modules no
matter what passes the scan.

**Example:**

```bash
# In a GitHub Actions workflow
omniscio-plugin validate
```

**Exit codes:** `0` all checks passed, `1` one or more checks failed.

#### Command tables

A plugin's backend must act only on commands from its own panel or its own code, never on a table
row: AI agents on the person's computer can read every table, and on older Omniscio builds write
them too (see [Panel commands](../guide/commands)). So `validate`, `preflight` and `publish` all run
one rule over the tables your manifest declares. It reads only `manifest.json`, so the three always
agree. It is the same `checkCommandTables` function the SDK exports.

Column names are read by their words: `payloadJson`, `payload_json` and `payload-json` all read as
"payload", and a trailing `json` / `text` / `raw` word is ignored.

| Result | When |
|---|---|
| **Fails** | A table has an **instruction** column (any word `type`, `command`, `cmd`, `action`, `op`, `operation`, `kind`, `method`, `verb`), an **argument** column (last word `payload`, `args`, `arguments`, `params`, `parameters`, `input`, `inputs`, `body`, `data`, `prompt`) and a **status** column (last word `status` or `state`) |
| **Warns** | A prompt-like column (last word `prompt`, `instruction(s)`, `script`) with a status; a queue-like table name (`queue`, `job(s)`, `command(s)`, `action(s)`, `outbox`…) with a status and an instruction or argument column; a table that is `agentWritable` and has a status |
| **Warns** (`validate` only) | Shipped JS that asks a table for its `pending` or `queued` rows (`.query(…, { where: { status: 'pending' } })`, also when the column has a longer name such as `summary_status` or `jobState`) |
| **Passes with a notice** | A failing table that carries a written `commandTableWaiver` (20–500 characters) and is not `agentWritable` |

**How to fix a failure:** move the commands onto the [command channel](../guide/commands) and
reduce the table to a job list (`label`, `status`, `error`, times), or — if the table is genuinely
safe — add a `commandTableWaiver` explaining why. Marketplace review sees the waiver.

**What it cannot catch.** It is a second line of defence, not a proof:

- an instruction without an instruction column (a `prompt` + `status` table only warns);
- programs stored as data (a workflow graph in a row), or a re-armable status over plain data;
- authority fields (an approval flag, a spending cap, a host that receives secrets);
- a JSON blob hiding the shape, or table names built at run time;
- anyone who skips it: `publish --skip-preflight`, a CLI older than 3.2.0, or a raw upload.

The plugin-table fence in Omniscio (`agentWritable`) and the command channel are the real
protection; this check stops the classic mistake from shipping by accident.

---

### `package`

Bundle the plugin into a `.amcplugin` archive (zip) for distribution or marketplace upload.

**Usage:**

```bash
omniscio-plugin package
```

**Options:** None.

**What it does:**

1. Validates `manifest.json`.
2. Builds if `dist/` does not exist.
3. Checks that every page script loads ([Panel scripts](#panel-scripts)) and stops before writing the archive if one would not.
4. Creates `<plugin-id>-<version>.amcplugin` in the project root.
5. Includes `manifest.json`, `dist/`, `assets/` (if present) and the root `README.md` (if present — the marketplace renders it as the listing's long description; CLI 3.1 and later).
6. Warns if the archive exceeds the 50 MB marketplace limit.

**Example:**

```bash
omniscio-plugin package
# Packaged: my-plugin-1.0.0.amcplugin (0.12 MB)
```

**Exit codes:** `0` success, `1` manifest invalid, build failed, or a page script would not load.

---

### `preflight`

Run publish-readiness checks **without uploading**. This is the same gate `publish` runs before an upload, exposed as a standalone dry-run so you can fix issues first.

**Usage:**

```bash
omniscio-plugin preflight [options]
```

**Options:**

| Flag | Description | Default |
|---|---|---|
| `--changelog <text>` | Changelog for this version (checked for presence) | &mdash; |
| `--package <path>` | The `.amcplugin` to check; required when the folder holds more than one ([how a package is chosen](#choosing-the-package)) | the only package in the folder |

**Checks performed:**

| Check | Fails when | Warns when |
|---|---|---|
| Version | Manifest version is already published (marketplace versions are **immutable**) or older than the latest published version | &mdash; |
| Changelog | &mdash; | No changelog provided |
| Permissions | An unknown permission is declared | Duplicate permissions |
| Command tables | A table can hold a runnable command ([the rule](#command-tables)) and carries no valid waiver | A fuzzier command-like shape |
| Banned imports | The shipped files import a banned module ([details](#validate)) | There is no built output to scan |
| Panel scripts | A page in the archive loads a script that is missing from the archive, or that fails to load as the page declares it ([details](#panel-scripts)) | &mdash; |
| Package | The folder holds more than one `.amcplugin` and no `--package` was given, or the chosen archive is not named `<id>-<version>.amcplugin` for the manifest version, or its own `manifest.json` says another version or a `-test.N` label | &mdash; |
| Package size | Archive exceeds the 50 MB marketplace limit | Archive exceeds 25 MB |
| Listing | &mdash; | No `README.md` at the plugin root, an absent or empty `plugin.screenshots`, or an absent or empty `plugin.links` — the marketplace detail page would be bare (see [Publishing → What your listing shows](../guide/publishing.md#what-your-listing-shows)) |

If the marketplace registry is unreachable, the version check is skipped rather than blocking.

#### Panel scripts

A page's `<script src="plugin.js">` without `type="module"` is a plain script. A plain script cannot contain `import` or `export`, and if it does, the browser stops at that line and the panel stays blank. This check reads each HTML page, finds every plain script loaded from the plugin itself, and parses that file the way the page will load it. Module scripts and scripts from a URL are skipped.

When a `.amcplugin` is chosen, the check reads the pages and scripts **inside the archive**, so an archive made before a fix is caught even after you rebuild `dist/`. `package` runs the same check on the folder before it writes the archive.

The fix depends on the plugin type:

- **TypeScript plugin:** run `omniscio-plugin build`, which bundles each page script, then `omniscio-plugin package` to rebuild the archive.
- **Plain-JS (webview) plugin:** files ship as written, so remove the `import`/`export` from the script, or load it with `<script type="module">`.

::: tip Why the banned-import check appears twice
`validate` is a check you choose to run; this is the one standing between a banned import
and the marketplace. Both use the same rule and look in the same place, so a plugin that
passes `validate` passes here.

"No built output to scan" **warns rather than fails** — with nothing inspected, zero hits
proves nothing, and reporting a pass would be a false all-clear. Run `omniscio-plugin build`
first so the files you are about to upload are the ones that get checked.
:::

**Example:**

```bash
omniscio-plugin preflight --changelog "Added dark mode support"
# ✓ Version: 1.1.0 is newer than the published 1.0.0
# ⚠ Permissions: Duplicate permission(s): storage
#   → Remove the duplicate entries from manifest.json permissions.
# ⚠ Listing: Listing will be bare — missing: screenshots (plugin.screenshots), support links (plugin.links)
#   → Add a README.md next to manifest.json, hosted http(s) image URLs under plugin.screenshots, and support/homepage URLs under plugin.links — the marketplace detail page renders all three.
# ✓ Package size: 0.12 MB
```

**Exit codes:** `0` all checks passed (warnings allowed), `1` one or more checks failed.

---

### `login`

Sign in to the Omniscio Marketplace with GitHub and store the credential every other command reuses.

**Usage:**

```bash
omniscio-plugin login
```

**Options:** None.

**What it does:**

1. Reuses a stored credential that is still valid, renews an expired one silently from its refresh token, and otherwise opens GitHub sign-in in your browser.
2. Saves the credential to `~/.amc/marketplace-token` — the file `publish`, `status` and `whoami` all read.
3. Reports the account you are signed in as, and where the credential lives.

Run it when you need the credential without publishing: a release build of Omniscio has no marketplace sign-in of its own, so its **My Plugins** tab borrows this file. Run it again while signed in and it reports the stored account instead of reopening the browser; to sign in as someone else, see **The GitHub account trap** under [`publish`](#publish).

::: tip Older CLIs
A CLI released before this command still creates the same credential — `omniscio-plugin publish` signs you in on first use.
:::

**Example:**

```bash
omniscio-plugin login
# Signed in as: janedoe (uid: abc123)
# Credential saved to /home/you/.amc/marketplace-token
```

**Exit codes:** `0` signed in, `1` the sign-in did not complete or the credential could not be saved (the message names the file).

---

### `publish`

Upload a `.amcplugin` archive to the Omniscio Marketplace for review. Authenticates via GitHub OAuth on first use; run [`login`](#login) to sign in ahead of time.

**Usage:**

```bash
omniscio-plugin publish [options]
```

**Options:**

| Flag | Description | Default |
|---|---|---|
| `--changelog <text>` | Changelog text for this version | &mdash; |
| `--watch` | Poll until the submission is approved or rejected (up to 3 hours) | `false` |
| `--skip-preflight` | Skip the pre-upload readiness checks | `false` |
| `--package <path>` | The `.amcplugin` to upload; required when the folder holds more than one | the only package in the folder |
| `--as <github-user>` | Assert the expected GitHub account; aborts before upload on mismatch | &mdash; |
| `--switch-account` | Sign out first and re-authenticate as a different account | `false` |
| `-y, --yes` | Skip the upload-identity confirmation prompt (for CI) | `false` |

**What it does:**

1. Chooses the package to upload ([how](#choosing-the-package)); refuses before anything is sent if it cannot pick exactly one right one.
2. Checks for a stored auth token; prompts GitHub OAuth if missing.
3. **Confirms the uploading identity** before upload (see the account trap below).
4. Runs [`preflight`](#preflight) readiness checks (unless `--skip-preflight`); aborts on any failure.
5. Uploads the archive to the marketplace.
6. With `--watch`, polls every 30 seconds for the review decision.

::: warning The GitHub account trap
GitHub sign-in reuses whatever account your **default browser** is already logged
into — there is no account chooser, so a publish can silently go out under the
**wrong** identity (marketplace ownership is tied to the GitHub account).

Before uploading, `publish` shows `Uploading as: <github>` and asks you to confirm.
If it's the wrong account:

- Run `omniscio-plugin publish --switch-account` to sign out and re-authenticate, **or**
- Use `--as <github-user>` in scripts to hard-assert the intended account (aborts on mismatch).

To land on the right account during sign-in, open an incognito / private window
signed into the correct GitHub account first, or sign out at
`https://github.com/logout`.
:::

#### Choosing the package

`publish` and `preflight` never pick "the first `.amcplugin` they find". They look in the plugin folder and in `dist/`, and:

- **No package at all:** `omniscio-plugin package` runs first, then the result is checked like any other.
- **More than one package, no `--package`:** refused. The message lists every file; name the one to upload with `--package <path>`.
- **Exactly one package, or the one named by `--package`:** it must be called `<plugin id>-<manifest version>.amcplugin`, and the `manifest.json` inside it must carry that same version. Anything else is refused.
- **A `-test.N` label** in `manifest.json`, in the file name or in the version inside the archive is refused. Store releases carry a plain version, so a test build is never uploaded by accident.

::: tip Older CLIs
A CLI released before this check still uploads the first `.amcplugin` it finds. Before every publish, `ls *.amcplugin` in the plugin folder and make sure there is exactly one, named for the store version.
:::

**Example:**

```bash
# Interactive — confirms "Uploading as: <you>" before upload
omniscio-plugin publish --changelog "Added dark mode support" --watch

# Publish under a specific account, re-authenticating if needed
omniscio-plugin publish --switch-account

# CI — assert the account and skip the prompt
omniscio-plugin publish --as my-org-bot --yes

# The folder holds more than one package — name the one to upload
omniscio-plugin publish --package releases/my-plugin-1.3.2.amcplugin
```

**Exit codes:** `0` success (or approved with `--watch`), `1` package refused, preflight failed, upload failed, rejected, or `--as` mismatch.

---

### `status`

Show the marketplace submission status for the current plugin.

**Usage:**

```bash
omniscio-plugin status
```

**Options:** None.

**What it does:**

Reads `manifest.json` to determine the plugin ID, then queries the marketplace for all submissions matching that ID. Displays status, version, and review feedback.

**Example:**

```bash
omniscio-plugin status
# Submissions for "my-plugin":
#   [OK] my-plugin v1.0.0 — approved (5/15/2026)
#   [?]  my-plugin v1.1.0 — pending (5/17/2026)
```

**Exit codes:** `0` success, `1` auth failed.

---

### `whoami`

Show the authenticated GitHub username.

**Usage:**

```bash
omniscio-plugin whoami
```

**Options:** None.

**Example:**

```bash
omniscio-plugin whoami
# Signed in as: janedoe (uid: abc123)

omniscio-plugin whoami
# Not signed in. Run `omniscio-plugin login` to sign in.
```

**Exit codes:** `0` always.

---

### `logout`

Clear the stored marketplace authentication token.

**Usage:**

```bash
omniscio-plugin logout
```

**Options:** None.

**Example:**

```bash
omniscio-plugin logout
# Signed out (was: janedoe)
```

**Exit codes:** `0` signed out (or nothing was stored), `1` the stored credential exists but could not be removed — the message names the file to delete by hand.

---

### `dev`

Launch the dev shell with hot-reload for rapid plugin development.

**Usage:**

```bash
omniscio-plugin dev [options]
```

**Options:**

| Flag | Description | Default |
|---|---|---|
| `--no-build` | Skip the initial build | `false` |

**What it does:**

1. Builds the plugin the same way as `build` (unless `--no-build` is passed or `dist/` already exists).
2. Opens the dev shell -- an Electron window that loads your plugin UI with a mock `Omniscio` context.
3. Watches `src/` for changes, rebuilds with the same `omniscio-plugin` that started the shell, and hot-reloads automatically.

**Example:**

```bash
omniscio-plugin dev
omniscio-plugin dev --no-build
```

**Exit codes:** `0` clean exit, `1` build failed.

---

### `info`

Show a summary of the current plugin project (name, version, author, category, discoverability tags, permissions, entry points).

**Usage:**

```bash
omniscio-plugin info [options]
```

**Options:**

| Flag | Description | Default |
|---|---|---|
| `--json` | Output the summary as JSON | `false` |

**Example:**

```bash
omniscio-plugin info
# Plugin:      my-plugin
# Version:     1.0.0
# Category:    other
# Tags:        other, productivity
# Permissions: storage, cron
# UI:          dist/ui/index.html
# Backend:     dist/backend/index.js

omniscio-plugin info --json
# {"id":"my-plugin","version":"1.0.0", ...}
```

**Exit codes:** `0` success, `1` no `manifest.json` found.

---

### `update`

Self-update the `@omniscio/plugin-cli` package to the latest version.

**Usage:**

```bash
omniscio-plugin update [options]
```

**Options:**

| Flag | Description | Default |
|---|---|---|
| `--check` | Check for updates without installing | `false` |

**Example:**

```bash
omniscio-plugin update --check
# Current: 1.0.0, Latest: 1.2.0 — update available

omniscio-plugin update
# Updated @omniscio/plugin-cli to 1.2.0
```

**Exit codes:** `0` success (or already up to date), `1` update failed.

---

### `test`

Run the plugin test suite with [vitest](https://vitest.dev). Uses the plugin's
local vitest if installed, otherwise falls back to `npx vitest`.

**Usage:**

```bash
omniscio-plugin test [patterns...] [options]
```

**Arguments:**

| Name | Description |
|---|---|
| `patterns` | Optional test file patterns to filter (passed through to vitest) |

**Options:**

| Flag | Description | Default |
|---|---|---|
| `--watch` | Run vitest in watch mode | `false` |

**Testing your backend with the SDK harness:**

The SDK ships a test harness at `@omniscio/plugin-sdk/testing` that gives you a
faithful in-memory `PluginContext` — real storage and db (query / where / orderBy /
limit, paged like Omniscio: 100 rows unless you pass a `limit`), plus capture surfaces for toasts, notifications, logs, events, sidebar,
and inbox, and triggers for cron jobs and CLI handlers. No Omniscio or Electron needed.

```ts
import { describe, it, expect } from 'vitest'
import { createTestContext } from '@omniscio/plugin-sdk/testing'
import activate from './index.js'

describe('my backend', () => {
  it('stores a note and shows a toast', async () => {
    const h = createTestContext({ settings: { apiKey: 'sk-test' } })
    const backend = activate(h.ctx)
    backend.onEnable?.()

    await h.ctx.db.insert('notes', { title: 'hello' })
    expect(await h.ctx.db.query('notes')).toHaveLength(1)
    expect(h.toasts.map((t) => t.message)).toContain('Saved')
  })

  it('runs a cron job and answers a CLI request', async () => {
    const h = createTestContext()
    activate(h.ctx)
    await h.runCron('heartbeat')                       // invoke a registered cron handler
    const res = await h.callCli('status', { method: 'GET', path: 'status' })
    expect(res.status).toBe(200)
  })
})
```

Inject `fetch`, `ai`, and `auth` via options to control outbound calls:

```ts
const h = createTestContext({
  fetch: async () => new Response('{"ok":true}', { status: 200 }),
  ai: { generateMessage: async () => 'stubbed reply' },
  auth: { user: { uid: 'u1', email: 'a@b.co', displayName: null, photoURL: null } },
})
```

The `with-backend` and `full` scaffold templates come with vitest, a `test`
script, and a starter `src/backend/index.test.ts` wired to this harness.

**Example:**

```bash
omniscio-plugin test
omniscio-plugin test --watch
omniscio-plugin test src/backend
```

**Exit codes:** propagates vitest's exit code (`0` all passed, `1` failures), `1` if vitest can't run.

---

### `doctor`

Diagnose your local environment for plugin development. Run it any time something
isn't working -- it reports a pass / warning / fail for each dependency the toolchain
relies on, with a fix suggestion for anything that isn't right.

**Usage:**

```bash
omniscio-plugin doctor [options]
```

**Options:**

| Flag | Description | Default |
|---|---|---|
| `--json` | Output the results as JSON | `false` |

**Checks performed:**

| Check | Description |
|---|---|
| Node.js | Node version is supported (>= 18, 20+ recommended) |
| Plugin SDK | `@omniscio/plugin-sdk` is installed and up to date with npm |
| Manifest | `manifest.json` (if present) is valid against the SDK schema |
| Omniscio host | A running Omniscio is reachable on `127.0.0.1:19519` (for local install / hot-reload) |
| Omniscio CLI token | A control-server token is available (`~/.amc/cli-token` or `$AMC_CLI_TOKEN`) |
| Marketplace API | The marketplace backend is reachable (needed to publish) |

Warnings never fail the command -- only a hard failure (unsupported Node, or an
invalid `manifest.json` while inside a plugin project) sets a non-zero exit code.
Host, token, and marketplace checks are environmental and only ever warn.

Override the host port with the `AMC_CLI_PORT` environment variable.

**Example:**

```bash
omniscio-plugin doctor
# Omniscio Plugin Doctor
# ✓ Node.js: Node v22.11.0
# ✓ Plugin SDK: @omniscio/plugin-sdk 1.1.0
# ✓ Manifest: manifest.json is valid
# ⚠ Omniscio host: No running Omniscio on 127.0.0.1:19519
#     → Start Omniscio to enable local install and hot-reload.
# ✓ Omniscio CLI token: Omniscio CLI token available
# ✓ Marketplace API: Reachable
#
# ⚠ 5 passed, 1 warning, 0 failed

omniscio-plugin doctor --json
```

**Exit codes:** `0` no failures, `1` an unsupported Node or invalid manifest.
