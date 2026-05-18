# Sessions Demo

Minimal AMC plugin demonstrating the **sessions** API — spawning Claude sessions and streaming results.

## What It Shows

- `AgentMC.session.create({ prompt })` — spawn a new Claude session
- `AgentMC.session.getStatus(id)` — poll session status
- `AgentMC.session.getMessages(id)` — fetch conversation messages
- `AgentMC.session.stop(id)` — cancel a running session

## Running

```bash
cd examples/sessions-demo
npm install
npm run build
npm run dev
```

## Notes

- Requires AMC v0.1.40+ (for session bridge API)
- Sessions consume API quota — use responsibly during development
