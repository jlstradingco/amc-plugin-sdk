# CLI Reference

The `amc-plugin` CLI is a Commander.js-based tool for building, validating, packaging, and publishing AMC plugins.

## Install

```bash
npm install -g @agent-mc/plugin-cli
```

---

## Commands

### `create`

Scaffold a new plugin project with starter files, manifest, and optional git init.

**Usage:**

```bash
amc-plugin create <name> [options]
```

**Arguments:**

| Name | Description |
|---|---|
| `name` | Plugin name in kebab-case (e.g. `my-plugin`) |

**Options:**

| Flag | Description | Default |
|---|---|---|
| `-t, --template <template>` | Template variant: `basic`, `with-backend`, `full` | `basic` |
| `--display-name <name>` | Display name (skips interactive prompt) | &mdash; |
| `--description <desc>` | Plugin description | &mdash; |
| `--author <author>` | Plugin author | &mdash; |
| `--category <category>` | Category: `planning`, `development`, `testing`, `devops`, `productivity`, `other` | `other` |
| `--tags <tags>` | Comma-separated discoverability tags (≤10, ≤30 chars each). Blank falls back to the category | category |
| `--icon <icon>` | Lucide icon name | `puzzle` |
| `--skip-install` | Skip `npm install` after scaffolding | `false` |
| `--skip-git` | Skip `git init` and initial commit | `false` |

**Example:**

```bash
# Interactive mode
amc-plugin create my-plugin

# Non-interactive (CI-friendly)
amc-plugin create my-plugin \
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

Compile TypeScript, copy non-TS UI files to `dist/`, and scan for banned imports.

**Usage:**

```bash
amc-plugin build
```

**Options:** None.

**What it does:**

1. Validates `manifest.json` against the SDK schema.
2. Runs `tsc` to compile TypeScript to `dist/`.
3. Copies non-TS files from `src/ui/` to `dist/ui/` (HTML, CSS, images).
4. Scans `dist/` for banned imports (`electron`, `child_process`, `better-sqlite3`, `worker_threads`).

**Example:**

```bash
cd my-plugin
amc-plugin build
```

**Exit codes:** `0` success, `1` manifest invalid or TypeScript compilation failed.

---

### `validate`

Run all validation checks without building. CI-friendly -- returns a non-zero exit code on any failure.

**Usage:**

```bash
amc-plugin validate
```

**Options:** None.

**Checks performed:**

| Check | Description |
|---|---|
| Manifest schema | Validates `manifest.json` against the SDK schema |
| SDK version | Ensures `sdkVersion` field is present |
| UI entry point | Verifies the declared UI entry file exists |
| Backend entry point | Verifies the declared backend entry file exists |
| TypeScript | Runs `tsc --noEmit` to check for type errors |
| Banned imports | Scans `dist/` for disallowed Node/Electron imports |

**Example:**

```bash
# In a GitHub Actions workflow
amc-plugin validate
```

**Exit codes:** `0` all checks passed, `1` one or more checks failed.

---

### `package`

Bundle the plugin into a `.amcplugin` archive (zip) for distribution or marketplace upload.

**Usage:**

```bash
amc-plugin package
```

**Options:** None.

**What it does:**

1. Validates `manifest.json`.
2. Builds if `dist/` does not exist.
3. Creates `<plugin-id>-<version>.amcplugin` in the project root.
4. Includes `manifest.json`, `dist/`, and `assets/` (if present).
5. Warns if the archive exceeds the 50 MB marketplace limit.

**Example:**

```bash
amc-plugin package
# Packaged: my-plugin-1.0.0.amcplugin (0.12 MB)
```

**Exit codes:** `0` success, `1` manifest invalid or build failed.

---

### `preflight`

Run publish-readiness checks **without uploading**. This is the same gate `publish` runs before an upload, exposed as a standalone dry-run so you can fix issues first.

**Usage:**

```bash
amc-plugin preflight [options]
```

**Options:**

| Flag | Description | Default |
|---|---|---|
| `--changelog <text>` | Changelog for this version (checked for presence) | &mdash; |

**Checks performed:**

| Check | Fails when | Warns when |
|---|---|---|
| Version | Manifest version is already published (marketplace versions are **immutable**) or older than the latest published version | &mdash; |
| Changelog | &mdash; | No changelog provided |
| Permissions | An unknown permission is declared | Duplicate permissions |
| Package size | Archive exceeds the 50 MB marketplace limit | Archive exceeds 25 MB |

If the marketplace registry is unreachable, the version check is skipped rather than blocking.

**Example:**

```bash
amc-plugin preflight --changelog "Added dark mode support"
# ✓ Version: 1.1.0 is newer than the published 1.0.0
# ⚠ Permissions: Duplicate permission(s): storage
#   → Remove the duplicate entries from manifest.json permissions.
# ✓ Package size: 0.12 MB
```

**Exit codes:** `0` all checks passed (warnings allowed), `1` one or more checks failed.

---

### `publish`

Upload a `.amcplugin` archive to the AMC Marketplace for review. Authenticates via GitHub OAuth on first use.

**Usage:**

```bash
amc-plugin publish [options]
```

**Options:**

| Flag | Description | Default |
|---|---|---|
| `--changelog <text>` | Changelog text for this version | &mdash; |
| `--watch` | Poll until the submission is approved or rejected (up to 3 hours) | `false` |
| `--skip-preflight` | Skip the pre-upload readiness checks | `false` |
| `--as <github-user>` | Assert the expected GitHub account; aborts before upload on mismatch | &mdash; |
| `--switch-account` | Sign out first and re-authenticate as a different account | `false` |
| `-y, --yes` | Skip the upload-identity confirmation prompt (for CI) | `false` |

**What it does:**

1. Checks for a stored auth token; prompts GitHub OAuth if missing.
2. **Confirms the uploading identity** before upload (see the account trap below).
3. Locates a `.amcplugin` file (runs `amc-plugin package` if none found).
4. Runs [`preflight`](#preflight) readiness checks (unless `--skip-preflight`); aborts on any failure.
5. Uploads the archive to the marketplace.
6. With `--watch`, polls every 30 seconds for the review decision.

::: warning The GitHub account trap
GitHub sign-in reuses whatever account your **default browser** is already logged
into — there is no account chooser, so a publish can silently go out under the
**wrong** identity (marketplace ownership is tied to the GitHub account).

Before uploading, `publish` shows `Uploading as: <github>` and asks you to confirm.
If it's the wrong account:

- Run `amc-plugin publish --switch-account` to sign out and re-authenticate, **or**
- Use `--as <github-user>` in scripts to hard-assert the intended account (aborts on mismatch).

To land on the right account during sign-in, open an incognito / private window
signed into the correct GitHub account first, or sign out at
`https://github.com/logout`.
:::

