<div align="center">

# @agent-mc/plugin-sdk

**TypeScript types, interfaces, and validators for building Agent Mission Control plugins**

[![npm](https://img.shields.io/npm/v/@agent-mc/plugin-sdk?color=cb3837&logo=npm&logoColor=white)](https://www.npmjs.com/package/@agent-mc/plugin-sdk)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.5-3178C6?logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

</div>

---

## Overview

This package provides the type definitions and manifest validators for [Agent Mission Control](https://github.com/jlstradingco/agent-mission-control) (AMC) plugins. It is a dev dependency for plugin projects — it supplies TypeScript interfaces for the sandboxed `PluginContext` your backend code receives, the `AgentMC` browser bridge your UI code uses, and a Zod-powered manifest validator for build-time checks.

## Install

```bash
npm install @agent-mc/plugin-sdk --save-dev
```

## Usage

### Backend types

```typescript
import type { PluginActivate, PluginContext } from '@agent-mc/plugin-sdk'

const activate: PluginActivate = (ctx) => {
  return {
    async onEnable() {
      const data = await ctx.storage.get('config')
      ctx.log.info('Plugin enabled', data)
    },
    async onShutdown() {
      ctx.log.info('Goodbye')
    },
  }
}

export default activate
```

### Browser bridge types

```typescript
import type { AgentMC } from '@agent-mc/plugin-sdk/browser'

declare global {
  interface Window { AgentMC: AgentMC }
}

const settings = await window.AgentMC.settings.getAll()
```

### Manifest validation

```typescript
import { validateManifest } from '@agent-mc/plugin-sdk/validators'

const result = validateManifest(manifest)
if (!result.valid) {
  console.error(result.errors)
}
```

## PluginContext API

Every backend plugin receives a `PluginContext` with these sandboxed capabilities:

| Capability | Interface | Permission | Description |
|---|---|---|---|
| `storage` | `PluginStorage` | `storage` | Key-value store (`get`, `set`, `delete`, `list`) |
| `db` | `PluginDb` | `storage` | SQLite collections (`insert`, `query`, `getById`, `update`, `delete`) |
| `fs` | `PluginFs` | `storage` | Sandboxed filesystem (`readFile`, `writeFile`, `exists`, `listDir`) |
| `sessions` | `PluginSessions` | `sessions` | Create and manage Claude Code sessions |
| `ai` | `PluginAi` | `ai` | Direct AI text generation (`generateMessage`, `generateTitle`) |
| `http` | `PluginHttp` | `network` | Outbound HTTP requests (`fetch`) |
| `cron` | `PluginCron` | `cron` | Scheduled recurring tasks |
| `cli` | `PluginCli` | `cli` | HTTP endpoints on AMC's control server |
| `toast` | `PluginToast` | `notifications`* | In-app toasts and OS notifications |
| `sidebar` | `PluginSidebar` | — | Badge count and navigation items |
| `settings` | `PluginSettings` | — | Read plugin settings (`getAll`, `get`) |
| `log` | `PluginLogger` | — | Scoped logging (`info`, `warn`, `error`, `debug`) |
| `events` | `PluginEvents` | — | Pub/sub event system (`emit`, `on`) |

\* `toast.show()` is always available; only `toast.notify()` (OS-level) requires the `notifications` permission.

## Permissions

Declare in `manifest.json` — AMC shows these at install and enforces at runtime:

```json
{
  "permissions": ["storage", "network", "ai"]
}
```

| Permission | Grants |
|---|---|
| `storage` | `ctx.storage`, `ctx.db`, `ctx.fs` |
| `sessions` | `ctx.sessions` |
| `ai` | `ctx.ai` |
| `network` | `ctx.http` |
| `cron` | `ctx.cron` |
| `cli` | `ctx.cli` |
| `notifications` | `ctx.toast.notify()` |
| `rss` | Access to AMC's built-in RSS feed data |

## Exports

This package provides three entry points:

| Import path | What it provides |
|---|---|
| `@agent-mc/plugin-sdk` | All TypeScript types + `validateManifest()` + `manifestSchema` |
| `@agent-mc/plugin-sdk/browser` | `AgentMC` browser bridge type for UI plugins |
| `@agent-mc/plugin-sdk/validators` | Zod manifest schema and validation function |

## Backend Lifecycle

```typescript
interface PluginBackend {
  onEnable?(): Promise<void> | void
  onDisable?(): Promise<void> | void
  onSettingsChanged?(settings: Record<string, unknown>): Promise<void> | void
  onAppReady?(): Promise<void> | void
  onShutdown?(): Promise<void> | void
}
```

## Documentation

Full guides, API reference, and examples: **[AMC Plugin SDK Docs](https://jlstradingco.github.io/amc-plugin-sdk/)**

- [Getting Started](https://jlstradingco.github.io/amc-plugin-sdk/guide/getting-started) — scaffold your first plugin
- [Manifest Reference](https://jlstradingco.github.io/amc-plugin-sdk/guide/manifest) — full manifest.json spec
- [Permissions](https://jlstradingco.github.io/amc-plugin-sdk/guide/permissions) — what each permission grants
- [API Reference](https://jlstradingco.github.io/amc-plugin-sdk/api/) — all 13 capability interfaces

## License

[MIT](../../LICENSE)
