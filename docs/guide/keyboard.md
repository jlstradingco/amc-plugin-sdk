# Keyboard

Listen for a keystroke in your panel — one listener, honestly torn down, and never a key stolen from
someone typing.

Your panel runs in its own document. Omniscio's own keyboard handling does not reach it, and its
modal and shortcut machinery is not available to you, so a panel that wants a shortcut has to
listen for the key itself. This page is the one supported way to do that.

::: warning Never a raw listener
Do not call `addEventListener('keydown', …)` on your own document or window. The host's keyboard
check flags a raw key listener in a plugin bundle, and a plugin that hand-rolls one has to be added
to an exemption list that is only allowed to shrink. Import the primitive instead.
:::

```ts
import { onKey, isEditableTarget, isComposingKey } from '@omniscio/plugin-sdk/keyboard'
```

The `./keyboard` entry has no dependencies, so a panel that imports it never pulls the rest of the
SDK with it.

## `onKey(handler, options?)`

Installs one listener and returns the function that removes it.

```ts
const dispose = onKey((event) => {
  if (event.key !== 'k' || !(event.ctrlKey || event.metaKey)) return
  event.preventDefault()
  openCommandPalette()
})

window.addEventListener('unload', dispose, { once: true })
```

| Option | Type | Default | Meaning |
| --- | --- | --- | --- |
| `target` | window, document or an element | the global window | Where the listener is installed |
| `eventType` | `'keydown'` or `'keyup'` | `'keydown'` | Which event to listen for |
| `capture` | boolean | `false` | Install on the capture phase |
| `enabled` | boolean | `true` | When false, nothing is installed and the returned function does nothing |

The returned function is safe to call twice, so a component that cleans up on unmount and again on
teardown needs no guard of its own. Calling `onKey` with no target outside a browser throws a plain
error naming the missing target, rather than silently listening nowhere.

## `isEditableTarget(target)`

Answers whether the keystroke belongs to a text control, so your shortcut can stand down and let the
typing through. Pass it the event's own target.

```ts
onKey((event) => {
  if (isEditableTarget(event.target)) return
  if (event.key === '/') focusSearch()
})
```

It answers true for a text input, a textarea, anything inside a `contenteditable` region, and
anything inside a Monaco-style editor host. It answers false for a select, a button, the page body,
and anything it cannot recognize as an element.

This is the same rule Omniscio's own interface uses, held to it by a test, so a key behaves the same
way in your panel as in the app around it. Like that rule, it does not look inside a shadow root, so
an input your panel renders inside one is not recognized as a text field.

## `isComposingKey(event)`

Answers whether an input method owns the keystroke right now. While a person is composing Chinese,
Japanese or Korean text, the letters they type are not commands; run your shortcut only when this
answers false.

```ts
onKey((event) => {
  if (isComposingKey(event)) return
  if (event.key === 'Escape') closeOverlay()
})
```

It answers true for the standard composition flag and for the legacy composition code an older
WebKit still reports.

## What stays yours

The SDK installs the listener; it does not decide what a key means. Chords, multi-key sequences,
which control has focus, and your panel's own modes all stay in your code. A typical panel keeps one
resolver and one listener:

```ts
onKey((event) => {
  if (isComposingKey(event) || isEditableTarget(event.target)) return
  if (event.defaultPrevented) return
  const action = resolveAction(event)
  if (action && action.run()) event.preventDefault()
})
```

## Migrating an existing panel

1. Replace the `addEventListener` / `removeEventListener` pair with `onKey`, and call the function it
   returns where you used to call `removeEventListener`.
2. Delete any local `isEditableTarget` helper and import the SDK's — the local copies disagree with
   each other and with the app.
3. Keep your own key resolution. The primitive is not a keymap.
4. Remove your file's row from the host's keyboard exemption list once its last raw listener is gone.

## Panels compiled into the app

A plugin whose front-end is compiled INTO the app's renderer — rather than running in its own
webview — is not this page's audience. It shares the app's document, so it uses the app's own
keyboard hooks, which also stand down while a modal is open. This primitive is for a panel that owns
its own document.
