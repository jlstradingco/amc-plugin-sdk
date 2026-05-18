# Examples

Four example plugins ship with the SDK, demonstrating progressively more complex patterns.

## Minimal Examples

### Storage Demo

**APIs:** `storage.set/get`, `db.insert/query/delete`

Simple note-taking app. Demonstrates key-value storage for preferences and database collections for structured data.

[View source on GitHub](https://github.com/jlstradingco/amc-plugin-sdk/tree/master/examples/storage-demo)

### Toasts Demo

**APIs:** `toast.show`, `toast.notify`, `storage.set/get`

Grid of buttons triggering each toast type (success, error, info) and OS notifications. Persists click counts in storage.

[View source on GitHub](https://github.com/jlstradingco/amc-plugin-sdk/tree/master/examples/toasts-demo)

### Sessions Demo

**APIs:** `session.create`, `session.getStatus`, `session.getMessages`, `session.stop`

Spawn Claude sessions, stream status updates, display conversation messages, and cancel running sessions.

[View source on GitHub](https://github.com/jlstradingco/amc-plugin-sdk/tree/master/examples/sessions-demo)

## Full Example

### GitHub Issues

**APIs:** `http.fetch`, `db.*`, `cron.register`, `settings.get`, `sidebar.setBadge`, `toast.show`, `log.*`

Full-stack plugin with backend. Syncs GitHub issues via cron, caches them locally, renders with filters and search. Demonstrates the complete plugin lifecycle.

[View source on GitHub](https://github.com/jlstradingco/amc-plugin-sdk/tree/master/examples/github-issues)

## Running Examples

Each example is a standalone plugin project:

```bash
cd examples/<example-name>
npm install
npm run build
npm run dev    # launches dev shell
```
