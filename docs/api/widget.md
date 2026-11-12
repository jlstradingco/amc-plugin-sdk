# Widget

A live widget drawn by Omniscio: a number, a short label and a status tone in the titlebar, and in the widget sidebar also lists, charts, notes, progress bars and buttons. You can update it at any time.

**Availability:** Webview only (`Omniscio.widget`). There is no `ctx.widget`.
**Required Permissions:** `chrome` **and** `chrome.widget`

::: tip You send data, Omniscio draws it
Omniscio owns the titlebar, so a widget is a **description**, not a drawing. You choose a shape, a few short pieces of text, a tone that says what the widget *means* and an icon *name*. The host renders every pixel. There is no way to pass markup, a colour or an image, which is what stops a plugin from imitating the app inside the app's own chrome.
:::

## Permissions

`chrome.widget` must be declared together with `chrome`. A manifest with `chrome.widget` alone fails `omniscio-plugin validate`, as it fails Omniscio's own check. Omniscio will not infer one from the other: the consent card the user reads has to match the permissions your plugin holds.

```json
{
  "permissions": ["chrome", "chrome.widget"],
  "ui": {
    "entryPoint": "ui/index.html",
    "widget": { "entryPoint": "ui/widget.html" }
  }
}
```

## Methods

### `set(spec: WidgetSpec, selector?: { widgetId: string }): Promise<void>`

Show a widget, or replace what it shows. Every call **replaces** that widget's previous spec.

