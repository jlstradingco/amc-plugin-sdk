# Sidebar Widgets Demo

Minimal Omniscio plugin that offers **two widgets for the widget sidebar** (`chrome.widget`).

## What It Shows

- `ui.widgets` — a plugin offering more than one widget, each with its own id, title, kind and starting size
- A **tile** (`agenda`) that draws the data the page sends, as a rich `list` or a compact `stat`
- A **panel** (`controls`) that shows the plugin's own page inside the sidebar, with exactly the plugin's permissions
- `Omniscio.widget.set(spec, { widgetId })` and `Omniscio.widget.clear({ widgetId })` — updating one widget by its id
- A widget **button** (`open-place`), which Omniscio draws and runs through its action door
- `Omniscio.widget.action(request)` — asking Omniscio to act from inside the page

The manifest needs both `chrome` and `chrome.widget` in `permissions`.

## Layout

Plain JavaScript with no build step:

```
manifest.json
ui/index.html
ui/plugin.js
```

## Running

```bash
cd examples/sidebar-widgets-demo
npm install
npm run validate
npm run package
```

Install the packaged plugin in Omniscio, turn on the widget sidebar in Settings, then add **Agenda** and **Demo controls** from the sidebar's **Add** button. The dev shell has no widget sidebar, so try it inside Omniscio.
