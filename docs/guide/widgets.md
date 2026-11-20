# Build a Widget

A widget is a small live view of something your plugin knows — a count, a status, a short list — that Omniscio draws in its titlebar and in its widget sidebar. This page takes you from an empty plugin to a widget that appears the moment your page loads, then through the sidebar, the dev loop and shipping it.

## Three ways to get a widget

| If you want to | Use | Start at |
|---|---|---|
| Describe a widget and have Omniscio build it for you, with no code | The Widget Builder | [Widget Builder](https://docs.omniscio.com/library/widget-builder.html) |
| Ship a widget as part of a plugin | This page | below |
| Show a widget from your own script through the local API | Script widgets | [Script Widgets](https://docs.omniscio.com/library/script-widgets.html) |

The whole authoring path, written for someone who does not code, is [Make a Widget](https://docs.omniscio.com/library/make-a-widget.html).

## What a widget is

You send a **description**; Omniscio draws every pixel. You choose a shape, a few short pieces of text, a tone that says what the widget *means* and an icon name. There is no way to pass markup, a colour or an image — that is what keeps a plugin from imitating the app inside the app's own chrome.

- **Shapes, tones and icons** are a fixed, host-drawn set: five compact shapes that draw everywhere, four rich ones the sidebar draws in full, a tone that says what the widget *means* rather than a colour, and a name from a small icon allow-list. The page that owns those lists is [Widget](../api/widget.md) — read them there rather than from memory, because every limit and every name lives on that page.

## Quick start: a number in the titlebar

A plugin needs both the `chrome` permission and its own `chrome.widget` permission. One alone is refused.

`manifest.json`:

```json
{
  "permissions": ["chrome", "chrome.widget"],
  "ui": { "entryPoint": "ui/index.html" }
}
```

`src/ui/plugin.ts`:

```typescript
import type { Omniscio } from '@omniscio/plugin-sdk/browser'

const amc = window.Omniscio ?? window.AgentMC

export function render(open: number) {
  void amc.widget.set({
    shape: 'stat',
    value: String(open),
    label: 'open items',
    tone: open > 0 ? 'needs-you' : 'running',
    icon: 'ListChecks',
    tooltip: `${open} items waiting`,
  })
}

if (amc?.widget?.set) render(3)
```

Send the spec as soon as your page loads, not only when something changes: Omniscio pauses a hidden sidebar widget and unloads it after a few minutes, and the page starts again when the person comes back.

Update it whenever your state changes. Rapid calls are coalesced per widget so a burst costs one redraw, and sending an identical spec again does nothing. When you have nothing true to say, call `amc.widget.clear()` rather than showing a zero.

## Put it in the widget sidebar

The widget sidebar is the panel beside a person's sessions. A plugin offers widgets for it under `ui.widgets` — one entry per widget, each with its own id, title, kind and starting size — and the person adds them from the sidebar's **Add** picker.

```json
{
  "permissions": ["chrome", "chrome.widget"],
  "ui": {
    "entryPoint": "ui/index.html",
    "widgets": [
      { "id": "today", "title": "Today", "kind": "tile", "defaultSize": { "w": 4, "h": 3 }, "faces": ["list", "stat"] },
      { "id": "board", "title": "Board", "kind": "panel", "defaultSize": { "w": 4, "h": 6 } }
    ]
  }
}
```

- A **tile** draws the data you send with `set`.
- A **panel** shows your plugin's own panel page inside the widget, with exactly your plugin's permissions.
- The **titlebar** draws one widget per plugin: your first declared one.

Target a specific widget by passing its id:

```typescript
await amc.widget.set(
  { shape: 'progress', title: 'Release', progress: 0.6, label: 'checks', value: '12/20' },
  { widgetId: 'today' },
)
```

A sidebar tile needs the widget sidebar switched on. When it is off, the person has nowhere to put the tile, so keep your titlebar widget working on its own.

## Rich shapes and buttons

A rich shape carries its own data — a list of rows, a series for a chart, a note's text, a progress value — and a widget may also carry **buttons**. A button is data too: you name it and say what it asks for, and Omniscio draws it and runs it through its own action door, asking the person first wherever the action could spend money or touch a session.

```typescript
await amc.widget.set({
  shape: 'list',
  title: 'Today',
  items: [
    { label: 'Stand-up', detail: '9:30' },
    { label: 'Release review', detail: '14:00', tone: 'needs-you' },
  ],
  buttons: [{ id: 'open-inbox', label: 'Open inbox', action: 'open-place', target: 'omniscio://inbox' }],
})
```

The full button and action list, and what each one asks the person, is in [Widget](../api/widget.md#buttons) — the same page that owns every limit.

## See it while you work

- `npm run dev` opens the **dev shell** with a **Sidebar preview** that draws the latest spec from `widget.set` and from `ctx.widget`. It shows plain problems for a spec that breaks a limit, naming the field and the limit, and rejects the call as Omniscio would.
- `validateWidgetSpec` checks a spec in your own tests; an empty list of problems means Omniscio would accept it.
- `createTestContext` from `@omniscio/plugin-sdk/testing` records what your backend sent: `widgetSpecs` holds the latest spec per widget and `widgetCleared` lists every cleared widget.

```typescript
import { validateWidgetSpec } from '@omniscio/plugin-sdk'

const problems = validateWidgetSpec({ shape: 'stat', value: 'much too long to fit' })
// [{ path: 'value', message: '...' }]
```

The dev shell has no titlebar and no widget sidebar, so a real-titlebar widget only appears inside Omniscio. The sidebar example below runs in the dev shell's preview.

## Ship it

```bash
omniscio-plugin validate
omniscio-plugin package
```

Then in Omniscio: **Settings → Plugins → Install from file**, pick the `.amcplugin`, and press Load. A plugin widget appears in the titlebar by its first declared entry, and in the widget sidebar from its **Add** picker.

## When nothing shows

- **Both permissions are missing one half.** `chrome.widget` must be declared together with `chrome`, and the validate command refuses it alone.
- **The page never sent a spec.** Send it on load; a hidden sidebar page is paused and may start again later.
- **The text is too long.** A spec that breaks a limit is rejected, not trimmed — check it with `validateWidgetSpec`.
- **Your second widget is the one you want in the titlebar.** The titlebar draws the first declared entry; reorder `ui.widgets`.
- **A tile is missing.** A sidebar tile only appears once the person adds it from **Add**, and only with the widget sidebar switched on.
- **The icon is a puzzle piece.** The icon name is not on the allow-list — names are case-sensitive and the list is small on purpose.

## Next

- [Widget API reference](../api/widget.md) — every shape, tone, icon, limit and button action.
- [Widget Demo](../examples/#widget-demo) — a titlebar widget across the five compact shapes.
- [Sidebar Widgets Demo](../examples/#sidebar-widgets-demo) — a tile and a panel, with a button and an in-page action.
- [Dev Shell](./dev-shell) — what the preview mocks and what it does not.
