import { describe, it, expect } from 'vitest'
import type { AgentMC, BridgeEvents } from '../types/bridge.js'
import { createTestContext } from '../testing/index.js'

// ─── Compile-time canary for the renderer event bus ──────────────────────────
//
// Reuses this repo's own assertion idiom (see validators/manifest.ts, the
// `_AssertAllPermissionsListed` block) rather than adding a type-testing
// dependency.
//
// `HostBridgeEvents` below is a DELIBERATE second declaration of the shape the
// AMC host actually exposes on `window.AgentMC.events` — the `events:` namespace
// in src/preload/plugin-bridge-preload.ts, as of AMC master commit 7df2653742
// ("complete the events bus so a plugin panel can reach its own backend").
// If `BridgeEvents` drifts from it the assertion fails and `pnpm run typecheck`
// breaks — NOT the build; see the LOAD-BEARING note below — forcing a conscious
// update instead of a silent divergence between what the SDK promises and what a
// plugin actually gets.
//
// HONEST LIMIT — and it has already bitten once. This pins the SDK's own shape
// against a hand-written mirror; it CANNOT detect the host changing underneath
// us, because nothing binds the two repos. This file was first written against
// an AMC branch that never landed, while a different implementation went to
// master. Hence the commit reference above: when you update this mirror, re-read
// the preload on master and update the reference too.
//
// LOAD-BEARING: this file is typechecked ONLY by `pnpm run typecheck` —
// tsconfig.typecheck.json is the one config reaching it that does not exclude
// src/__tests__. `pnpm -r build` does NOT check it: tsconfig.json and
// tsconfig.cjs.json both exclude the tests, so the published package ships no
// specs. Verified by drifting this canary on purpose rather than by reading the
// configs: `pnpm -r build` exits 0, typecheck exits 2 on the `Eq` assertion.
//
// This note used to say the opposite — that the build covered it because
// tsconfig.json had no `exclude` — and that was wrong the day it was written,
// six days after 6c3a467 added that exclude. The guard itself was never
// unchecked: 492d064 and 5fa83fb gave the repo tsconfig.typecheck.json and the
// `typecheck` script before this file existed, and b593d9e added CI's typecheck
// step in this file's own branch. Only the note was wrong, and only about which
// command does the checking. Recorded so it is not restored.
//
// The invariant to protect: a config that does NOT exclude src/__tests__ must
// keep running in CI. Drop that step, or add an `exclude` to
// tsconfig.typecheck.json, and this canary goes quiet — vitest does not
// typecheck, so nothing else would notice. Rationale for the split:
// tsconfig.typecheck.json's own header.
type HostBridgeEvents = {
  onSessionStatus(callback: (event: unknown) => void): () => void
  emit(channel: string, data: unknown): void
  on(channel: string, handler: (data: unknown) => void): () => void
}

// INVARIANCE, not `extends`. A bidirectional `extends` pair looks strict but is not:
// TypeScript compares method parameters BIVARIANTLY and never compares parameter
// optionality at all, so `extends` cannot tell `data: unknown` from `data?: unknown`,
// nor from `data?: string`. An earlier version of this canary used `extends` and was
// blind to exactly the property it existed to pin. `Eq` compares the two types through
// identical conditional positions, which is invariant and catches all three.
type Eq<A, B> = (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2
  ? true
  : never

type _AssertBridgeEventsMatchesHost = Eq<BridgeEvents, HostBridgeEvents>
const _bridgeEventsMatchesHost: _AssertBridgeEventsMatchesHost = true
void _bridgeEventsMatchesHost

// The bus must be REACHABLE on the bridge surface, not merely exported next to it.
type _AssertAgentMcExposesEvents = AgentMC['events'] extends BridgeEvents ? true : never
const _agentMcExposesEvents: _AssertAgentMcExposesEvents = true
void _agentMcExposesEvents

// ─── Runtime: the backend bus the SDK's own test harness hands plugin authors ──
//
// The whole reason this run exists is that `PluginEvents.on` promises an
// unsubscribe the AMC host never returned. The SDK's harness DOES return one —
// but nothing asserted it worked (testing-harness.test.ts never calls `on` at
// all, while the dev-shell mock is covered). That is the same defect class one
// layer down, so it gets locked here.
describe('createTestContext events bus', () => {
  it('delivers an emitted payload to a subscriber on the same channel', () => {
    const h = createTestContext()
    const seen: unknown[] = []
    h.ctx.events.on('run.progress', (data) => seen.push(data))

    h.ctx.events.emit('run.progress', { node: 'a', pct: 50 })

    expect(seen).toEqual([{ node: 'a', pct: 50 }])
  })

  it('on() returns NOTHING on the backend — there is no unsubscribe', () => {
    // The host's worker `ctx.events.on` has no return statement, and the worker
    // protocol has no unsubscribe message at all: the handler set is
    // append-only and a subscription lives until the worker exits.
    //
    // This test used to assert the opposite, against a harness that handed back
    // a working `off()`. That is the same trap this repo cites as its
    // cautionary tale about ctx.events — a plugin cleaning up in onDisable
    // would have crashed with `off is not a function`.
    const h = createTestContext()
    const seen: unknown[] = []
    const off = h.ctx.events.on('run.progress', (data) => seen.push(data))

    expect(off).toBeUndefined()

    h.ctx.events.emit('run.progress', 1)
    h.ctx.events.emit('run.progress', 2)

    // Both land, because nothing can detach the handler.
    expect(seen).toEqual([1, 2])
  })

  it('does not leak an event across channels', () => {
    const h = createTestContext()
    const seen: unknown[] = []
    h.ctx.events.on('run.progress', (data) => seen.push(data))

    h.ctx.events.emit('run.finished', 'nope')

    expect(seen).toEqual([])
  })

  it('supports several subscribers on one channel, and detaches none of them', () => {
    const h = createTestContext()
    const a: unknown[] = []
    const b: unknown[] = []
    h.ctx.events.on('tick', (d) => a.push(d))
    h.ctx.events.on('tick', (d) => b.push(d))

    h.ctx.events.emit('tick', 1)
    h.ctx.events.emit('tick', 2)

    // Fan-out is real; selective detach is not available on this surface.
    expect(a).toEqual([1, 2])
    expect(b).toEqual([1, 2])
  })

  // toStrictEqual, not toEqual: toEqual treats a missing key and an explicit
  // `undefined` as equal, so the empty-payload half of this assertion could not fail.
  it('records every emit on the harness, including one with an empty payload', () => {
    const h = createTestContext()

    h.ctx.events.emit('with', { a: 1 })
    h.ctx.events.emit('without', undefined)

    expect(h.emittedEvents).toStrictEqual([
      { channel: 'with', data: { a: 1 } },
      { channel: 'without', data: undefined }
    ])
  })
})
