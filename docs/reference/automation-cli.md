# `amc-automation` CLI Reference

Publishes AMC automations. Ships from `@agent-mc/plugin-cli` alongside
`amc-plugin`, sharing its marketplace sign-in.

```bash
npm install -g @agent-mc/plugin-cli
amc-automation --help
```

## Exit codes

| Code | Meaning |
|---|---|
| `0` | Success, or warnings only |
| `1` | An error-severity finding, a rejected publish, or a missing/unreadable recipe |

Warnings never change the exit code. Only errors do.

---

## `amc-automation init <name>`

Scaffolds `<slug>.recipe.json` plus a `README.md`. The result is a valid,
publishable automation — `init` then `validate` is clean by construction.

| Option | Default | Description |
|---|---|---|
| `--description <text>` | `The <name> automation.` | One-line description |
| `--category <category>` | `other` | `planning`, `development`, `testing`, `devops`, `productivity`, `other` |
| `--force` | off | Overwrite an existing recipe (and README) |

```bash
$ amc-automation init "Daily Digest" --category productivity
✓ Created daily-digest.recipe.json
ℹ Next: edit the steps, then run `amc-automation validate`.
```

An existing `README.md` is left alone unless you pass `--force`.

---

## `amc-automation validate [file]`

Runs the local checks. `[file]` is optional when the directory holds exactly one
`*.recipe.json`; with several, the CLI names them and asks you to pick.

| Option | Description |
|---|---|
| `--check` | Also ask the marketplace for the authoritative verdict |
| `--json` | Emit machine-readable findings |

```bash
$ amc-automation validate

Local checks

✗ Step 2 has no prompt, so this automation cannot run. (step "summarize")
  → Add a non-empty "prompt". AMC blocks the run on an empty one.
⚠ description looks like a GitHub token.
  → Remove it before publishing — a published automation is public.
```

`--json` shape:

```json
{
  "ok": false,
  "errors": [{ "severity": "error", "code": "empty-prompt", "message": "...", "fix": "..." }],
  "warnings": [],
  "info": [],
  "server": null
}
```

`server` is `null` when `--check` was not passed, when you are not signed in, or
when the endpoint could not be reached. An unreachable server is **not** a
validation failure.

### Finding codes

| Code | Severity | Meaning |
|---|---|---|
| `missing-name` | error | No `name`, or it is blank |
| `name-too-long` | error | Over 100 characters |
| `no-steps` | error | `steps` missing or empty |
| `bad-execution-mode` | error | Not `multi-session` / `same-session` / `parallel` |
| `bad-schema-version` | error | `schemaVersion` is not `1` |
| `unnamed-step` | error | A step has no `name` |
| `empty-prompt` | error | A step has no usable `prompt` |
| `project-scope` | error | `scope` is `project` |
| `sub-recipe-step` | error | A step calls another recipe |
| `script-step` | error | A step runs a local script |
| `prompt-file` | error | A step reads its prompt from disk |
| `target-project` | error | A step is pinned to a local project |
| `possible-secret` | warning | Something key-shaped or an absolute user path |

---

## `amc-automation publish [file]`

Validates, authenticates, and uploads for review.

| Option | Default | Description |
|---|---|---|
| `--version <version>` | `1.0.0` | Version for this submission |
| `--category <category>` | `other` | As per `init` |
| `--changelog <text>` | empty | What changed in this version |
| `--as <github-user>` | — | Abort unless this account is signed in |
| `-y, --yes` | off | Skip the identity confirmation |
| `--dry-run` | off | Everything except the upload |
| `--skip-validation` | off | Publish despite local errors |

```bash
$ amc-automation publish --changelog "first release"
ℹ Publishing daily-digest v1.0.0 as octocat...
✓ Submitted for review (submission abc123)
ℹ Run `amc-automation status` to follow the review.
```

The automation id is derived from the recipe's `name` — `"Daily Digest"` becomes
`daily-digest`. Rename the automation and you publish a *different* one, so
choose the name before the first publish.

In CI, pair `--as` with `-y`:

```bash
amc-automation publish --as my-org-bot -y --changelog "$(git log -1 --pretty=%s)"
```

---

## `amc-automation status`

Shows the review state of your submissions, filtered to the automation in the
current directory.

| Option | Description |
|---|---|
| `--all` | Every submission, not just this directory's |

```bash
$ amc-automation status

Submissions

daily-digest v1.0.0 Pending review
```

Statuses are **Pending review**, **Published**, and **Changes requested**;
reviewer notes print underneath when present.

---

## Environment

| Variable | Purpose |
|---|---|
| `AMC_MARKETPLACE_API_URL` | Override the Cloud Functions base URL |
| `AMC_MARKETPLACE_AUTH_URL` | Override the sign-in page |

The stored token lives at `~/.amc/marketplace-token` and is shared with
`amc-plugin` — sign in once, use both. `amc-plugin logout` clears it.
