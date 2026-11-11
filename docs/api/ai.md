# AI

Generate text using AI models directly, without creating a full Claude Code session. Useful for lightweight tasks like summarization, classification, or title generation.

**Availability:** Both (backend `ctx.ai` / frontend `Omniscio.ai`)
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
const summary = await Omniscio.ai.generateMessage(
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
const title = await Omniscio.ai.generateTitle(
  'This PR migrates the authentication system from session cookies to JWT tokens, ' +
  'adds refresh token rotation, and updates all middleware...',
)
// title: "JWT Auth Migration with Refresh Token Rotation"

// Backend
const title = await ctx.ai.generateTitle(reportContent)
await ctx.db.update('reports', reportId, { title })
```

---

### `generateStructured(opts): Promise<Record<string, unknown>>`

Ask for a JSON answer in a shape you define, instead of prose you have to parse. You pass a JSON
Schema, the host forces the model to fill it, and you get the filled object back.

**Parameters:**

| Name | Type | Description |
|---|---|---|
| `opts.prompt` | `string` | What to extract or decide, up to 32 KB |
| `opts.tool` | `object` | The shape to fill: `{ name, description?, inputSchema }` — `name` up to 64 characters, `inputSchema` a JSON Schema object of at most 128 keys |
| `opts.systemPrompt` | `string` | Optional instructions, up to 32 KB |
| `opts.model` | `string` | Optional Anthropic model id |
| `opts.premium` | `boolean` | Optional: use the premium model (Opus) instead of the default |
| `opts.maxOutputTokens` | `number` | Optional answer length, 1 to 16,384 — a value outside it is refused, never clamped |

**Returns:** `Promise<Record<string, unknown>>` — the object that fills `inputSchema`.

Metered against your plugin's own daily AI cap, the same one `generateMessage` uses, so a plugin can
never spend past it by looping on this call.

**Example:**

```typescript
const lead = await ctx.ai.generateStructured({
  prompt: `Extract the contact from this email:\n\n${emailBody}`,
  tool: {
    name: 'contact',
    description: 'The person the email is about.',
    inputSchema: {
      type: 'object',
      properties: {
        name: { type: 'string' },
        company: { type: 'string' },
        intent: { type: 'string', enum: ['buy', 'support', 'other'] },
      },
      required: ['name', 'intent'],
    },
  },
})
ctx.log.info(`${lead.name} at ${lead.company}`)
```

---

### `isConfigured(): Promise<boolean>`

Whether an AI key account exists, checked before you offer to generate anything.

**Returns:** `Promise<boolean>` — `true` when `generateMessage`, `generateTitle` and
`generateStructured` will run; `false` when they would fail.

Use it to disable a Generate button and say why, rather than letting the person click and read an
error. It asks the same resolver those calls use, so a key saved in an isolated slot counts.

**Example:**

```typescript
const ready = await Omniscio.ai.isConfigured()
if (!ready) {
  Omniscio.toast.show({ type: 'info', message: 'Add an AI API key in Settings first.' })
}
```

---

### `listEngines(): Promise<PluginEngineCatalog>`

The engines and models this person can actually use, so a plugin can offer the same choice a session
does instead of hard-coding a model name.

**Returns:** `Promise<PluginEngineCatalog>` — `{ version, defaults, engines, agentsLocked }`. Each
entry of `defaults` (`session` and `writing`) is `{ provider, model, label }`, and each engine carries
`{ id, label, ready, writing, writingReady, canRunNoTools, defaultModel, models, data }`. `ready:
false` means that engine cannot run here (no account, or the person's settings floor it).

**Example:**

```typescript
const { engines } = await Omniscio.ai.listEngines()
const usable = engines.filter((engine) => engine.ready)
const model = usable[0]?.defaultModel
if (!model) {
  Omniscio.toast.show({ type: 'info', message: 'No AI engine is ready on this computer yet.' })
}
```

---

### `estimateImage(request): Promise<BridgeImageEstimate | BridgeImageRefusal>` (panel only)

Omniscio's own price for **one** Image Studio picture, its service fee included. Free. Needs the `ai.images` permission.

### `generateImage(request): Promise<BridgeImageResult | BridgeImageRefusal>` (panel only)

Make **one** picture with Image Studio, paid from the user's Omniscio credit. Needs the `ai.images` permission. Omniscio prices it, checks the user's balance and this plugin's daily picture limit, then shows the user its own confirmation; only their **Generate** spends.

**`request`:**

| Field | Type | Description |
|---|---|---|
| `subject` | `string` | What to draw, 1 to 4,000 characters |
| `model` | `string` | An Image Studio model id |
| `aspectRatio` | `'1:1' \| '4:3' \| '3:4' \| '16:9' \| '9:16'` | The picture's shape |
| `style` | `string?` | Optional style notes |
| `imageSize` | `'0.5K' \| '1K' \| '2K' \| '4K'?` | Optional size |
| `transparentBackground` | `boolean?` | Ask for a transparent background |

Any other field (a picture count, a price) is refused.

**Returns:** `{ ok: true, imageId, url?, base64?, model, costUsd }`, or a refusal `{ ok: false, code, message }` — it does not reject for these. `code` is `plugin-images-off`, `signed-out`, `plugin-image-daily-cap`, `insufficient-credit` (Omniscio already offered the user **Add credit**), `declined`, `busy` or `image-service-error`.

**Example:**

```typescript
const caps = await AgentMC.host.getCapabilities()
if (caps.includes('ai-images')) {
  const result = await AgentMC.ai.generateImage({
    subject: 'A watercolor fox reading a map in the snow',
    model: 'gemini-3.1-flash-lite-image',
    aspectRatio: '1:1'
  })
  if (result.ok) showPicture(result.base64 ?? result.url)
  else if (result.code !== 'declined') showMessage(result.message)
}
```

## Notes

- `estimateImage` / `generateImage` work only from the plugin's panel, and their spend has its own per-plugin daily limit (Cost Control → **Plugin pictures**, $2 unless changed), separate from the text-AI limit.
- `generateTextViaSubscription` runs on the person's Claude plan; every other method here goes through Omniscio's AI service on a stored key.
- These key calls go through Omniscio's AI service, which requires an API key account. OAuth/login accounts cannot make direct AI calls. If no API key account is available, the call will fail with a descriptive error.
- Call `isConfigured` first when you are about to show a Generate control — it is the difference between a disabled button and a failed click.
- `generateMessage` is best for short, targeted tasks. For complex multi-turn interactions, use the [Sessions](./sessions) API instead.
- `generateTitle` is optimized for producing concise titles (typically under 10 words).
