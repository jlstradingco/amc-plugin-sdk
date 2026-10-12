/**
 * Why a command did not hand back a result. Each code says what is known about whether the
 * command ran, which is the one thing a panel must never guess:
 *
 * - `host-too-old` — this Omniscio has no panel-to-backend channel (it arrived in v0.1.92).
 *   Nothing was sent and nothing was written.
 * - `worker-not-ready` — the plugin's backend is not running, or is an older build without this
 *   channel. The host refused before delivering, so nothing ran.
 * - `refused` — the backend or the host turned the command away (a full queue, an input over the
 *   size limit, a busy host, a saved copy that was gone). Nothing ran.
 * - `invalid-input` — the input is not plain JSON data, or the command's `parse` rejected it.
 *   Nothing ran.
 * - `failed` — the command ran and threw, or ran but its result could not be sent back.
 * - `outcome-unknown` — contact was lost after the backend may have accepted it, and did not come
 *   back within a minute (or the backend no longer knew the command). It may or may not have run;
 *   never retry it blindly.
 */
export type CommandErrorCode =
  | 'host-too-old'
  | 'worker-not-ready'
  | 'refused'
  | 'invalid-input'
  | 'failed'
  | 'outcome-unknown'

export class CommandError extends Error {
  readonly code: CommandErrorCode

  constructor(code: CommandErrorCode, message: string) {
    super(message)
    this.name = 'CommandError'
    this.code = code
  }
}
