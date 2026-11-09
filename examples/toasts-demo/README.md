# Toasts Demo

Minimal Omniscio plugin demonstrating the **toast** and **notifications** APIs.

## What It Shows

- `Omniscio.toast.show({ type, message })` — in-app toast (success, error, info)
- `Omniscio.toast.notify({ title, body })` — OS-level notification
- `Omniscio.storage.set()` / `.get()` — persist click counts

## Running

```bash
cd examples/toasts-demo
npm install
npm run build
npm run dev
```
