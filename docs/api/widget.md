# Widget

A live status widget in the Omniscio titlebar: a number, a short label and a status tone that you can update at any time.

**Availability:** Webview only (`AgentMC.widget`). There is no `ctx.widget`.
**Required Permissions:** `chrome` **and** `chrome.widget`

::: tip You send data, Omniscio draws it
Omniscio owns the titlebar, so a widget is a **description**, not a drawing. You choose a shape, a few short pieces of text, a tone that says what the widget *means* and an icon *name*. The host renders every pixel. There is no way to pass markup, a colour or an image, which is what stops a plugin from imitating the app inside the app's own chrome.
:::

## Permissions

`chrome.widget` must be declared together with `chrome`. A manifest with `chrome.widget` alone fails `amc-plugin validate`, as it fails Omniscio's own check. Omniscio will not infer one from the other: the consent card the user reads has to match the permissions your plugin holds.

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

### `set(spec: WidgetSpec): Promise<void>`

Show the widget, or replace what it shows. Every call **replaces** the previous spec, and a plugin has one widget.

- Calls coalesce to **one update per 250 ms**; the last spec in a burst wins. Call it whenever your state changes.
- Sending an identical spec again is a no-op.
- A spec that breaks a bound below is rejected, not trimmed.

### `clear(): Promise<void>`

Remove the widget from the titlebar. Clear it when you have nothing true to say, rather than showing a placeholder that looks like data.

## `WidgetSpec`

```typescript
interface WidgetSpec {
  shape: 'stat' | 'pill' | 'dot' | 'gauge' | 'sparkline'
  value?: string      // at most 8 characters
  label?: string      // at most 16 characters
  tooltip?: string    // at most 120 characters
  tone?: 'neutral' | 'running' | 'needs-you' | 'error' | 'ember' | 'accent'
  icon?: string       // an icon name from Omniscio's allow-list
  progress?: number   // 0 to 1, for the gauge shape
  series?: number[]   // up to 32 finite numbers, for the sparkline shape
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
| `panel` | `'popover'` (default) opens a popover on click; `'none'` makes a pure, non-clickable indicator |

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

The list is small on purpose. It excludes the icons Omniscio uses for its own account and settings controls so a plugin cannot sit its icon next to those and pass for the app. It can only change in an Omniscio release, so treat this list as a snapshot and check the release you target.

## Clicking the widget

- With **`ui.widget.entryPoint`** in your manifest, a click opens a **320 x 256** popover showing that page. The path must be plugin-relative: no URL, no leading `/` or `\`, no drive letter and no `..` segment. Omniscio draws a bar naming your plugin above the frame, outside your page, so the page cannot hide or restyle it.
- **Without it**, a click opens your plugin's own panel.
- With **`panel: 'none'`**, the widget is an indicator and nothing opens.

`amc-plugin validate` checks that the `ui.widget.entryPoint` file exists, and `amc-plugin package` ships it. Keep it under `ui/` in a flat plugin.

## Example

```typescript
import type { AgentMC, WidgetTone } from '@agent-mc/plugin-sdk/browser'

const amc = (window as unknown as { AgentMC: AgentMC }).AgentMC

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
- `@agent-mc/plugin-sdk/browser` exports `WidgetSpec`, `WidgetShape`, `WidgetTone` and `BridgeWidget`.

## Testing

The dev shell has no titlebar and the SDK ships no webview mock, so `AgentMC.widget` is not available there. Guard the call (`if (amc.widget?.set)`) so your page still loads, and test the widget inside Omniscio. See the [dev shell guide](../guide/dev-shell).
