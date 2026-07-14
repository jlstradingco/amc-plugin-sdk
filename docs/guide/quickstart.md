# Quickstart

Ship a working "Hello World" AMC plugin in five minutes. Every step is copy-paste — no interactive prompts, no editing required.

::: tip Want the full walkthrough?
This page is the fast path. [Getting Started](./getting-started) explains each step, the templates, and every generated file in detail.
:::

## 1. Install the CLI

```bash
npm install -g @agent-mc/plugin-cli
```

## 2. Scaffold (non-interactive)

Pass `--display-name`, `--description`, and `--author` to skip the interactive prompts entirely:

```bash
amc-plugin create hello-world \
  --display-name "Hello World" \
  --description "My first AMC plugin" \
  --author "Your Name"
```

This creates a `hello-world/` folder, installs dependencies, and initializes a git repo. You now have a complete, buildable plugin.

## 3. Build and package

```bash
cd hello-world
npm run build
npx amc-plugin package
```

You should see:

```
✓ Manifest schema
✓ SDK version declared (^1.0.0)
✓ UI entry point exists
✓ TypeScript compilation
✓ No banned imports
Packaged: hello-world-1.0.0.amcplugin (0.01 MB)
```

## 4. Install in AMC

1. Open **Agent Mission Control**
2. Go to **Settings > Plugins**
3. Click **Install from file**
4. Select `hello-world-1.0.0.amcplugin`

Open **Hello World** from the sidebar — your plugin is live inside AMC.

## 5. Make it yours

Edit `src/ui/index.html` to change what the panel shows, then rebuild and repackage:

```bash
npm run build && npx amc-plugin package
```

Re-install the new `.amcplugin` to see your change. For hot-reload while developing, use the [Dev Shell](./dev-shell) instead:

```bash
npm run dev
```

## Next Steps

- [Getting Started](./getting-started) — the detailed walkthrough, templates, and every generated file
- [Project Structure](./project-structure) — what each file does
- [Permissions](./permissions) — grant your plugin storage, cron, CLI, and more
- [Publishing](./publishing) — submit to the AMC Marketplace
