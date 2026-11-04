# AI

Generate text using AI models directly, without creating a full Claude Code session. Useful for lightweight tasks like summarization, classification, or title generation.

**Availability:** Both (backend `ctx.ai` / frontend `AgentMC.ai`)
**Required Permission:** `ai`

## Methods

### `generateMessage(systemPrompt: string, userPrompt: string): Promise<string>`

Send a system prompt and user prompt to an AI model and receive a text response.

**Parameters:**

| Name | Type | Description |
|---|---|---|
| `systemPrompt` | `string` | Instructions for the AI model (its role and behavior) |
| `userPrompt` | `string` | The user's request or the content to process |

**Returns:** `Promise<string>` -- the model's text response.

**Example:**

```typescript
// Frontend
const summary = await AgentMC.ai.generateMessage(
  'You are a technical writer. Summarize code changes in 2-3 sentences.',
  'Added pagination to the /users endpoint with cursor-based navigation...',
)

// Backend
const review = await ctx.ai.generateMessage(
  'You are a senior code reviewer. Identify potential bugs and suggest fixes.',
  `Review this function:\n\n${functionCode}`,
)
ctx.log.info(`Review: ${review}`)
```

---

### `generateTextViaSubscription(systemPrompt: string, userPrompt: string, opts?: { model?: string }): Promise<string>`

Write text on the person's own Claude plan instead of a stored API key. Use it first, and fall back to `generateMessage` only when it refuses.

**Parameters:**

| Name | Type | Description |
|---|---|---|
| `systemPrompt` | `string` | Instructions for the AI (up to 32 KB; may be empty) |
| `userPrompt` | `string` | The request (1 character to 32 KB) |
| `opts.model` | `string` | Optional Claude model id; any other key (a provider, a picture) is refused |

**Returns:** `Promise<string>` -- the text. On the window bridge a failed call resolves `null`; the backend rejects.

**What it can and cannot do:**

- Text only. The AI behind it has no tools and no tool servers, so it cannot run a command, read a file, browse or act on anything in your prompt.
- Only while the person has your plugin turned on, and only with the `ai` permission.
- It counts against your plugin's daily AI limit (the one the person sets in Settings), with at most 3 AI calls running at once. A limit of $0 stops it.
- It never falls back to an API key by itself. When the plan cannot answer, it refuses with the code `plugin-ai-plan-unavailable` and the fixed message "Your Claude plan could not write this right now. Try again later, or use your API key instead." The refusal never says why, by design: a plugin cannot learn which sign-in the person uses.
- Check `host.getCapabilities()` for the `ai-plan-text` token before calling; an older Omniscio does not have this method.

**Example:**

```typescript
const caps = await ctx.host.getCapabilities()
async function write(system: string, prompt: string): Promise<string> {
  if (caps.includes('ai-plan-text')) {
    try {
      return await ctx.ai.generateTextViaSubscription(system, prompt)
    } catch {
      // the plan could not answer; use the stored key as the backup
    }
  }
  return ctx.ai.generateMessage(system, prompt)
}
```

---

### `generateTitle(text: string): Promise<string>`

Generate a short, descriptive title from a block of text. Useful for automatically naming sessions, reports, or documents.

**Parameters:**

| Name | Type | Description |
|---|---|---|
| `text` | `string` | The text to generate a title from |

**Returns:** `Promise<string>` -- a short title.

**Example:**

```typescript
// Frontend
const title = await AgentMC.ai.generateTitle(
  'This PR migrates the authentication system from session cookies to JWT tokens, ' +
  'adds refresh token rotation, and updates all middleware...',
)
// title: "JWT Auth Migration with Refresh Token Rotation"

// Backend
const title = await ctx.ai.generateTitle(reportContent)
await ctx.db.update('reports', reportId, { title })
```

## Notes

- `generateTextViaSubscription` runs on the person's Claude plan; every other method here goes through Omniscio's AI service on a stored key.
- These key calls go through Omniscio's AI service, which requires an API key account. OAuth/login accounts cannot make direct AI calls. If no API key account is available, the call will fail with a descriptive error.
- `generateMessage` is best for short, targeted tasks. For complex multi-turn interactions, use the [Sessions](./sessions) API instead.
- `generateTitle` is optimized for producing concise titles (typically under 10 words).
