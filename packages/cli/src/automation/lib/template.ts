import { SCHEMA_VERSION } from '../checks/index.js'
import type { AutomationCategory } from './envelope.js'

/**
 * A VALID, publishable starting point — never a stub. `init` followed by
 * `validate` must report zero findings, and template.test.ts asserts exactly
 * that, so a template regression fails the suite rather than the author.
 */
export function buildTemplateRecipe(opts: {
  name: string
  description: string
  category: AutomationCategory
}): Record<string, unknown> {
  return {
    schemaVersion: SCHEMA_VERSION,
    name: opts.name,
    description: opts.description,
    scope: 'global',
    executionMode: 'multi-session',
    steps: [
      {
        name: 'gather',
        prompt:
          'Review the work completed in this project since yesterday. ' +
          'List each change with a one-line summary of what it does and why.'
      },
      {
        name: 'summarize',
        prompt:
          'Turn the list above into a short plain-English digest for someone ' +
          'who has not been following along. Lead with anything that needs a decision.'
      }
    ]
  }
}

export function buildTemplateReadme(opts: { name: string; fileName: string }): string {
  return `# ${opts.name}

An Agent Mission Control automation.

## Files

- \`${opts.fileName}\` — the automation itself. Edit the \`steps\` array to change what it does.

## Working on it

Check it before you publish:

\`\`\`
amc-automation validate
\`\`\`

That runs local checks only. To also get the marketplace's verdict:

\`\`\`
amc-automation validate --check
\`\`\`

## Publishing

\`\`\`
amc-automation publish --changelog "what changed in this version"
\`\`\`

You will be asked to sign in with GitHub the first time. Your automation is
submitted for review, not listed immediately — run \`amc-automation status\` to
follow it.

## Notes

Anyone who installs this gets it **paused**. They review the steps and approve
it before it can run, so a published automation can never execute on someone
else's machine without their say-so.
`
}
