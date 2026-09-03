# Getting Started

Build and install your first AMC plugin in under five minutes.

## Prerequisites

- [Node.js](https://nodejs.org/) v18 or later
- [Agent Mission Control](https://github.com/jlstradingco/agent-mission-control) installed and running
- A terminal (PowerShell, bash, zsh)

## Install the CLI

Install the AMC Plugin CLI globally:

```bash
npm install -g @agent-mc/plugin-cli
```

Verify the installation:

```bash
amc-plugin --version
# 1.0.0
```

## Scaffold a New Plugin

Run `amc-plugin create` with a kebab-case name:

```bash
amc-plugin create my-plugin
```

The CLI walks you through an interactive prompt:

```
? Display name: My Plugin
? Description: An AMC plugin
? Author: Your Name
? Category: other
? Lucide icon name: puzzle

Scaffolding my-plugin with template: basic...

Installing dependencies...
added 2 packages in 3s

Plugin scaffolded at ./my-plugin/

Next steps:
  cd my-plugin
  npm run build
  npm run dev
```

### Templates

Choose a template with the `-t` flag:

| Template | What you get |
|---|---|
| `basic` (default) | UI only (`src/ui/`) |
| `with-backend` | UI + backend (`src/backend/`) with `storage` permission |
| `full` | UI + backend + cron job + CLI endpoint with `storage`, `cron`, and `cli` permissions |

```bash
# Scaffold with a backend
amc-plugin create my-tool -t with-backend

# Scaffold with everything
amc-plugin create my-suite -t full
```

You can also skip the interactive prompts entirely:

```bash
amc-plugin create my-plugin \
  -t basic \
  --display-name "My Plugin" \
  --description "Does something useful" \
  --author "Your Name" \
  --category development \
  --icon wrench
```

## Explore the Generated Files

After scaffolding, your plugin directory looks like this:

```
my-plugin/
  manifest.json       # Plugin metadata, settings, permissions
  package.json        # npm dependencies and scripts
  tsconfig.json       # TypeScript configuration
  .gitignore          # Ignores node_modules/, dist/, *.amcplugin
  src/
    ui/
      index.html      # Plugin UI entry point
      plugin.ts       # TypeScript for the UI
```

::: tip
See [Project Structure](./project-structure) for a detailed breakdown of every file.
:::

## Build

Compile TypeScript and copy non-TS assets (HTML, CSS, images) into `dist/`:

```bash
cd my-plugin
npm run build
```

Expected output:

```
Manifest validated
Compiling TypeScript...
Build complete
```

The `build` command does three things:

1. Validates `manifest.json` against the SDK schema
2. Runs `tsc` to compile TypeScript into `dist/`
3. Copies non-TypeScript files from `src/ui/` into `dist/ui/` (HTML, CSS, images)

## Validate

Run validation checks without producing build output. Useful for CI pipelines:

```bash
npx amc-plugin validate
```

Expected output:

```
PASS: Manifest schema
PASS: SDK version declared (^3.0.0)
PASS: UI entry point exists
PASS: TypeScript compilation

All checks PASSED
```

::: warning
The `validate` command also scans compiled output for banned imports (`electron`, `child_process`, `better-sqlite3`, `node:worker_threads`). Plugins run in a sandboxed worker and cannot access these modules directly.
:::

## Package

Bundle your plugin into a `.amcplugin` archive:

```bash
npx amc-plugin package
```

Expected output:

```
Packaged: my-plugin-1.0.0.amcplugin (0.01 MB)
```

If `dist/` does not exist, the `package` command builds automatically before packaging.

The archive contains:
- `manifest.json`
- `dist/` (compiled output)
- `assets/` (if present)

::: warning
The marketplace enforces a **50 MB** package size limit. The CLI warns you if your archive exceeds this.
:::

## Install in AMC

1. Open **Agent Mission Control**
2. Go to **Settings > Plugins**
3. Click **Install from file**
4. Select your `.amcplugin` file
5. The plugin appears in the sidebar

Your plugin is now running inside AMC. Open it from the sidebar to see your UI.

## Next Steps

- [Project Structure](./project-structure) -- understand every file in your plugin
- [Manifest](./manifest) -- configure settings, permissions, storage, cron, and CLI endpoints
- [Permissions](./permissions) -- learn what each permission grants
- [Dev Shell](./dev-shell) -- develop with hot-reload outside AMC
- [Publishing](./publishing) -- submit your plugin to the AMC Marketplace
