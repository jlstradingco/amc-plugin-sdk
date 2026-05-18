# Toasts Demo

Minimal AMC plugin demonstrating the **toast** and **notifications** APIs.

## What It Shows

- `AgentMC.toast.show({ type, message })` — in-app toast (success, error, info)
- `AgentMC.toast.notify({ title, body })` — OS-level notification
- `AgentMC.storage.set()` / `.get()` — persist click counts

## Running

```bash
cd examples/toasts-demo
npm install
npm run build
npm run dev
```
