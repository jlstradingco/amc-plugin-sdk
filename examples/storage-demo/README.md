# Storage Demo

Minimal AMC plugin demonstrating the **storage** (key-value) and **database** (collections) APIs.

## What It Shows

- `AgentMC.storage.set()` / `.get()` — persist user preferences (sort order)
- `AgentMC.db.insert()` — create records in a collection
- `AgentMC.db.query()` — list records with ordering
- `AgentMC.db.delete()` — remove records by ID

## Running

```bash
cd examples/storage-demo
npm install
npm run build
npm run dev
```

## Structure

- `manifest.json` — declares `notes` collection with `title` and `body` columns
- `src/ui/plugin.ts` — all storage/db calls happen here
- No backend — frontend-only plugin
