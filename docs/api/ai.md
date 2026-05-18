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

- These calls go through AMC's AI service, which requires an API key account. OAuth/login accounts cannot make direct AI calls. If no API key account is available, the call will fail with a descriptive error.
- `generateMessage` is best for short, targeted tasks. For complex multi-turn interactions, use the [Sessions](./sessions) API instead.
- `generateTitle` is optimized for producing concise titles (typically under 10 words).
