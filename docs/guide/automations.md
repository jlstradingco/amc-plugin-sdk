# Automations

An **automation** is a multi-step job AMC runs for you — a nightly digest, a
release checklist, a repo sweep. Where a plugin adds a *surface* to AMC (a
sidebar view, a backend, a webview), an automation is a *recipe*: an ordered list
of prompts AMC executes as agent sessions.

You publish both to the same marketplace, with two different tools:

| | Plugin | Automation |
|---|---|---|
| What it is | Code that extends AMC | A recipe AMC runs |
| Written in | TypeScript | JSON (`.recipe.json`) |
| Tool | `amc-plugin` | `amc-automation` |
| Ships as | A `.amcplugin` archive | The recipe definition itself |

Both binaries come from the same package, so if you already have the CLI you
already have this:

```bash
npm install -g @agent-mc/plugin-cli
```

## Start one

```bash
amc-automation init "Daily Digest"
```

That writes `daily-digest.recipe.json` and a `README.md`. The scaffold is a
working two-step automation, not a stub — `init` followed by `validate` passes
with nothing to fix. Edit the `steps` array to make it yours.

For the full recipe format — control flow, parameters, run memory, scheduling,
approval gates — see AMC's own
[Recipe Authoring Guide](https://github.com/jlstradingco/Agent-Orchestrator/blob/master/docs/RECIPE_AUTHORING_GUIDE.md).
This page covers only what is specific to *publishing* one.

## Check it

```bash
amc-automation validate
```

Four groups of checks run locally:

- **Structure** — a name, at least one step, a known `executionMode`.
- **Steps** — every step has a name and a non-empty prompt. AMC's own pre-flight
  blocks a run on an empty prompt, so a published automation with one can never
  actually run.
- **Portability** — nothing the person installing it will not have. See below.
- **Secrets** — anything key-shaped or a path pointing into your home directory.

Errors block a publish; warnings do not. Exit code is `0` when clean or
warning-only, `1` when anything errored — so it drops straight into CI. Add
`--json` for machine-readable findings.

To also get the marketplace's own verdict:

```bash
amc-automation validate --check --version 1.2.0
```

This asks the marketplace whether the exact submission you are about to make
would be accepted, so it catches the two things only the server can know: the
automation id already belonging to another developer, and that version already
being published. Pass the `--version` you actually intend to publish, or the
second answer is about a version you were never going to submit.

If that endpoint is unavailable, you get a note and the local result stands. It
never turns an unreachable server into a validation failure.

## Why some automations cannot be shared

An automation travels as *just its definition*. Anything that reaches outside
that definition will not exist on the machine that installs it, so `validate`
refuses it — with the fix:

| Blocker | Why | Fix |
|---|---|---|
| A **sub-recipe** step | Calls a recipe the importer does not have | Inline the steps, or publish the sub-recipe separately |
| A **script** step | Runs a file that only exists on your disk | Replace with a prompt step |
| A **prompt file** | Reads the prompt from disk instead of carrying it | Inline the prompt text |
| A **target project** | Pins the step to one of *your* projects | Remove `targetProjectId` |
| **Project scope** | The whole automation is tied to a local project | Set `"scope": "global"` |

These are checked in your `steps` **and** in every named array under
`pipelines`. Both are published, so both have to be portable.

The same is true of the advisory secret scan: a pasted API key warns wherever it
sits, top-level prompt or pipeline prompt. It only ever warns — a published
automation is world-readable, so a false positive must never block you, and only
you can tell.

## Publish it

```bash
amc-automation publish --changelog "what changed in this version"
```

The first publish opens your browser for GitHub sign-in and stores a token at
`~/.amc/marketplace-token`. Later publishes reuse it and renew it silently.

Then it asks you to confirm the account, defaulting to **no**:

```
Publishing as: octocat
? Publish this automation to the marketplace as "octocat"? › (y/N)
```

That question is not ceremony. GitHub sign-in silently reuses whatever account
your browser is already logged into, and a published automation carries that
name permanently. If it is the wrong one, answer `n` and re-run with
`--switch-account`.

Useful flags:

- `--dry-run` — do everything except the upload. Good for CI.
- `--version <v>` and `--category <c>` — the six categories are `planning`,
  `development`, `testing`, `devops`, `productivity`, `other`.
- `--as <github-user>` — abort unless that account is the one signed in. Worth
  using in CI so a stray token cannot publish under the wrong name.
- `-y` / `--yes` — skip the confirmation question. For CI, where nobody is there
  to answer it; pair it with `--as`.
- `--switch-account` — sign out and re-authenticate as someone else. Shared with
  `amc-plugin`, so this switches the account for both tools.
- `--skip-validation` — publish despite local errors. Rarely what you want. It
  never skips the account confirmation.

Publishing creates a **submission**, not a listing. A human reviews it:

```bash
amc-automation status
```

## What the person installing it sees

An installed automation arrives **paused**. They review its steps and approve it
in their inbox before it can run even once. That is deliberate: an automation is
executable, so it never runs on someone else's machine without their explicit
say-so.

Write your prompts as if a stranger will read them before deciding whether to
trust them — because that is exactly what happens.
