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
// If `BridgeEvents` drifts from it the assertion fails and the BUILD breaks,
// forcing a conscious update instead of a silent divergence between what the SDK
// promises and what a plugin actually gets.
//
// HONEST LIMIT — and it has already bitten once. This pins the SDK's own shape
// against a hand-written mirror; it CANNOT detect the host changing underneath
// us, because nothing binds the two repos. This file was first written against
// an AMC branch that never landed, while a different implementation went to
// master. Hence the commit reference above: when you update this mirror, re-read
// the preload on master and update the reference too.
//
// LOAD-BEARING: this file is typechecked only because packages/sdk/tsconfig.json
// is `include: ["src"]` with no `exclude`. If a future change excludes
// src/__tests__ from the build (e.g. to stop shipping dist/__tests__ to
// consumers), MOVE this canary into shipped source — vitest does not typecheck,
// so it would otherwise stop being checked silently.
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

  it('the unsubscribe returned by on() actually stops delivery', () => {
    const h = createTestContext()
    const seen: unknown[] = []
    const off = h.ctx.events.on('run.progress', (data) => seen.push(data))

    h.ctx.events.emit('run.progress', 1)
    off()
    h.ctx.events.emit('run.progress', 2)

    expect(seen).toEqual([1])
  })

  it('does not leak an event across channels', () => {
    const h = createTestContext()
    const seen: unknown[] = []
    h.ctx.events.on('run.progress', (data) => seen.push(data))

    h.ctx.events.emit('run.finished', 'nope')

    expect(seen).toEqual([])
  })

  it('supports several subscribers on one channel and detaches only the one unsubscribed', () => {
    const h = createTestContext()
    const a: unknown[] = []
    const b: unknown[] = []
    const offA = h.ctx.events.on('tick', (d) => a.push(d))
    h.ctx.events.on('tick', (d) => b.push(d))

    h.ctx.events.emit('tick', 1)
    offA()
    h.ctx.events.emit('tick', 2)

    expect(a).toEqual([1])
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