**Example:**

```bash
# Interactive — confirms "Uploading as: <you>" before upload
amc-plugin publish --changelog "Added dark mode support" --watch

# Publish under a specific account, re-authenticating if needed
amc-plugin publish --switch-account

# CI — assert the account and skip the prompt
amc-plugin publish --as my-org-bot --yes
```

**Exit codes:** `0` success (or approved with `--watch`), `1` preflight failed, upload failed, rejected, or `--as` mismatch.

---

### `status`

Show the marketplace submission status for the current plugin.

**Usage:**

```bash
amc-plugin status
```

**Options:** None.

**What it does:**

Reads `manifest.json` to determine the plugin ID, then queries the marketplace for all submissions matching that ID. Displays status, version, and review feedback.

**Example:**

```bash
amc-plugin status
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
amc-plugin whoami
```

**Options:** None.

**Example:**

```bash
amc-plugin whoami
# Signed in as: janedoe (uid: abc123)
```

**Exit codes:** `0` always.

---

### `logout`

Clear the stored marketplace authentication token.

**Usage:**

```bash
amc-plugin logout
```

**Options:** None.

**Example:**

```bash
amc-plugin logout
# Signed out (was: janedoe)
```

**Exit codes:** `0` always.

---

### `dev`

Launch the dev shell with hot-reload for rapid plugin development.

**Usage:**

```bash
amc-plugin dev [options]
```

**Options:**

| Flag | Description | Default |
|---|---|---|
| `--no-build` | Skip the initial TypeScript build | `false` |

**What it does:**

1. Builds the plugin (unless `--no-build` is passed).
2. Opens the dev shell -- an Electron window that loads your plugin UI with a mock `AgentMC` context.
3. Watches `src/` for changes and hot-reloads automatically.

