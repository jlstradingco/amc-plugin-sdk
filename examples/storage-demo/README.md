# Storage Demo

Minimal Omniscio plugin demonstrating the **storage** (key-value) and **database** (collections) APIs.

## What It Shows

- `Omniscio.storage.set()` / `.get()` — persist user preferences (sort order)
- `Omniscio.db.insert()` — create records in a collection
- `Omniscio.db.query()` — list records with ordering
- `Omniscio.db.delete()` — remove records by ID

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
