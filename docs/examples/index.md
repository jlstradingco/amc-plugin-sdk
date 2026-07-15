# Examples

Seven example plugins ship with the SDK, demonstrating progressively more complex patterns.

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

## 1.0.7 Namespace Showcases

### Auth Demo

**APIs:** `auth.getUser`, `auth.isAuthenticated`, `auth.requestSignIn`, `auth.onAuthStateChange`, `auth.getSession`

Read the signed-in AMC identity and request scoped Google / GitHub access tokens. Masks the returned token before rendering. Needs the `auth` and `auth.session` permissions.

[View source on GitHub](https://github.com/jlstradingco/amc-plugin-sdk/tree/master/examples/auth-demo)

### Inbox Demo

**APIs:** `inbox.setItems`, `storage.set/get`

Add and remove items in the AMC inbox. Demonstrates the full-replace semantics of `setItems()` by keeping the working list in storage and re-publishing on every change.

[View source on GitHub](https://github.com/jlstradingco/amc-plugin-sdk/tree/master/examples/inbox-demo)

### Recording Demo

**APIs:** `recording.start/stop/list/getShareUrl/delete`

Preview template for the forthcoming screen-recording API. The `recording` bridge is **not yet wired** — the calls are currently inert — so this example is a forward-looking scaffold, not a working recorder.

[View source on GitHub](https://github.com/jlstradingco/amc-plugin-sdk/tree/master/examples/recording-demo)

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