**Example:**

```bash
amc-plugin dev
amc-plugin dev --no-build
```

**Exit codes:** `0` clean exit, `1` build failed.

---

### `info`

Show a summary of the current plugin project (name, version, author, category, discoverability tags, permissions, entry points).

**Usage:**

```bash
amc-plugin info [options]
```

**Options:**

| Flag | Description | Default |
|---|---|---|
| `--json` | Output the summary as JSON | `false` |

**Example:**

```bash
amc-plugin info
# Plugin:      my-plugin
# Version:     1.0.0
# Category:    other
# Tags:        other, productivity
# Permissions: storage, cron
# UI:          dist/ui/index.html
# Backend:     dist/backend/index.js

amc-plugin info --json
# {"id":"my-plugin","version":"1.0.0", ...}
```

**Exit codes:** `0` success, `1` no `manifest.json` found.

---

### `update`

Self-update the `@agent-mc/plugin-cli` package to the latest version.

**Usage:**

```bash
amc-plugin update [options]
```

**Options:**

| Flag | Description | Default |
|---|---|---|
| `--check` | Check for updates without installing | `false` |

**Example:**

```bash
amc-plugin update --check
# Current: 1.0.0, Latest: 1.2.0 — update available

amc-plugin update
# Updated @agent-mc/plugin-cli to 1.2.0
```

**Exit codes:** `0` success (or already up to date), `1` update failed.

---

### `test`

Run the plugin test suite with [vitest](https://vitest.dev). Uses the plugin's
local vitest if installed, otherwise falls back to `npx vitest`.

**Usage:**

```bash
amc-plugin test [patterns...] [options]
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

The SDK ships a test harness at `@agent-mc/plugin-sdk/testing` that gives you a
faithful in-memory `PluginContext` — real storage and db (query / where / orderBy /
limit), plus capture surfaces for toasts, notifications, logs, events, sidebar,
and inbox, and triggers for cron jobs and CLI handlers. No AMC or Electron needed.

```ts
import { describe, it, expect } from 'vitest'
import { createTestContext } from '@agent-mc/plugin-sdk/testing'
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
amc-plugin test
amc-plugin test --watch
amc-plugin test src/backend
```

**Exit codes:** propagates vitest's exit code (`0` all passed, `1` failures), `1` if vitest can't run.

---

### `doctor`

Diagnose your local environment for plugin development. Run it any time something
isn't working -- it reports a pass / warning / fail for each dependency the toolchain
relies on, with a fix suggestion for anything that isn't right.

**Usage:**

```bash
amc-plugin doctor [options]
```

**Options:**

| Flag | Description | Default |
|---|---|---|
| `--json` | Output the results as JSON | `false` |

**Checks performed:**

| Check | Description |
|---|---|
| Node.js | Node version is supported (>= 18, 20+ recommended) |
| Plugin SDK | `@agent-mc/plugin-sdk` is installed and up to date with npm |
| Manifest | `manifest.json` (if present) is valid against the SDK schema |
| AMC host | A running AMC is reachable on `127.0.0.1:19519` (for local install / hot-reload) |
| AMC CLI token | A control-server token is available (`~/.amc/cli-token` or `$AMC_CLI_TOKEN`) |
| Marketplace API | The marketplace backend is reachable (needed to publish) |

Warnings never fail the command -- only a hard failure (unsupported Node, or an
invalid `manifest.json` while inside a plugin project) sets a non-zero exit code.
Host, token, and marketplace checks are environmental and only ever warn.

Override the host port with the `AMC_CLI_PORT` environment variable.

**Example:**

```bash
amc-plugin doctor
# AMC Plugin Doctor
# ✓ Node.js: Node v22.11.0
# ✓ Plugin SDK: @agent-mc/plugin-sdk 1.1.0
# ✓ Manifest: manifest.json is valid
# ⚠ AMC host: No running AMC on 127.0.0.1:19519
#     → Start Agent Mission Control to enable local install and hot-reload.
# ✓ AMC CLI token: AMC CLI token available
# ✓ Marketplace API: Reachable
#
# ⚠ 5 passed, 1 warning, 0 failed

amc-plugin doctor --json
```

**Exit codes:** `0` no failures, `1` an unsupported Node or invalid manifest.
