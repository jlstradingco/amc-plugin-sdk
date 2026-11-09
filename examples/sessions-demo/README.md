# Sessions Demo

Minimal Omniscio plugin demonstrating the **sessions** API — spawning Claude sessions and streaming results.

## What It Shows

- `Omniscio.session.create({ prompt })` — spawn a new Claude session
- `Omniscio.session.getStatus(id)` — poll session status
- `Omniscio.session.getMessages(id)` — fetch conversation messages
- `Omniscio.session.stop(id)` — cancel a running session

## Running

```bash
cd examples/sessions-demo
npm install
npm run build
npm run dev
```

## Notes

- Requires Omniscio v0.1.40+ (for session bridge API)
- Sessions consume API quota — use responsibly during development
