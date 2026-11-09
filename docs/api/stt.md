# Speech to Text

Turn a recording into text with the speech service the user has set up in Omniscio.

**Availability:** Webview only (`Omniscio.stt`). There is no `ctx.stt`.
**Required Permission:** `stt`

::: tip Microphone access is separate
`stt` only sends a recording you already have to the user's speech service. Recording from the microphone is a different permission, `microphone`, which is elevated.
:::

## Permissions

`stt` is a standard permission. Omniscio shows it to the user as "Speech to Text: Send recordings to your configured speech service to be turned into text".

```json
{
  "permissions": ["stt"]
}
```

## Methods

### `transcribe(audioBase64: string, opts?: { mimeType?: string; language?: string }): Promise<{ text: string }>`

Send a recording to the user's configured speech service and get the text back.

**Parameters:**

| Name | Type | Description |
|---|---|---|
| `audioBase64` | `string` | The recording, base64 encoded. Up to 10 MB once decoded |
| `opts.mimeType` | `string` | Optional. Advisory only: Omniscio reads the real format from the bytes, so a wrong or missing value does not break transcription |
| `opts.language` | `string` | Optional language |

**Returns:** `Promise<{ text: string }>`. An empty `text` means the recording was silent. That is a success, not an error.

**Rejects** with an `Error` that has a `code`:

| `err.code` | Meaning |
|---|---|
| `SERVICE_UNAVAILABLE` | The user has no speech provider set up |
| `VALIDATION_FAILED` | The audio is empty or over the 10 MB decoded limit |
| `RATE_LIMITED` | The daily voice spending cap has been reached |

---

### `isConfigured(): Promise<boolean>`

Whether the user has a speech provider configured. `false` means `transcribe` will reject with `SERVICE_UNAVAILABLE`.

**Returns:** `Promise<boolean>`

## Example

```typescript
const omniscio = window.Omniscio ?? window.AgentMC

async function blobToBase64(blob: Blob): Promise<string> {
  const bytes = new Uint8Array(await blob.arrayBuffer())
  let binary = ''
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return btoa(binary)
}

async function dictate(recording: Blob): Promise<string> {
  if (!(await omniscio.stt.isConfigured())) {
    omniscio.toast.show({ type: 'info', message: 'Set up a speech service in Omniscio settings first.' })
    return ''
  }

  try {
    const { text } = await omniscio.stt.transcribe(await blobToBase64(recording), {
      mimeType: recording.type,
    })
    if (text === '') omniscio.toast.show({ type: 'info', message: 'Nothing was heard.' })
    return text
  } catch (err) {
    const code = (err as { code?: string }).code
    if (code === 'RATE_LIMITED') {
      omniscio.toast.show({ type: 'warning', message: 'The daily voice limit has been reached.' })
    } else {
      omniscio.toast.show({ type: 'error', message: 'Could not transcribe that recording.' })
    }
    return ''
  }
}
```

## Notes

- Webview only. A backend that needs the text should receive it from its webview with [`ctx.events`](./events).
- For the reverse direction, see [Text to Speech](./tts).
- `@omniscio/plugin-sdk/browser` exports `BridgeStt`.
