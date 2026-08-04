/**
 * Tool-activity line markers used by AMC (the host app) inside agent session
 * transcripts.
 *
 * When an agent session runs in AMC, every tool call and every tool result is
 * rendered as its own transcript line, each prefixed with a single reserved
 * character — one glyph for a call, a different one for a result. A plugin
 * that reads session transcripts (NDJSON exports, `ctx.sessionHistory`,
 * search indexing, custom renderers, …) needs to tell "the agent said this"
 * apart from "a tool did this," and today the only way to do that is to
 * recognize these two characters at the start of a line.
 *
 * Import the constants and helper below rather than hardcoding the glyphs.
 * The host owns this contract, not the SDK — a plugin with its own copy of
 * '▸' and '←' baked into a regex will silently stop matching if AMC ever
 * changes which characters it emits, with no compiler error and no runtime
 * exception, just quietly-wrong output (tool lines start leaking into
 * "prose only" views, or vice versa). A plugin importing from here instead
 * gets the fix the next time it bumps its `@agent-mc/plugin-sdk` dependency.
 *
 * ## Provenance
 *
 * These values are copied verbatim from the host's own source of truth, not
 * reinvented or paraphrased:
 *
 *   host repo:   Agent-Orchestrator
 *   host file:   src/shared/agent-content-markers.ts
 *   host lines:  80-84
 *   host commit: master@9c21044ee0
 *   verified:    2026-08-04
 *
 * To re-derive: check out the Agent-Orchestrator repo at that commit and
 * read those five lines directly. `TOOL_CALL_MARKER`, `TOOL_RESULT_MARKER`,
 * `TOOL_CALL_RE`, and `TOOL_RESULT_RE` are declared there, and the four
 * constants below are a byte-for-byte copy of their values.
 *
 * ## Codepoints
 *
 * The two glyphs are easy to mistake for visually similar characters once
 * they have passed through a terminal, chat client, or lossy font, so pin
 * them explicitly:
 *
 *   - `TOOL_CALL_MARKER`   = '▸' = U+25B8 BLACK RIGHT-POINTING SMALL TRIANGLE
 *     — not U+25B6 BLACK RIGHT-POINTING TRIANGLE, not U+25B7 WHITE
 *     RIGHT-POINTING TRIANGLE, not the ASCII '>' U+003E GREATER-THAN SIGN.
 *   - `TOOL_RESULT_MARKER` = '←' = U+2190 LEFTWARDS ARROW
 *     — not U+2039 SINGLE LEFT-POINTING ANGLE QUOTATION MARK, not the
 *     two-character ASCII sequence '<-'.
 *
 * ## One-marker-per-line contract
 *
 * `TOOL_CALL_RE` and `TOOL_RESULT_RE` are both anchored with `^` and require
 * a trailing whitespace character right after the marker (`\s`). This is
 * deliberate on the host's side, not an oversight to "fix" here:
 *
 *   - The `^` anchor means a marker only counts at the very start of a
 *     line — the host never emits one mid-line, so a match anywhere else
 *     would be a false positive, not a real marker. Test the TRIMMED line
 *     (as `stripToolLines` below does), not the raw line, or leading
 *     indentation will break the anchor.
 *   - The required trailing `\s` means a bare '▸' or '←' with nothing after
 *     it does NOT count as a tool line.
 */
export const TOOL_CALL_MARKER = '▸'
export const TOOL_RESULT_MARKER = '←'

export const TOOL_CALL_RE = /^▸\s/
export const TOOL_RESULT_RE = /^←\s/

/**
 * Remove tool-activity lines (`▸ ...` calls and `← ...` results) from an
 * agent transcript, leaving only the agent's own prose.
 *
 * Fence-aware: a line inside a ``` code fence is always kept untouched, even
 * if its trimmed form would otherwise match `TOOL_CALL_RE` or
 * `TOOL_RESULT_RE`. A '▸' printed inside a fenced code block is sample code
 * the agent is showing the user, not a tool-activity marker, so stripping it
 * would corrupt the code block. Fence state is tracked with a single
 * boolean that flips whenever a trimmed line starts with three backticks;
 * the fence delimiter line itself is always kept, whether it opens or
 * closes the fence.
 *
 * ## This name mirrors the host's fence-AWARE function, not its fence-blind one
 *
 * The host ships two related functions with confusingly similar names, and
 * this export deliberately mirrors only one of them:
 *
 *   - host `stripToolLines`           — fence-BLIND. A flat line filter
 *     that WILL strip a '▸'/'←' line even inside a ``` fence, corrupting
 *     any transcript that quotes tool-marker syntax as an example.
 *   - host `stripToolLinesFenceAware` — fence-AWARE. Tracks fence state and
 *     leaves fenced content untouched. THIS is the function this SDK
 *     export mirrors, despite sharing its unqualified name with the
 *     host's fence-blind one.
 *
 * In short: this SDK's `stripToolLines` has the host's fence-blind
 * function's NAME but the host's fence-aware function's BEHAVIOR. That is
 * intentional — a plugin author reaching for "strip the tool lines out of
 * this transcript" almost always wants the fence-safe result, so the
 * simpler name is given to the safer behavior. Do not "fix" this by making
 * it fence-blind to match the host's `stripToolLines` more literally; that
 * would reintroduce the exact corruption this function exists to avoid.
 */
export function stripToolLines(content: string): string {
  const kept: string[] = []
  let insideFence = false
  for (const line of content.split('\n')) {
    const trimmed = line.trim()
    if (trimmed.startsWith('```')) {
      insideFence = !insideFence
      kept.push(line)
      continue
    }
    if (insideFence) {
      kept.push(line)
      continue
    }
    if (TOOL_CALL_RE.test(trimmed) || TOOL_RESULT_RE.test(trimmed)) {
      continue
    }
    kept.push(line)
  }
  return kept.join('\n')
}
