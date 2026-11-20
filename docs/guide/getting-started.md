# Getting Started

Build and install your first Omniscio plugin in under five minutes.

## Prerequisites

- [Node.js](https://nodejs.org/) v18 or later
- [Omniscio](https://omniscio.com) installed and running
- A terminal (PowerShell, bash, zsh)

## Install the CLI

Install the Omniscio Plugin CLI globally:

```bash
npm install -g @omniscio/plugin-cli
```

Verify the installation:

```bash
omniscio-plugin --version
# 3.6.0
```

## Scaffold a New Plugin

Run `omniscio-plugin create` with a kebab-case name:

```bash
omniscio-plugin create my-plugin
```

The CLI walks you through an interactive prompt:

```
? Display name: My Plugin
? Description: An Omniscio plugin
? Author: Your Name
? Category: other
? Icon — a path to your logo in the package (assets/icon.svg), or a Lucide name for a generic glyph: assets/icon.svg

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
omniscio-plugin create my-tool -t with-backend

# Scaffold with everything
omniscio-plugin create my-suite -t full
```

You can also skip the interactive prompts entirely:

```bash
omniscio-plugin create my-plugin \
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

Compile TypeScript, copy non-TS assets (HTML, CSS, images) into `dist/`, and bundle the panel script:

```bash
cd my-plugin
npm run build
```

Expected output:

```
✓ Manifest validated
ℹ Compiling TypeScript and bundling panel scripts...
✓ Bundled dist/ui/plugin.js
✓ Build complete
```

`npm run build` runs `omniscio-plugin build`, which does four things:

1. Validates `manifest.json` against the SDK schema
2. Runs `tsc` to compile TypeScript into `dist/`
3. Copies non-TypeScript files from `src/ui/` into `dist/ui/` (HTML, CSS, images)
4. Bundles each script a page loads into one self-contained file, so the page can load it as a plain script ([details](../reference/cli.md#build))

## Validate

Run validation checks without producing build output. Useful for CI pipelines:

```bash
npx -p @omniscio/plugin-cli omniscio-plugin validate
```

Expected output:

```
✓ Manifest schema
✓ SDK version declared (2.0.0)
✓ UI entry point exists (dist/ui/index.html)
✓ TypeScript compilation
✓ All checks passed
```

Run it after `npm run build`. Before a build there is no `dist/`, so `validate` checks your `src/` files instead and prints a `⚠ ... is not built yet` warning for each entry point.

::: warning
The `validate` command also scans compiled output for banned imports (`electron`, `better-sqlite3`, `worker_threads`, `child_process` — the last two in both their bare and `node:`-prefixed spellings) and **fails** on a hit. `build` runs the same scan but only warns, so you catch it earlier, and `publish` runs it again and refuses to upload — the same rule at all three points. Marketplace plugin backends run under Node's `--permission` and cannot access these modules directly.
:::

::: danger `child_process` will not work, even though it compiles
`child_process` is the module authors most often reach for, usually to shell out to a
CLI. A marketplace plugin backend runs under Node's `--permission`, which **denies spawning a child process**,
so the import compiles, the plugin installs — and then every call fails at runtime.

Use HTTPS to talk to external services instead; the sandbox allows outbound network
requests. If you genuinely need a host capability the plugin API does not expose, ask for
it rather than shelling out.
:::

## Package

Bundle your plugin into a `.amcplugin` archive:

```bash
npx -p @omniscio/plugin-cli omniscio-plugin package
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

## Install in Omniscio

Omniscio has no "Install from file" control. A `.amcplugin` file is the upload format for the Marketplace -- it is not something the app opens locally. There are two real roads in:

### Road 1: local development

From your plugin directory:

```bash
omniscio-plugin install
```

Expected output:

```
ℹ Building plugin...
✓ Installed my-plugin → <Omniscio data folder>/profiles/<your-account>/plugins/my-plugin
✓ Hot-reloaded in Omniscio
```

`install` validates your manifest, builds the plugin, copies it into the `plugins` folder of the running Omniscio, and hot-reloads the app -- no restart. It asks Omniscio where that folder is, so it follows per-account profiles and any custom data folder.

| Flag | What it does |
|---|---|
| `-w, --watch` | Re-install and hot-reload on every source change |
| `--no-build` | Install the files as they are, without building first |
| `--no-reload` | Copy the files only; leave the running Omniscio alone |

When Omniscio cannot be asked (it is not running, or the CLI cannot find its control token), the files still go somewhere and the command tells you where -- start Omniscio and run `omniscio-plugin install` again so they land in the folder it loads from. A restart alone will not move them.

Your plugin is then running inside Omniscio. Open it from the sidebar to see your UI.

::: tip Loading a built folder by hand
Turn on **Settings > Plugins > Advanced plugin settings > Developer Mode**, then use **Load unpacked plugin** to point Omniscio at your built plugin folder. That is the same local load path, done through the app instead of the CLI.
:::

### Road 2: the Marketplace

The Marketplace is the road for everyone who is not developing the plugin. Publish it (see [Publishing](./publishing)), and once the submission is approved anyone can install it from **Settings > Plugins > Browse Marketplace** with one click on **Install** -- no files to pick.

The Marketplace also uninstalls plugins and checks for new versions.

## Next Steps

- [Project Structure](./project-structure) -- understand every file in your plugin
- [Manifest](./manifest) -- configure settings, permissions, storage, cron, and CLI endpoints
- [Permissions](./permissions) -- learn what each permission grants
- [Dev Shell](./dev-shell) -- develop with hot-reload outside Omniscio
- [Publishing](./publishing) -- submit your plugin to the Omniscio Marketplace
