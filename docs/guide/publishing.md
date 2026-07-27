# Publishing

Publish your plugin to the AMC Marketplace so other Agent Mission Control users can discover and install it.

## Overview

The publish workflow is:

1. **Build and package** your plugin
2. **Authenticate** with GitHub (automatic on first publish)
3. **Upload** the `.amcplugin` archive to the marketplace
4. **Wait for review** (manual review by the marketplace team)
5. **Published** -- your plugin appears in AMC's marketplace browser

## Prerequisites

- A [GitHub](https://github.com) account
- A built and validated plugin (run `npx amc-plugin validate` first)

## Step 1: Build and Package

Make sure your plugin builds cleanly and passes validation:

```bash
npm run build
npx amc-plugin validate
npx amc-plugin package
```

Expected output:

```
Manifest validated
Compiling TypeScript...
Build complete

PASS: Manifest schema
PASS: SDK version declared (^1.0.0)
PASS: UI entry point exists
PASS: TypeScript compilation
PASS: No banned imports

All checks PASSED

Packaged: my-plugin-1.0.0.amcplugin (0.01 MB)
```

::: tip
If you skip the package step, the `publish` command runs it automatically.
:::

## Step 2: Publish

Run the publish command from your plugin directory:

```bash
npx amc-plugin publish
```

### First-Time Authentication

On first publish, the CLI opens your browser to the AMC Marketplace sign-in page for GitHub OAuth authentication:

```
Opening browser for GitHub sign-in...
If the browser doesn't open, visit: https://amc-marketplace-jls.web.app?session=A1B2C3

Waiting for sign-in...
.....
Signed in as your-github-username
```

After signing in, the CLI stores your token locally at `~/.amc/marketplace-token`. Subsequent publishes reuse it, and when it expires the CLI renews it silently in the background using the stored refresh token — so you should only see the browser flow again if you sign out or your access is revoked.

### Upload

After authentication, the CLI locates (or creates) the `.amcplugin` file and uploads it:

```
Uploading my-plugin-1.0.0.amcplugin (0.01 MB)...

Submitted for review (submission ID: abc123)
Run `amc-plugin status` to check progress, or use --watch to wait.
```

### Adding a Changelog

Include a changelog message for the marketplace listing:

```bash
npx amc-plugin publish --changelog "Added dark mode support and fixed sidebar badge count"
```

### Watch Mode

Use `--watch` to poll for the review decision instead of checking manually:

```bash
npx amc-plugin publish --watch
```

The CLI polls every 30 seconds for up to 3 hours:

```
Uploading my-plugin-1.0.0.amcplugin (0.01 MB)...

Submitted for review (submission ID: abc123)

Watching for review decision...
......
Plugin published!
```

If the submission is rejected, the CLI prints the reviewer's feedback and exits with a non-zero code:

```
Rejected: Plugin must handle errors in the onEnable lifecycle hook
```

## Step 3: Check Status

Check the review status of your submissions at any time:

```bash
npx amc-plugin status
```

Output:

```
Submissions for "my-plugin":

  [?] my-plugin v1.0.0 — pending (5/17/2026)
```

Status icons:

| Icon | Status | Meaning |
|---|---|---|
| `[?]` | pending | Awaiting review |
| `[OK]` | approved | Published to the marketplace |
| `[X]` | rejected | Review failed -- see feedback |

When run from a plugin directory (with a `manifest.json`), the `status` command filters to show only submissions for that plugin. Run it from any other directory to see all your submissions across all plugins.

If rejected, the feedback is shown:

```
Submissions for "my-plugin":

  [X] my-plugin v1.0.0 — rejected (5/17/2026)
      Feedback: Plugin must handle errors in the onEnable lifecycle hook
```

## Re-Submitting After Changes

After a rejection or when publishing an update:

1. Fix the issues or make your changes
2. Bump the version in `manifest.json` (in the `plugin.version` field)
3. Rebuild, validate, and publish:

```bash
npm run build
npx amc-plugin validate
npx amc-plugin publish --changelog "Fixed onEnable error handling"
```

Each submission is tracked independently. You can see the full history with `amc-plugin status`.

## Review Process

Submissions go through these states:

```
pending  -->  approved  (published to marketplace)
         -->  rejected  (feedback provided)
```

The review checks for:

- Valid manifest schema and SDK version compatibility
- No banned imports (`electron`, `child_process`, `better-sqlite3`, `node:worker_threads`)
- Correct entry points (UI and/or backend files exist)
- Package size within the 50 MB limit
- Security review of plugin behavior

::: warning
The marketplace enforces a **50 MB** package size limit. The `amc-plugin package` command warns you if your archive exceeds this.
:::

## Authentication Management

### Check Current Identity

```bash
npx amc-plugin whoami
```

Output:

```
Signed in as: your-github-username (uid: abc123)
```

If not signed in:

```
Not signed in. Run `amc-plugin publish` to authenticate.
```

### Sign Out

```bash
npx amc-plugin logout
```

Output:

```
Signed out (was: your-github-username)
```

This deletes the stored token at `~/.amc/marketplace-token`. The next `publish` command will prompt for authentication again.

### Token Storage

The CLI stores your marketplace authentication token at:

```
~/.amc/marketplace-token
```

The token includes your GitHub username, Firebase UID, and an expiration timestamp. It is automatically refreshed when needed, and expired tokens trigger a new browser-based sign-in flow.

## CLI Command Summary

| Command | Description |
|---|---|
| `amc-plugin publish` | Upload plugin to the marketplace |
| `amc-plugin publish --watch` | Upload and poll until approved/rejected |
| `amc-plugin publish --changelog "..."` | Upload with a changelog message |
| `amc-plugin status` | Check submission review status |
| `amc-plugin whoami` | Show authenticated GitHub username |
| `amc-plugin logout` | Clear stored authentication token |
