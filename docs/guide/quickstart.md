# Quickstart: Hello World in 5 Minutes

Go from nothing to a running AMC plugin — with a live UI and a working toast — in five minutes. No prior plugin experience needed.

::: tip What you'll build
A tiny "Hello World" plugin: a sidebar panel that greets you and pops a toast when you click a button. You'll see it running in the dev shell with hot-reload.
:::

## Before you start (30 seconds)

You need two things:

- **[Node.js](https://nodejs.org/) v18+** — check with `node --version`
- **[Agent Mission Control](https://github.com/jlstradingco/agent-mission-control)** — only required for the final "install for real" step; the dev shell runs without it

That's it. No accounts, no config.

## 1. Install the CLI (1 min)

```bash
npm install -g @agent-mc/plugin-cli
```

Confirm it's on your PATH:

```bash
amc-plugin --version
```

## 2. Scaffold the plugin (1 min)

Skip the interactive prompts — generate everything in one line:

```bash
amc-plugin create hello-world \
  --display-name "Hello World" \
  --description "My first AMC plugin" \
  --author "Your Name" \
  --icon smile
```

Then step in:

```bash
cd hello-world
```

You now have a complete, valid plugin:

```
hello-world/
  manifest.json        # metadata + permissions
  package.json
  tsconfig.json
  src/ui/
    index.html         # your panel's markup
    plugin.ts          # your panel's logic
```

## 3. Make it say hello (2 min)

Open `src/ui/index.html` and replace the `<body>` with a heading and a button:

```html
<body>
  <h1 id="greeting">Loading…</h1>
  <button id="hello-btn">Say hello</button>
  <script src="plugin.js"></script>
</body>
```

Now open `src/ui/plugin.ts` and make it talk to AMC through the `AgentMC` bridge:

```typescript
import type { AgentMC } from '@agent-mc/plugin-sdk/browser'

// The bridge is injected on `window` by AMC (and by the dev shell).
const amc = (window as unknown as { AgentMC: AgentMC }).AgentMC

const greeting = document.getElementById('greeting') as HTMLHeadingElement
const button = document.getElementById('hello-btn') as HTMLButtonElement

greeting.textContent = 'Hello from your first plugin! 👋'

button.addEventListener('click', () => {
  amc.toast.show({ type: 'success', message: 'It works!' })
})
```

That's the whole plugin. `amc.toast.show()` needs **no permission** — it's available to every plugin — so `manifest.json` doesn't need to change.

## 4. See it run (30 sec)

Launch the dev shell. It builds your plugin, opens it in an Electron window with a mock `AgentMC`, and hot-reloads on every save:

```bash
npm run dev
```

Click **Say hello** — a success toast appears. Edit the greeting text, save, and watch the window refresh instantly.

::: tip The dev shell mocks the APIs
`npm run dev` doesn't need AMC installed — it stubs the `AgentMC` bridge so you can iterate fast. See [Dev Shell](./dev-shell) for what's mocked.
:::

## 5. Install it in AMC for real (optional, 1 min)

When you're happy, bundle and install it:

```bash
npm run package        # → hello-world-1.0.0.amcplugin
```

Then in **Agent Mission Control**: **Settings → Plugins → Install from file**, pick the `.amcplugin`, and your panel shows up in the sidebar.

## What just happened

- **`manifest.json`** declared your plugin to AMC (id, name, permissions, UI entry).
- **`src/ui/`** is your panel — plain HTML + TypeScript, no framework required.
- **`window.AgentMC`** is the bridge: the typed gateway to every AMC API. `toast` is free; other APIs are unlocked by [permissions](./permissions).
- **`amc-plugin dev`** gave you a mock-backed, hot-reloading loop; **`package`** produced the installable artifact.

## Next steps

- [Getting Started](./getting-started) — the full walkthrough (templates, validate, publish)
- [Project Structure](./project-structure) — every file, explained
- [Permissions](./permissions) — unlock storage, sessions, AI, HTTP, and more
- [API Reference](/api/) — the complete `AgentMC` surface
- [Examples](/examples/) — seven runnable plugins to learn from
