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

**What it does:**

1. Checks for a stored auth token; prompts GitHub OAuth if missing.
2. Locates a `.amcplugin` file (runs `amc-plugin package` if none found).
3. Uploads the archive to the marketplace.
4. With `--watch`, polls every 30 seconds for the review decision.

**Example:**

```bash
amc-plugin publish --changelog "Added dark mode support" --watch
```

**Exit codes:** `0` success (or approved with `--watch`), `1` upload failed or rejected.

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
