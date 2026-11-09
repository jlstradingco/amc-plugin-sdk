# Theming

Make your plugin's panel look like part of Omniscio, in the user's own theme, with no extra code.

Your panel runs in its own document, so it cannot read Omniscio's stylesheet. Instead, Omniscio sets a set of **CSS custom properties** on your page's `:root` before your first paint, and updates them in place whenever the user switches light/dark mode, accent colour, font or corner style. Style with these and your panel follows the user's theme automatically.

::: tip Use the tokens, not `theme.get()`
`Omniscio.theme.get()` is a fixed placeholder (it always answers `mode: 'dark'`). The CSS tokens on this page are the real, live theme.
:::

## Always present

These are set on every plugin page, in every theme.

| Token | Value | Use it for |
|---|---|---|
| `--surface-50` | colour (hex) | The page background end of the scale |
| `--surface-100` | colour (hex) | Raised panels, cards |
| `--surface-200` | colour (hex) | Hover backgrounds, subtle fills |
| `--surface-300` | colour (hex) | Borders and dividers |
| `--surface-400` | colour (hex) | Strong borders, disabled text |
| `--surface-500` | colour (hex) | Placeholder and hint text |
| `--surface-600` | colour (hex) | Secondary text |
| `--surface-700` | colour (hex) | Body text on light surfaces |
| `--surface-800` | colour (hex) | Emphasised text |
| `--surface-900` | colour (hex) | Headings, primary text |
| `--surface-950` | colour (hex) | The text end of the scale |
| `--accent-rgb` | `R G B` (three numbers) | The user's accent colour: `rgb(var(--accent-rgb))`, or with transparency `rgb(var(--accent-rgb) / 0.15)` |

The surface scale flips with the theme: `--surface-50` is always the background end and `--surface-950` the text end, in light and dark mode alike. So `background: var(--surface-50); color: var(--surface-900);` reads well in both.

## Present when the theme provides them

Omniscio sends each of these only when it can resolve it, and drops one that is malformed, so always give a fallback: `var(--panel-radius, 8px)`.

| Token | Value | Use it for |
|---|---|---|
| `--surface-50-rgb` | `R G B` | The same scale as three numbers, for transparency: `rgb(var(--surface-50-rgb) / 0.8)` |
| `--surface-100-rgb` | `R G B` | |
| `--surface-200-rgb` | `R G B` | |
| `--surface-300-rgb` | `R G B` | |
| `--surface-400-rgb` | `R G B` | |
| `--surface-500-rgb` | `R G B` | |
| `--surface-600-rgb` | `R G B` | |
| `--surface-700-rgb` | `R G B` | |
| `--surface-800-rgb` | `R G B` | |
| `--surface-900-rgb` | `R G B` | |
| `--surface-950-rgb` | `R G B` | |
| `--status-agent-rgb` | `R G B` | Something running or working |
| `--status-agent-strong-rgb` | `R G B` | The same, for text or icons on a light fill |
| `--status-needs-you-rgb` | `R G B` | Something waiting for the user |
| `--status-needs-you-strong-rgb` | `R G B` | The same, stronger |
| `--status-error-rgb` | `R G B` | Errors and failures |
| `--status-error-strong-rgb` | `R G B` | The same, stronger |
| `--status-ready-rgb` | `R G B` | Done, healthy, ready |
| `--status-question-rgb` | `R G B` | A question for the user (fill) |
| `--status-question-text-rgb` | `R G B` | A question for the user (text) |
| `--status-approval-rgb` | `R G B` | Something awaiting approval |
| `--status-ember-400-rgb` | `R G B` | Waiting on capacity (light) |
| `--status-ember-500-rgb` | `R G B` | Waiting on capacity |
| `--status-ember-600-rgb` | `R G B` | Waiting on capacity (strong) |
| `--font-family-body` | font stack | Body text |
| `--font-family-brand` | font stack | Headings that carry the Omniscio look |
| `--font-family-mono` | font stack | Code, ids, numbers in tables |
| `--app-font-size` | length | The user's base font size |
| `--panel-radius` | length | Corner radius of cards and panels |
| `--on-accent-color` | colour | Text drawn on top of the accent colour |
| `--on-accent-text-shadow` | shadow | Text shadow for text on the accent colour |
| `--on-accent-icon-shadow` | shadow | Shadow for icons on the accent colour |
| `--btn-accent-fill` | `R G B` | Fill of a primary button |

A name that is not on this page is never set, so `var()` on it silently falls back (or resolves to nothing). Don't invent token names.

## Starter stylesheet

Copy this into your panel's `<style>` and build from it. It uses only the tokens above, with fallbacks that match the dark theme for the instant before tokens arrive.

```css
:root {
  color-scheme: light dark;
}

body {
  margin: 0;
  padding: 16px;
  background: var(--surface-50, #09090b);
  color: var(--surface-900, #f4f4f5);
  font-family: var(--font-family-body, system-ui, sans-serif);
  font-size: var(--app-font-size, 14px);
}

h1,
h2 {
  font-family: var(--font-family-brand, var(--font-family-body, system-ui, sans-serif));
  color: var(--surface-950, #fafafa);
}

.card {
  background: var(--surface-100, #18181b);
  border: 1px solid var(--surface-300, #3f3f46);
  border-radius: var(--panel-radius, 8px);
  padding: 12px;
}

.muted {
  color: var(--surface-600, #a1a1aa);
}

button.primary {
  background: rgb(var(--btn-accent-fill, var(--accent-rgb, 99 102 241)));
  color: var(--on-accent-color, #ffffff);
  text-shadow: var(--on-accent-text-shadow, none);
  border: 0;
  border-radius: var(--panel-radius, 8px);
  padding: 6px 12px;
  cursor: pointer;
}

button.primary:hover {
  filter: brightness(1.08);
}

.badge-error {
  color: rgb(var(--status-error-strong-rgb, 239 68 68));
  background: rgb(var(--status-error-rgb, 239 68 68) / 0.12);
  border-radius: 999px;
  padding: 2px 8px;
}

code {
  font-family: var(--font-family-mono, ui-monospace, monospace);
}
```

## Animations

Two plugin panels can each define an animation with the same name, and the browser keeps only one. Prefix your `@keyframes` names with your plugin id (`@keyframes my-plugin-pulse`) so yours is never replaced.
