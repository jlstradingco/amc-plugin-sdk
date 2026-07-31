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

| Option | Default | Description |
|---|---|---|
| `--check` | off | Also ask the marketplace for the authoritative verdict |
| `--version <version>` | `1.0.0` | The version to validate as, so `--check` can answer about version collisions |
| `--category <category>` | `other` | The category to validate as |
| `--json` | off | Emit machine-readable findings |

`--check` builds the same submission `publish` would send, so its verdict covers
the two rejections that only the server can see: the automation id belonging to
another developer, and this version already being published. Pass the same
`--version` you intend to publish with, or the collision answer is about a
version you were never going to submit.

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
| `recipe-file` | error | The recipe file is missing, unreadable, not JSON, or ambiguous |
| `bad-version` | error | `--version` is not three dot-separated numbers |
| `bad-category` | error | `--category` is not one of the six |
| `missing-name` | error | No `name`, or it is blank |
| `name-too-long` | error | Over 100 characters |
| `no-steps` | error | `steps` missing or empty |
| `bad-execution-mode` | error | Not `multi-session` / `same-session` / `parallel` |
| `bad-schema-version` | error | `schemaVersion` is not `1` |
| `malformed-step` | error | An entry in a steps array is not a step, so it would be dropped |
| `unnamed-step` | error | A step has no `name` |
| `empty-prompt` | error | A step has no usable `prompt` |
| `automation-id-too-short` | error | The name slugs to fewer than 2 characters |
| `automation-id-too-long` | error | The name slugs to more than 64 characters |
| `automation-id-invalid` | error | The name slugs to something the marketplace will not accept |
| `too-many-steps` | error | More than 200 steps |
| `definition-too-large` | error | The shareable part exceeds 256 KB |
| `project-scope` | error | `scope` is `project` |
| `sub-recipe-step` | error | A step calls another recipe |
| `script-step` | error | A step runs a local script |
| `prompt-file` | error | A step reads its prompt from disk |
| `target-project` | error | A step is pinned to a local project |
| `possible-secret` | warning | Something key-shaped or an absolute user path |
| `field-not-published` | info | A top-level field the envelope does not carry |
| `step-field-not-published` | info | A step field the envelope does not carry |

`recipe-file`, `bad-version` and `bad-category` are about the *inputs* rather than
the recipe's contents, so they can be the only finding present. `validate --json`
emits the same payload shape for them as for everything else — including when the
file could not be loaded at all, so a CI step never has to tell empty stdout from
a crashed process.

---

## `amc-automation publish [file]`

Validates, authenticates, and uploads for review.

| Option | Default | Description |
|---|---|---|
| `--version <version>` | `1.0.0` | Version for this submission |
| `--category <category>` | `other` | As per `init` |
| `--changelog <text>` | empty | What changed in this version |
| `--as <github-user>` | — | Abort unless this account is signed in |
| `--switch-account` | off | Sign out first and re-authenticate as a different account |
| `-y, --yes` | off | Skip the identity confirmation prompt (for CI) |
| `--dry-run` | off | Everything except the upload |
| `--skip-validation` | off | Publish despite local errors |

```bash
$ amc-automation publish --changelog "first release"

Publishing as: octocat
? Publish this automation to the marketplace as "octocat"? › (y/N)
ℹ Publishing daily-digest v1.0.0 as octocat...
✓ Submitted for review (submission abc123)
ℹ Run `amc-automation status` to follow the review.
```

### The account it publishes under

GitHub sign-in silently reuses whatever account your default browser is already
logged into, so a publish can go out under an identity you never chose — and a
published automation carries that name permanently. Every publish therefore
confirms the account first, defaulting to **no**.

- Wrong account? Answer `n`, then `amc-automation publish --switch-account`.
- Automating it? `-y` skips the question, and `--as <user>` aborts outright if
  the signed-in account is not the one you named. Use both together in CI.

The sign-in is shared with `amc-plugin`, so switching the account here switches
it for both.

### The automation id

The id is derived from the recipe's `name` — `"Daily Digest"` becomes
`daily-digest`. Rename the automation and you publish a *different* one, so
choose the name before the first publish.

The marketplace requires that derived id to be 2–64 characters, so a
single-character name and a name near the 100-character limit are both rejected.
`validate` reports either one before you spend an upload.

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

Only your own submissions are listed, most recent 50 first. When the marketplace
refuses the request it prints the server's own reason; "Could not reach the
marketplace" means exactly that and nothing else.

---

## Environment

| Variable | Purpose |
|---|---|
| `AMC_MARKETPLACE_API_URL` | Override the marketplace API base URL (default `https://amcback.jls.dev/marketplace`) |
| `AMC_MARKETPLACE_AUTH_URL` | Override the sign-in page |

The stored token lives at `~/.amc/marketplace-token` and is shared with
`amc-plugin` — sign in once, use both. `amc-plugin logout` clears it.
