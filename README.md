<div align="center">

# Omniscio Plugin SDK

**TypeScript-first SDK for building plugins for Omniscio**

[![TypeScript](https://img.shields.io/badge/TypeScript-5.5-3178C6?logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![Zod](https://img.shields.io/badge/Zod-3.23-3E67B1?logo=zod&logoColor=white)](https://zod.dev/)
[![Electron](https://img.shields.io/badge/Electron-39-47848F?logo=electron&logoColor=white)](https://www.electronjs.org/)
[![Node.js](https://img.shields.io/badge/Node.js-≥18-339933?logo=node.js&logoColor=white)](https://nodejs.org/)
[![pnpm](https://img.shields.io/badge/pnpm-workspaces-F69220?logo=pnpm&logoColor=white)](https://pnpm.io/)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

</div>

---

## Overview

Omniscio Plugin SDK is a monorepo providing everything you need to build, test, and distribute plugins for [Omniscio](https://omniscio.com) — an Electron desktop app for managing multiple concurrent Claude Code sessions across projects.

The SDK gives plugin authors a sandboxed `PluginContext` and a typed `Omniscio` panel bridge covering 41 documented APIs, a CLI for scaffolding and packaging, and an Electron-based dev shell for offline development with hot-reload and mock APIs.

> **Where this lives.** The SDK is developed inside the Omniscio repository, in the `plugin-sdk/` folder. [github.com/jlstradingco/amc-plugin-sdk](https://github.com/jlstradingco/amc-plugin-sdk) is a read-only mirror that the app syncs from this folder — never commit there. The documentation is built from this folder and served at [docs.omniscio.com/sdk](https://docs.omniscio.com/sdk/). The development commands below run inside `plugin-sdk/`.

## Features

<table>
<tr>
<td width="50%">

**Type-Safe Manifest v2**

Full TypeScript types and Zod validators for the plugin manifest format. Catches errors at build time, not install time.

</td>
<td width="50%">

**CLI Toolchain**

`omniscio-plugin create` scaffolds a new plugin from five templates. `build`, `validate`, and `package` handle the rest of the lifecycle.

</td>
</tr>
<tr>
<td>

**41 Sandboxed APIs**

Storage, database, sessions, AI, filesystem, HTTP, cron, CLI endpoints, sidebar, toasts, events, settings, inbox, email, boards, clipboard, shell, process, OAuth, live channels and more — all scoped per-plugin and gated by the permissions the user approves.

</td>
<td>

**Dev Shell with Hot-Reload**

Standalone Electron shell loads your plugin UI in a webview with a mock `Omniscio` bridge and a full `MockPluginContext`. File changes trigger automatic recompile and reload.

</td>
</tr>
<tr>
<td>

**Five Starter Templates**

`basic` (UI only), `with-backend` (UI + backend module), `full` (UI + backend + cron + CLI endpoints), `webview` (plain JS, no build step) and `widget` (a titlebar widget) — pick the right starting point.

</td>
<td>

**Banned Import Scanner**

Build, validate and publish scan compiled output for forbidden imports (`electron`, `better-sqlite3`, `worker_threads`, `child_process` — the last two in both their bare and `node:`-prefixed spellings) to enforce the sandbox boundary. `build` warns so you catch it early, `validate` fails, and `publish`'s preflight blocks the upload — so a banned import cannot reach the marketplace by skipping a step.

</td>
</tr>
</table>

## Quick Start

> **Coming from `@agent-mc/plugin-sdk`?** The SDK was renamed in 3.4.0. Swap `@agent-mc/` for `@omniscio/` in your `package.json` and imports, and prefer `window.Omniscio` in your panel. The old package name, the `amc-plugin` command and `window.AgentMC` all keep working. See the [changelog](./CHANGELOG.md).

```bash
# 1. Install the CLI globally
npm install -g @omniscio/plugin-cli

# 2. Scaffold a new plugin
omniscio-plugin create my-plugin --template with-backend

# 3. Develop with hot-reload
cd my-plugin
npm run dev

# 4. Build and validate
npm run build
omniscio-plugin validate

# 5. Package for distribution
omniscio-plugin package
# -> my-plugin-1.0.0.amcplugin
```

## PluginContext API

Every plugin receives a `PluginContext` object with these sandboxed capabilities:

| Capability | Interface | Description |
|---|---|---|
| `storage` | `PluginStorage` | Key-value storage scoped to plugin (`get`, `set`, `delete`, `list`) |
| `db` | `PluginDb` | SQLite collections with CRUD + queries (`insert`, `query`, `getById`, `update`, `delete`, `deleteWhere`) |
| `settings` | `PluginSettings` | Read plugin settings defined in the manifest (`getAll`, `get`) |
| `log` | `PluginLogger` | Scoped logging (`info`, `warn`, `error`, `debug`) |
| `events` | `PluginEvents` | Pub/sub event system (`emit`, `on`) |
| `sessions` | `PluginSessions` | Create and manage Omniscio sessions (`create`, `sendMessage`, `getStatus`, `stop`) |
| `ai` | `PluginAi` | Send messages to Claude API (`generateMessage`, `generateTitle`) |
| `fs` | `PluginFs` | Scoped filesystem access (`readFile`, `writeFile`, `exists`, `listDir`, `deleteFile`) |
| `http` | `PluginHttp` | HTTP client (`fetch` wrapper) |
| `cron` | `PluginCron` | Schedule recurring tasks (`register`, `unregister`, `isRegistered`) |
| `cli` | `PluginCli` | Register HTTP endpoints on Omniscio's CLI server (`handle`, `removeHandler`) |
| `sidebar` | `PluginSidebar` | Control sidebar badge and navigation items (`setBadge`, `setItems`) |
| `toast` | `PluginToast` | Show toast notifications and OS-level alerts (`show`, `notify`) |

UI plugins also get `window.Omniscio` — a browser-side bridge exposing `storage`, `db`, `settings`, `events`, `theme`, `toast`, `session`, `ai`, `export`, `project`, `sidebar`, `assets`, `inbox`, `auth`, and `recording`.

## Plugin Backend Lifecycle

Backend modules export an `activate` function that receives `PluginContext` and returns a `PluginBackend`:

```typescript
import type { PluginActivate } from '@omniscio/plugin-sdk'

const activate: PluginActivate = (ctx) => {
  return {
    onEnable()  { ctx.log.info('Plugin enabled') },
    onDisable() { ctx.log.info('Plugin disabled') },
    onSettingsChanged(settings) { /* react to config changes */ },
    onAppReady()  { /* Omniscio finished booting */ },
    onShutdown()  { /* cleanup before exit */ },
  }
}

export default activate
```

## Manifest v2 Format

Every plugin requires a `manifest.json` at the project root:

```jsonc
{
  "plugin": {
    "id": "my-plugin",            // kebab-case, unique
    "name": "My Plugin",
    "version": "1.0.0",
    "author": "Your Name",
    "description": "What it does",
    "icon": "icon.png",           // Image file (png/jpg/svg/webp) or Lucide icon name
    "category": "productivity",   // planning | development | testing | devops | productivity | other
    "license": { "type": "free" } // free | paid | trial
  },
  "settings": [],
  "storage": { "collections": {} },
  "sdkVersion": "2.0.0",
  "ui": {
    "entryPoint": "dist/ui/index.html",
    "sidebar": { "title": "My Plugin", "icon": "puzzle" }
  },
  "backend": { "entryPoint": "dist/backend/index.js" },
  "permissions": ["storage", "network"],
  "cli": {
    "endpoints": [
      { "method": "GET", "path": "status", "description": "Get status", "auth": true }
    ]
  }
}
```

Validated at build time by Zod schemas — see `manifestSchema` in `@omniscio/plugin-sdk/validators`.

There is no `migrations` array and no `cron` block: neither is a manifest key, so a manifest carrying
one validates and then behaves as if it were absent. Schema changes come from the host's automatic
`ADD COLUMN` sweep, and scheduled work is an [automation](#automations) with a schedule rather than a
manifest block. The `cron` PERMISSION is real and belongs in `permissions`. The full accepted surface,
key by key, is [the manifest reference](docs/guide/manifest.md).

## CLI Commands

| Command | Description |
|---|---|
| `omniscio-plugin create <name>` | Scaffold a new plugin (templates: `basic`, `with-backend`, `full`, `webview`, `widget`) |
| `omniscio-plugin build` | Compile TypeScript, copy UI assets, bundle each panel script, validate manifest, scan for banned imports |
| `omniscio-plugin validate` | Run all validation checks without emitting output (CI-friendly) |
| `omniscio-plugin package` | Bundle into a `.amcplugin` archive (zip or tar.gz fallback) |

## Automations

The same package ships a second binary, `omniscio-automation`, for publishing Omniscio
**automations** — multi-step recipes Omniscio runs for you, as opposed to plugins,
which extend Omniscio itself. Both publish to the same marketplace and share one
sign-in.

| Command | Description |
|---|---|
| `omniscio-automation init <name>` | Scaffold a `.recipe.json` that validates clean out of the box |
| `omniscio-automation validate` | Local checks; `--check` adds the marketplace's verdict |
| `omniscio-automation publish` | Submit for review |
| `omniscio-automation status` | Follow the review |

See the [Automations guide](docs/guide/automations.md) and the
[`omniscio-automation` reference](docs/reference/automation-cli.md).

## Tech Stack

| Layer | Technology | Purpose |
|---|---|---|
| Types & Validation | TypeScript 5.5, Zod 3.23 | Manifest types, context interfaces, runtime validation |
| CLI | Commander, Prompts | Scaffolding, build pipeline, packaging |
| Dev Shell | Electron 39, Chokidar | Offline preview environment with hot-reload |
| Testing | Vitest | Unit tests and E2E lifecycle tests |
| Monorepo | pnpm workspaces | Package linking and dependency management |

## Architecture

```
plugin-sdk/                       # inside the Omniscio repository
├── packages/
│   ├── sdk/                      # @omniscio/plugin-sdk
│   │   ├── src/
│   │   │   ├── index.ts          # Barrel exports (types + validators)
│   │   │   ├── types/
│   │   │   │   ├── manifest.ts   # PluginManifest, settings, permissions, migrations
│   │   │   │   ├── context.ts    # PluginContext and its capability interfaces
│   │   │   │   ├── backend.ts    # PluginBackend lifecycle, PluginActivate
│   │   │   │   └── bridge.ts     # Browser-side Omniscio window bridge
│   │   │   └── validators/
│   │   │       └── manifest.ts   # Zod schema + validateManifest()
│   │   └── package.json
│   │
│   ├── cli/                      # @omniscio/plugin-cli
│   │   ├── src/
│   │   │   ├── index.ts          # CLI entry point (commander program)
│   │   │   └── commands/
│   │   │       ├── create.ts     # Scaffold with templates + prompts
│   │   │       ├── build.ts      # Compile + validate + banned-import scan
│   │   │       ├── validate.ts   # CI-friendly validation checks
│   │   │       └── package.ts    # .amcplugin archive bundler
│   │   └── package.json
│   │
│   └── dev-shell/                # @omniscio/plugin-dev-shell
│       ├── src/
│       │   ├── shell-window.ts   # Electron BrowserWindow host
│       │   ├── mock-context.ts   # Full MockPluginContext (in-memory)
│       │   ├── hot-reload.ts     # Chokidar watcher + auto-recompile
│       │   └── shell.html        # Dev shell chrome
│       └── package.json
│
├── tsconfig.base.json            # Shared compiler options
├── pnpm-workspace.yaml           # Workspace configuration
└── package.json                  # Root scripts (build, test, clean)
```

### Adding a capability namespace

Every namespace the Omniscio webview exposes must be typed on `Omniscio` in
`packages/sdk/src/types/bridge.ts`. `namespace-coverage.test.ts` compares that interface against
the host's generated surface and fails when an exposed namespace is neither typed nor listed.

If you cannot type one yet, add it to `packages/sdk/src/__tests__/namespace-coverage-register.ts`
with a one-line reason. The register only shrinks: typing a registered namespace without deleting
its entry fails the same test, so a fixed gap cannot leave a stale row behind.

The comparison runs both ways. Typing a namespace the webview never receives fails too, because an
author can only call what the host answers.

## Getting Started

### Prerequisites

- **Node.js** >= 18
- **pnpm** (for monorepo development)

### Install & Build

The SDK is a folder in the Omniscio repository, not a repository of its own. From an
Omniscio checkout, work in `plugin-sdk/`:

```bash
# From the Omniscio repository root
cd plugin-sdk

# Install this folder's own workspace (the app root is not a pnpm workspace)
pnpm install --frozen-lockfile

# Build all packages
pnpm build

# Run all tests
pnpm test
```

### Development

```bash
# Build a specific package
pnpm --filter @omniscio/plugin-sdk build

# Watch mode for the CLI
pnpm --filter @omniscio/plugin-cli dev

# Run SDK tests
pnpm --filter @omniscio/plugin-sdk test
```

### Using in a Plugin Project

```bash
npm install @omniscio/plugin-sdk --save-dev
```

Import types for backend modules:

```typescript
import type { PluginActivate, PluginContext } from '@omniscio/plugin-sdk'
```

Import types for UI code (browser-side bridge):

```typescript
import type { Omniscio } from '@omniscio/plugin-sdk/browser'
```

Import validators for CI or custom tooling:

```typescript
import { validateManifest } from '@omniscio/plugin-sdk/validators'
```

## Permissions

Plugins declare required permissions in `manifest.json`. Omniscio enforces these at runtime:

| Permission | Grants access to |
|---|---|
| `storage` | `ctx.storage` and `ctx.db` |
| `sessions` | `ctx.sessions` |
| `ai` | `ctx.ai` |
| `network` | `ctx.http` |
| `cron` | `ctx.cron` |
| `cli` | `ctx.cli` |
| `notifications` | `ctx.toast.notify()` (OS-level notifications) |
| `rss` | Omniscio's built-in RSS feed data |

## Documentation

The docs source is `plugin-sdk/docs/` here — VitePress, built into the Omniscio help site and
published at **[docs.omniscio.com/sdk/](https://docs.omniscio.com/sdk/)**, covering:

- **[Getting Started](https://docs.omniscio.com/sdk/guide/getting-started)** — scaffold, build, and install your first plugin
- **[API Reference](https://docs.omniscio.com/sdk/api/)** — all 41 APIs documented
- **[Publishing](https://docs.omniscio.com/sdk/guide/publishing)** — submit to the Omniscio Marketplace
- **[Examples](https://docs.omniscio.com/sdk/examples/)** — four reference plugins with full source

## License

[MIT](LICENSE)
