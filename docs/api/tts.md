# Text to Speech

Turn text into spoken audio using whichever voice the user has configured in AMC.

**Availability:** Backend only (`ctx.tts`)
**Required Permission:** `tts`

::: warning Metered spend
Synthesis is billed AI usage. The host enforces a per-plugin daily cap that is **shared with the `ai` capability**, and `synthesize()` rejects once that cap is reached. Treat a rejection as an expected runtime state, not a bug -- a plugin that calls this on a schedule will hit it eventually.
:::

## Methods

### `isAvailable(): Promise<boolean>`

Whether synthesis can actually run right now. Returns `false` when the user has TTS disabled or has configured no voice provider.

Check this before offering a "read aloud" control, rather than discovering the state from a rejected `synthesize()` -- a disabled voice is a setting, not an error worth surfacing to the user.

### `synthesize(text: string): Promise<SynthesizedSpeech>`

Synthesize `text` and resolve with base64-encoded MP3.

**Rejects** when no voice is configured, or when the shared daily AI spend cap has been reached.

## Types

```typescript
interface SynthesizedSpeech {
  audioBase64: string
  mime: 'audio/mpeg'
}
```

| Field | Type | Description |
|---|---|---|
| `audioBase64` | `string` | MP3 bytes, base64-encoded |
| `mime` | `'audio/mpeg'` | Always MP3 |

## Example

```typescript
// Backend
export function activate(ctx: PluginContext) {
  ctx.cli.handle('/speak', async (req) => {
    if (!(await ctx.tts.isAvailable())) {
      return { status: 503, body: { error: 'No voice configured in AMC settings' } }
    }

    try {
      const speech = await ctx.tts.synthesize(String(req.body))
      return { status: 200, body: { audio: speech.audioBase64, mime: speech.mime } }
    } catch (err) {
      // The daily cap is the common cause here, and it is not the user's mistake.
      ctx.log.warn('Synthesis unavailable', err)
      return { status: 503, body: { error: 'Speech is unavailable right now' } }
    }
  })
}
```

Playing it in your plugin's UI is a data URL away:

```typescript
// Frontend -- the audio arrives from your own backend, not from the bridge
const audio = new Audio(`data:${mime};base64,${audioBase64}`)
await audio.play()
```

## Notes

- There is no voice-selection API. The voice is the user's choice, made once in AMC's settings, and applies to every plugin.
- The base64 payload is a full MP3 file, not a stream. Long text means a large string held in memory -- synthesize in paragraphs rather than whole documents.
- `isAvailable()` is a snapshot. A user can turn TTS off between your check and your call, so keep the `try/catch` even when the check passed.

## Testing

`createTestContext()` mirrors the host's default: no voice configured, so `isAvailable()` resolves `false` and `synthesize()` rejects. Seed it to exercise the happy path.

```typescript
import { createTestContext } from '@agent-mc/plugin-sdk/testing'

const h = createTestContext({ tts: { available: true } })
const speech = await h.ctx.tts.synthesize('hello')
// speech.mime === 'audio/mpeg'

// Or inject your own synthesizer to assert on the text that was sent:
const seen: string[] = []
const h2 = createTestContext({
  tts: {
    available: true,
    synthesize: async (text) => {
      seen.push(text)
      return { audioBase64: '', mime: 'audio/mpeg' as const }
    }
  }
})
```
