# Inbox Demo

Minimal AMC plugin demonstrating the **inbox** API — publishing items into the user's AMC inbox.

## What It Shows

- `AgentMC.inbox.setItems(items)` — publish this plugin's inbox items
- `AgentMC.storage.set/get` — remember the current item list across reloads

## Full-Replace Semantics

`setItems()` **replaces** the plugin's entire inbox item set on every call — it is not append.
To add one item you re-send the whole array; to clear the inbox you call `setItems([])`. This demo
keeps the working list in storage and re-publishes it after every add / remove so the two stay in sync.

## InboxItem Shape

```typescript
interface InboxItem {
  id: string            // stable, plugin-scoped
  title: string
  body?: string
  icon?: string         // lucide icon name
  priority?: 'low' | 'normal' | 'high'
  actionLabel?: string  // label for the row's action button
  actionId?: string     // echoed back to the plugin when the action is clicked
  timestamp?: string    // ISO 8601
}
```

## Permissions

| Permission | Why |
|---|---|
| `inbox` | Publish items to the AMC inbox |
| `storage` | Persist the working item list |

## Running

```bash
cd examples/inbox-demo
npm install
npm run build
npm run dev
```
