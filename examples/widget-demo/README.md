# Widget Demo

Minimal AMC plugin demonstrating the **titlebar widget** (`chrome.widget`).

## What It Shows

- `AgentMC.widget.set(spec)` — draw or update a widget in the Omniscio titlebar
- `AgentMC.widget.clear()` — remove it
- The five shapes (`stat`, `pill`, `dot`, `gauge`, `sparkline`) and the semantic tones
- `ui.widget.entryPoint` — the popover page that opens when the widget is clicked

The manifest needs both `chrome` and `chrome.widget` in `permissions`.

## Running

```bash
cd examples/widget-demo
npm install
npm run build
```

The dev shell (`npm run dev`) has no titlebar, so the widget only appears inside Omniscio. Install the packaged plugin there to try it.