- `widgetId` is the `id` of one of your [`ui.widgets`](#sidebar-widgets) entries. Leave it out to mean the first declared widget, or your only widget when you declare none.
- Calls coalesce to **one update per 250 ms** per widget; the last spec in a burst wins. Call it whenever your state changes.
- Sending an identical spec again is a no-op.
- A spec that breaks a bound below is rejected, not trimmed.

### `clear(selector?: { widgetId: string }): Promise<void>`

Remove a widget's data. Clear it when you have nothing true to say, rather than showing a placeholder that looks like data.

### `action(request: { action, target }): Promise<WidgetActionResult>`

Ask Omniscio to do something for the user from inside your page — the same [actions a button can ask for](#buttons). Only a page whose widget is in the user's sidebar can ask, and Omniscio asks the user **every time** in its own dialog, except for `open-place`.

The result's `status` is one of:

| `status` | Meaning |
|---|---|
| `ran` | It ran. `summary` says what happened |
| `needs-confirmation` | Omniscio is asking the user now. Your page is not told their answer |
| `refused` | It did not run. `reason` and a readable `message` say why (for example `rate-limited` or `bad-target`) |
| `expired` | The request went stale before the user answered |

## `WidgetSpec`

A spec is either one of the five **compact** shapes, which draw everywhere, or one of the four [rich shapes](#rich-shapes), which the sidebar draws in full.

```typescript
interface CompactWidgetSpec {
  shape: 'stat' | 'pill' | 'dot' | 'gauge' | 'sparkline'
  value?: string      // at most 8 characters
  label?: string      // at most 16 characters
  tooltip?: string    // at most 120 characters
  tone?: 'neutral' | 'running' | 'needs-you' | 'error' | 'ember' | 'accent'
  icon?: WidgetIconName // an icon name from Omniscio's allow-list (see Icons)
  progress?: number   // 0 to 1, for the gauge shape
  series?: number[]   // up to 32 finite numbers, for the sparkline shape
  buttons?: WidgetButton[] // up to 3, drawn under the widget in the sidebar
  panel?: 'popover' | 'none'
}
```

Only `shape` is required.

| Field | Notes |
|---|---|
| `shape` | One of five host-drawn shapes: `stat` (a number and label), `pill`, `dot`, `gauge` (uses `progress`), `sparkline` (uses `series`) |
| `value` | Headline text, **8 characters max** |
| `label` | Caption, **16 characters max** |
| `tooltip` | Hover text, 120 characters max |
| `tone` | What the widget means. See below |
| `icon` | A name from the allow-list below. 1-50 characters of letters, digits and `-` |
| `progress` | A number from 0 to 1 |
| `series` | At most 32 numbers, each finite (no `NaN` or `Infinity`) |
| `buttons` | Up to 3 [buttons](#buttons) Omniscio draws under the widget in the sidebar |
| `panel` | `'popover'` (default) opens a popover on click; `'none'` makes a pure, non-clickable indicator |

### Rich shapes

The widget sidebar has room for more than a number. These four shapes share `tooltip`, `tone`, `icon`, `buttons` and `panel` with the compact ones, add an optional `title` (up to 24 characters) drawn above the widget, and carry their own data. In the titlebar, which has room for a compact face only, Omniscio draws a compact version of them.

| Shape | Data |
|---|---|
| `list` | `items`: 1 to 8 rows, each a `label` (up to 40 characters), an optional `detail` (up to 60) and an optional `tone` |
| `chart` | `series`: 2 to 32 finite numbers, drawn as a line chart |
| `note` | `text`: 1 to 280 characters of plain text |
| `progress` | `progress`: 0 to 1, with an optional `label` (up to 16) and `value` (up to 8) |

```typescript
await amc.widget.set({
  shape: 'list',
  title: 'Today',
  items: [
    { label: 'Stand-up', detail: '9:30' },
    { label: 'Release review', detail: '14:00', tone: 'needs-you' },
  ],
})
```

### Buttons

A button is data too: you name it and say what it asks for, and Omniscio draws it and runs it through its own action door. A widget has at most 3.

```typescript
interface WidgetButton {
  id: string     // lowercase letters, digits and hyphens, 1 to 32 characters, unique in the widget
  label: string  // 1 to 24 characters
  action: 'open-place' | 'send-quick-reply' | 'run-automation' | 'run-recipe' | 'start-session'
  target: string // what the action acts on, 1 to 200 characters
}
```

| `action` | What it does | `target` | Asks the user first? |
|---|---|---|---|
| `open-place` | Opens a place in Omniscio | An `omniscio://` link, such as `omniscio://inbox` | No |
| `send-quick-reply` | Sends one of the user's saved replies to a session | The session id and the saved reply id, joined by `#` | Yes |
| `run-automation` | Runs one of the user's automations | The automation's id or name | Yes |
| `run-recipe` | The same as `run-automation` | The automation's id or name | Yes |
| `start-session` | Starts a new session, which costs money | The project's name | Yes |

A target Omniscio cannot reach is refused with `bad-target`, and a link can never start a session.

When a button asks first, the dialog offers **Don't ask again for this button**. That approval covers only that widget, that button and that exact action and target; the user can take it back in Settings, and it is cancelled if a later spec changes what the button asks for. Every action is also rate-limited, and a page can never run one without going through the same door.

### Why the text is so short

The 8 and 16 character caps are an anti-phishing control, not a layout choice. Together they cannot hold a sentence such as "Session expired, sign in", so a plugin cannot put a convincing system message in the app's titlebar. They will not be raised for cosmetic reasons; design for a number and a short phrase, and put detail in the tooltip and the popover.

### Tones

You pick a **meaning**; Omniscio picks the colour, so a plugin cannot paint itself the red that the app reserves for real errors.

| Tone | Use it for |
|---|---|
| `neutral` | Plain information |
| `running` | Something is working or healthy |
| `needs-you` | The user should look at this |
| `error` | A real failure |
| `ember` | Waiting or parked (for example capacity) |
| `accent` | A highlight with no good/bad meaning |

### Icons

`icon` is a **name**, never a URL, data URI or SVG. Omniscio maps the name through a short allow-list and draws its own glyph. A name that is not on the list draws the generic `Puzzle` glyph. Names are case-sensitive:

`Puzzle`, `Bookmark`, `Star`, `Bell`, `Folder`, `FileText`, `Search`, `Zap`, `Heart`, `Tag`, `Calendar`, `Clock`, `Code`, `Terminal`, `Package`, `ListChecks`, `Wand2`, `Sparkles`, `ShieldCheck`

The list is small on purpose. It excludes the icons Omniscio uses for its own account and settings controls so a plugin cannot sit its icon next to those and pass for the app. It can only change in an Omniscio release. The SDK's `WidgetIconName` type is generated from the same list, so an icon name the titlebar cannot draw is a type error when you build.

## Sidebar widgets

The widget sidebar is a panel of widgets the user arranges beside their sessions. A plugin offers widgets for it in `ui.widgets`; the user adds them from the sidebar's **Add** picker, where each one is listed under your plugin's name. Without `ui.widgets`, your plugin offers one tile named after the plugin, which is what `set` without a `widgetId` updates.

```json
{
  "permissions": ["chrome", "chrome.widget"],
  "ui": {
    "entryPoint": "ui/index.html",
    "widgets": [
      { "id": "today", "title": "Today", "kind": "tile", "defaultSize": { "w": 4, "h": 3 }, "faces": ["list"] },
      { "id": "board", "title": "Board", "kind": "panel", "defaultSize": { "w": 4, "h": 6 } }
    ]
  }
}
```

| Field | Notes |
|---|---|
| `id` | Unique in the plugin: lowercase letters, digits and hyphens, up to 32 characters. Pass it as `widgetId` |
| `title` | The name the picker and the widget's frame show, 1 to 60 characters |
| `kind` | `tile` draws the data you send with `set`. `panel` shows your plugin's own panel page inside the widget |
| `defaultSize` | The size it starts at: `w` is 1 to 4 columns, `h` is 1 to 40 rows |
| `faces` | For a tile only: the shapes it may send. A panel declares none |

- Declare 1 to 8 widgets. `ui.widgets` replaces the older `ui.widget`, and a manifest cannot set both.
- A **panel** widget runs your panel page with exactly your plugin's permissions, nothing more. It can ask for actions with [`action`](#methods).
- Omniscio always draws the widget's frame — its name and your plugin's icon — outside your content, so a widget cannot pass for another plugin or for the app.
- A hidden sidebar pauses its widgets' pages at once and unloads them after a few minutes, so your page may start again when the user reopens it. Send your spec as soon as the page loads, rather than only when your data changes.

```typescript
await amc.widget.set(
  { shape: 'progress', title: 'Release', progress: 0.6, label: 'checks', value: '12/20' },
  { widgetId: 'today' },
)
```

The [Sidebar Widgets Demo](../examples/#sidebar-widgets-demo) offers a tile and a panel, with a button and an in-page action.

## Clicking the widget

- With **`ui.widget.entryPoint`** in your manifest, a click opens a **320 x 256** popover showing that page. The path must be plugin-relative: no URL, no leading `/` or `\`, no drive letter and no `..` segment. Omniscio draws a bar naming your plugin above the frame, outside your page, so the page cannot hide or restyle it.
- **Without it**, a click opens your plugin's own panel.
- With **`panel: 'none'`**, the widget is an indicator and nothing opens.

`omniscio-plugin validate` checks that the `ui.widget.entryPoint` file exists, and `omniscio-plugin package` ships it. Keep it under `ui/` in a flat plugin.

## Example

```typescript
import type { Omniscio, WidgetTone } from '@omniscio/plugin-sdk/browser'

const amc = window.Omniscio ?? window.AgentMC

async function publish(failing: number, total: number) {
  if (total === 0) {
    // Nothing worth saying: remove the widget rather than showing a 0.
    await amc.widget.clear()
    return
  }
  const tone: WidgetTone = failing > 0 ? 'needs-you' : 'running'
  await amc.widget.set({
    shape: 'stat',
    value: String(failing),
    label: 'failing checks',
    tone,
    icon: 'ShieldCheck',
    tooltip: `${failing} of ${total} checks failing`,
  })
}
```

## Notes

- Webview only. A backend that needs a widget should send the data to its webview with [`ctx.events`](./events).
- `@omniscio/plugin-sdk/browser` exports `WidgetSpec`, `CompactWidgetSpec`, `RichWidgetSpec` (and each rich shape's own spec), `WidgetButton`, `WidgetActionId`, `WidgetActionResult`, `WidgetShape`, `RichWidgetShape`, `WidgetTone` and `BridgeWidget`. `PluginManifestWidget` types one `ui.widgets` entry.

## Testing

The dev shell has no titlebar and the SDK ships no webview mock, so `Omniscio.widget` is not available there. Guard the call (`if (amc.widget?.set)`) so your page still loads, and test the widget inside Omniscio. See the [dev shell guide](../guide/dev-shell).
