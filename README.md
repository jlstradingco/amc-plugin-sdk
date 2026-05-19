<div align="center">

# AMC Plugin SDK

**TypeScript-first SDK for building plugins for Agent Mission Control**

[![TypeScript](https://img.shields.io/badge/TypeScript-5.5-3178C6?logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![Zod](https://img.shields.io/badge/Zod-3.23-3E67B1?logo=zod&logoColor=white)](https://zod.dev/)
[![Electron](https://img.shields.io/badge/Electron-39-47848F?logo=electron&logoColor=white)](https://www.electronjs.org/)
[![Node.js](https://img.shields.io/badge/Node.js-≥18-339933?logo=node.js&logoColor=white)](https://nodejs.org/)
[![pnpm](https://img.shields.io/badge/pnpm-workspaces-F69220?logo=pnpm&logoColor=white)](https://pnpm.io/)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

</div>

---

## Overview

AMC Plugin SDK is a monorepo providing everything you need to build, test, and distribute plugins for [Agent Mission Control](https://github.com/jlstradingco/agent-mission-control) (AMC) — an Electron desktop app for managing multiple concurrent Claude Code sessions across projects.

The SDK gives plugin authors a sandboxed `PluginContext` with 13 capability interfaces, a CLI for scaffolding and packaging, and an Electron-based dev shell for offline development with hot-reload and mock APIs.

## Features

<table>
<tr>
<td width="50%">

**Type-Safe Manifest v2**

Full TypeScript types and Zod validators for the plugin manifest format. Catches errors at build time, not install time.

</td>
<td width="50%">

**CLI Toolchain**

`amc-plugin create` scaffolds a new plugin from three templates. `build`, `validate`, and `package` handle the rest of the lifecycle.

</td>
</tr>
<tr>
<td>

**13 Sandboxed APIs**

Storage, database, sessions, AI, filesystem, HTTP, cron, CLI endpoints, sidebar, toasts, events, settings, and logging — all scoped per-plugin.

</td>
<td>

**Dev Shell with Hot-Reload**

Standalone Electron shell loads your plugin UI in a webview with a full `MockPluginContext`. File changes trigger automatic recompile and reload.

</td>
</tr>
<tr>
<td>

**Three Starter Templates**

`basic` (UI only), `with-backend` (UI + backend module), `full` (UI + backend + cron + CLI endpoints) — pick the right starting point.

</td>
<td>

**Banned Import Scanner**

Build and validate commands scan compiled output for forbidden imports (`electron`, `child_process`, `better-sqlite3`, `worker_threads`) to enforce the sandbox boundary.

</td>
</tr>
</table>

## Quick Start

```bash
# 1. Install the CLI globally
npm install -g @agent-mc/plugin-cli

# 2. Scaffold a new plugin
amc-plugin create my-plugin --template with-backend

# 3. Develop with hot-reload
cd my-plugin
npm run dev

# 4. Build and validate
npm run build
amc-plugin validate

# 5. Package for distribution
amc-plugin package
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
| `sessions` | `PluginSessions` | Create and manage AMC sessions (`create`, `sendMessage`, `getStatus`, `stop`) |
| `ai` | `PluginAi` | Send messages to Claude API (`generateMessage`, `generateTitle`) |
| `fs` | `PluginFs` | Scoped filesystem access (`readFile`, `writeFile`, `exists`, `listDir`, `deleteFile`) |
| `http` | `PluginHttp` | HTTP client (`fetch` wrapper) |
| `cron` | `PluginCron` | Schedule recurring tasks (`register`, `unregister`, `isRegistered`) |
| `cli` | `PluginCli` | Register HTTP endpoints on AMC's CLI server (`handle`, `removeHandler`) |
| `sidebar` | `PluginSidebar` | Control sidebar badge and navigation items (`setBadge`, `setItems`) |
| `toast` | `PluginToast` | Show toast notifications and OS-level alerts (`show`, `notify`) |

UI plugins also get `window.AgentMC` — a browser-side bridge exposing `storage`, `db`, `settings`, `theme`, `toast`, `session`, `ai`, `export`, `project`, `sidebar`, and `assets`.

## Plugin Backend Lifecycle

Backend modules export an `activate` function that receives `PluginContext` and returns a `PluginBackend`:

```typescript
import type { PluginActivate } from '@agent-mc/plugin-sdk'

const activate: PluginActivate = (ctx) => {
  return {
    onEnable()  { ctx.log.info('Plugin enabled') },
    onDisable() { ctx.log.info('Plugin disabled') },
    onSettingsChanged(settings) { /* react to config changes */ },
    onAppReady()  { /* AMC finished booting */ },
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
    "icon": "puzzle",             // Lucide icon name
    "category": "productivity",   // planning | development | testing | devops | productivity | other
    "license": { "type": "free" } // free | paid | trial
  },
  "settings": [],
  "storage": { "collections": {} },
  "migrations": [],
  "sdkVersion": "^1.0.0",
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
  },
  "cron": {
    "jobs": [
      { "id": "heartbeat", "label": "Heartbeat", "schedule": "*/30 * * * *", "description": "Health check", "approvalRequired": true }
    ]
  }
}
```

Validated at build time by Zod schemas — see `manifestSchema` in `@agent-mc/plugin-sdk/validators`.

## CLI Commands

| Command | Description |
|---|---|
| `amc-plugin create <name>` | Scaffold a new plugin (templates: `basic`, `with-backend`, `full`) |
| `amc-plugin build` | Compile TypeScript, copy UI assets, validate manifest, scan for banned imports |
| `amc-plugin validate` | Run all validation checks without emitting output (CI-friendly) |
| `amc-plugin package` | Bundle into a `.amcplugin` archive (zip or tar.gz fallback) |

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
amc-plugin-sdk/
├── packages/
│   ├── sdk/                      # @agent-mc/plugin-sdk
│   │   ├── src/
│   │   │   ├── index.ts          # Barrel exports (types + validators)
│   │   │   ├── types/
│   │   │   │   ├── manifest.ts   # PluginManifest, settings, permissions, migrations
│   │   │   │   ├── context.ts    # PluginContext + 13 capability interfaces
│   │   │   │   ├── backend.ts    # PluginBackend lifecycle, PluginActivate
│   │   │   │   └── bridge.ts     # Browser-side AgentMC window bridge
│   │   │   └── validators/
│   │   │       └── manifest.ts   # Zod schema + validateManifest()
│   │   └── package.json
│   │
│   ├── cli/                      # @agent-mc/plugin-cli
│   │   ├── src/
│   │   │   ├── index.ts          # CLI entry point (commander program)
│   │   │   └── commands/
│   │   │       ├── create.ts     # Scaffold with templates + prompts
│   │   │       ├── build.ts      # Compile + validate + banned-import scan
│   │   │       ├── validate.ts   # CI-friendly validation checks
│   │   │       └── package.ts    # .amcplugin archive bundler
│   │   └── package.json
│   │
│   └── dev-shell/                # @agent-mc/plugin-dev-shell
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

## Getting Started

### Prerequisites

- **Node.js** >= 18
- **pnpm** (for monorepo development)

### Install & Build

```bash
# Clone the repo
git clone https://github.com/jlstradingco/amc-plugin-sdk.git
cd amc-plugin-sdk

# Install dependencies
pnpm install

# Build all packages
pnpm build

# Run all tests
pnpm test
```

### Development

```bash
# Build a specific package
pnpm --filter @agent-mc/plugin-sdk build

# Watch mode for the CLI
pnpm --filter @agent-mc/plugin-cli dev

# Run SDK tests
pnpm --filter @agent-mc/plugin-sdk test
```

### Using in a Plugin Project

```bash
npm install @agent-mc/plugin-sdk --save-dev
```

Import types for backend modules:

```typescript
import type { PluginActivate, PluginContext } from '@agent-mc/plugin-sdk'
```

Import types for UI code (browser-side bridge):

```typescript
import type { AgentMC } from '@agent-mc/plugin-sdk/browser'
```

Import validators for CI or custom tooling:

```typescript
import { validateManifest } from '@agent-mc/plugin-sdk/validators'
```

## Permissions

Plugins declare required permissions in `manifest.json`. AMC enforces these at runtime:

| Permission | Grants access to |
|---|---|
| `storage` | `ctx.storage` and `ctx.db` |
| `sessions` | `ctx.sessions` |
| `ai` | `ctx.ai` |
| `network` | `ctx.http` |
| `cron` | `ctx.cron` |
| `cli` | `ctx.cli` |
| `notifications` | `ctx.toast.notify()` (OS-level notifications) |

## Documentation

Full documentation is available at the [AMC Plugin SDK docs site](https://jlstradingco.github.io/amc-plugin-sdk/), covering:

- **[Getting Started](https://jlstradingco.github.io/amc-plugin-sdk/guide/getting-started)** — scaffold, build, and install your first plugin
- **[API Reference](https://jlstradingco.github.io/amc-plugin-sdk/api/)** — all 13 capability interfaces documented
- **[Publishing](https://jlstradingco.github.io/amc-plugin-sdk/guide/publishing)** — submit to the AMC Marketplace
- **[Examples](https://jlstradingco.github.io/amc-plugin-sdk/examples/)** — four reference plugins with full source

## License

[MIT](LICENSE)
