# Firebase

Enumerate the user's Firebase accounts and projects, and start an interactive login.

**Availability:** Backend only (`ctx.firebase`)
**Required Permission:** `firebase`

Backed by the user's **locally installed Firebase CLI**. This is not a Firebase SDK -- there is no database access here, only the account and project metadata the CLI can report.

::: tip Every list resolves, none reject
When the CLI is missing, times out, or returns something unparseable, each list method resolves to an **empty array** rather than rejecting. That means an empty result is ambiguous on its own: it can mean "no projects" or "no Firebase CLI". Call `setupStatus()` to tell the two apart.
:::

## Methods

### `listAccounts(): Promise<FirebaseAccount[]>`

Accounts the local Firebase CLI is signed into.

### `listProjects(): Promise<FirebaseProject[]>`

Projects visible to the active account.

### `listProjectsForAccount(email: string): Promise<FirebaseProject[]>`

Projects visible to one specific account. An unknown email resolves to `[]` rather than rejecting.

### `setupStatus(): Promise<FirebaseSetupStatus>`

The diagnostic call. Use it to explain an empty list to the user instead of showing them a blank panel.

### `startLogin(): Promise<{ started: boolean }>`

Spawn a detached `firebase login`.

`started` reports **only that the spawn succeeded** -- not that the user signed in, and not that they will. There is no completion signal. Poll `listAccounts()` or `setupStatus()` if you need to know the outcome.

## Types

```typescript
interface FirebaseAccount {
  email: string
  active: boolean
}

interface FirebaseProject {
  projectId: string
  displayName: string
}

interface FirebaseSetupStatus {
  cliInstalled: boolean
  signedIn: boolean
  accounts: { email: string }[]
  firebaseAccess: 'ok' | 'needs-tos' | 'unknown'
  billing: { checked: boolean; hasOpenAccount: boolean }
}
```

| `FirebaseSetupStatus` field | Type | Description |
|---|---|---|
| `cliInstalled` | `boolean` | Whether a Firebase CLI was found on PATH |
| `signedIn` | `boolean` | Whether any account is authenticated |
| `accounts` | `{ email: string }[]` | Signed-in account emails |
| `firebaseAccess` | `'ok' \| 'needs-tos' \| 'unknown'` | `needs-tos` means the user must accept terms in the console before the API answers |
| `billing.checked` | `boolean` | Whether billing could be inspected at all |
| `billing.hasOpenAccount` | `boolean` | Whether an open billing account exists |

## Example

```typescript
export function activate(ctx: PluginContext) {
  ctx.cli.handle('/firebase/projects', async () => {
    const projects = await ctx.firebase.listProjects()
    if (projects.length > 0) return { status: 200, body: { projects } }

    // Empty is ambiguous -- turn it into an answer the user can act on.
    const status = await ctx.firebase.setupStatus()

    if (!status.cliInstalled) {
      return { status: 200, body: { projects: [], hint: 'Install the Firebase CLI to continue.' } }
    }
    if (!status.signedIn) {
      await ctx.firebase.startLogin()
      return { status: 200, body: { projects: [], hint: 'A browser window was opened to sign in.' } }
    }
    if (status.firebaseAccess === 'needs-tos') {
      return { status: 200, body: { projects: [], hint: 'Accept the Firebase terms in the console.' } }
    }
    return { status: 200, body: { projects: [], hint: 'This account has no Firebase projects.' } }
  })
}
```

## Notes

- The permission gates the whole namespace. Without `firebase` declared in your manifest, the host denies every call.
- `startLogin()` is detached and interactive. Never call it on activation -- it opens a browser on the user's machine.
- Treat every result as a snapshot of another tool's state. The user can sign out in a terminal at any moment.

## Testing

`createTestContext()` defaults to a machine with no Firebase CLI: empty lists, `cliInstalled: false`, and `startLogin()` resolving `{ started: false }` (a spawn cannot have succeeded when nothing is installed). Seed what you need.

```typescript
const h = createTestContext({
  firebase: {
    accounts: [{ email: 'dev@example.com', active: true }],
    projects: [{ projectId: 'my-app', displayName: 'My App' }],
    setupStatus: { cliInstalled: true, signedIn: true },
    loginStarts: true
  }
})
```

`setupStatus` is a partial -- the fields you omit keep the no-CLI defaults, so you can seed exactly the branch under test.
