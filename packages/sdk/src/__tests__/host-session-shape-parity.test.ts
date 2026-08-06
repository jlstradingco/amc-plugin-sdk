import { describe, it, expect, expectTypeOf } from 'vitest'
import { createTestContext, createMockSessionMessage } from '../testing/index.js'
import type {
  HistoryMessage,
  PluginSessions,
  SessionMessage,
  SessionStatus,
} from '../types/context.js'
import type { BridgeSession, BridgeSessionMessage } from '../types/bridge.js'
import {
  HOST_MESSAGE_SURFACES,
  HOST_SESSION_STATUSES,
  HOST_SOURCES,
} from './fixtures/host-mirror.js'

/**
 * Closes the session half of the documented drift list (spec 09-dependencies
 * §B2): one create surface that declared an option the host drops, one status
 * read with two shapes, and one message read with three.
 *
 * Verified against the host source at `origin/master` 9a95c573fa — not against
 * the mock these tests happen to drive.
 */

describe(`sessions.create parity (${HOST_SOURCES.sessionBridge}:95-110)`, () => {
  it('accepts userInitiated, the only extra key the host reads', async () => {
    const h = createTestContext({ pluginId: 'p' })
    const { sessionId } = await h.ctx.sessions.create({
      prompt: 'hello',
      userInitiated: true,
    })
    expect(sessionId).toBeTruthy()
  })

  it('no longer declares projectId, which the host has always discarded', () => {
    // The host derives the project from `__plugin_<id>__` and never reads a
    // caller-supplied one, so this option looked like it targeted a project and
    // silently did not. @ts-expect-error fails the build if it is ever re-added.
    const create = createTestContext({ pluginId: 'p' }).ctx.sessions.create
    // @ts-expect-error projectId is not a real option — the host drops it.
    void (() => create({ prompt: 'x', projectId: 'proj-1' }))
    // The SDK's own option type, compared to the host's read set — not the
    // mirror compared to itself.
    expectTypeOf<Parameters<PluginSessions['create']>[0]>().toEqualTypeOf<{
      prompt?: string
      userInitiated?: boolean
    }>()
  })

  it('keeps userInitiated OFF the webview surface, which strips it', () => {
    // bridge-method-schemas.ts:197-199 is a non-strict zod tuple, so an extra
    // key never reaches the handler. Declaring it here would swap one silent
    // wrong answer for another.
    expectTypeOf<Parameters<BridgeSession['create']>[0]>().toEqualTypeOf<{ prompt?: string }>()
  })
})

describe('getStatus returns two different shapes on two surfaces', () => {
  it('resolves a bare string on the backend', async () => {
    const h = createTestContext({ pluginId: 'p' })
    const { sessionId } = await h.ctx.sessions.create({ prompt: 'hi' })
    const status = await h.ctx.sessions.getStatus(sessionId)
    expect(typeof status, `host ${HOST_SOURCES.sessionBridge}:125-131 returns session.status`).toBe(
      'string'
    )
  })

  it('resolves an object on the webview', () => {
    // session-handler.ts:327-335 returns { status, pendingAction }. Comparing
    // that result to a string is always false — the bug this type now catches.
    type WebviewStatus = Awaited<ReturnType<BridgeSession['getStatus']>>
    expectTypeOf<WebviewStatus>().toHaveProperty('status')
    expectTypeOf<WebviewStatus['status']>().toEqualTypeOf<SessionStatus>()
    // pendingAction is nullable host-side; typing it non-null would be a new lie.
    expectTypeOf<WebviewStatus>().toHaveProperty('pendingAction')
    expectTypeOf<WebviewStatus['pendingAction']>().toBeNullable()
  })
})

describe('getMessages returns three different shapes on three surfaces', () => {
  it('names the body `text` on the backend and `content` on both webview surfaces', () => {
    // The single fact behind the `m.text ?? m.content ?? ''` hedge. Asserted
    // against the SDK's real types, so it fails if a type drifts — comparing
    // the vendored mirror to itself would pass even if every type were wrong.
    expectTypeOf<SessionMessage>().toHaveProperty(HOST_MESSAGE_SURFACES.worker.textField)
    expectTypeOf<SessionMessage>().not.toHaveProperty('content')
    expectTypeOf<BridgeSessionMessage>().toHaveProperty(HOST_MESSAGE_SURFACES.webview.textField)
    expectTypeOf<BridgeSessionMessage>().not.toHaveProperty('text')
    expectTypeOf<HistoryMessage>().toHaveProperty(
      HOST_MESSAGE_SURFACES.sessionHistory.textField
    )
  })

  it('returns real rows in the backend shape, not an empty array', async () => {
    // A mock that always resolved [] could never teach a plugin author which
    // field to read — precisely the "distrust the mock" hazard this ticket is
    // about. The harness now records what it was sent.
    const h = createTestContext({ pluginId: 'p' })
    const { sessionId } = await h.ctx.sessions.create({ prompt: 'hi' })
    await h.ctx.sessions.sendMessage(sessionId, 'a question')

    const messages = await h.ctx.sessions.getMessages(sessionId)
    expect(messages).toHaveLength(1)
    expect(messages[0]).toMatchObject({ role: 'user', text: 'a question' })
    expect(
      messages[0],
      `backend rows carry \`text\` (${HOST_SOURCES.sessionBridge}:150), never \`content\``
    ).not.toHaveProperty('content')
  })

  it('closes the role union only on sessionHistory, which drops system rows', () => {
    // The two unfiltered surfaces must therefore admit a `system` role; the
    // filtered one must not. Asserted on the SDK's types, not on the mirror.
    expectTypeOf<HistoryMessage['role']>().toEqualTypeOf<'user' | 'assistant'>()
    expectTypeOf<'system'>().toMatchTypeOf<SessionMessage['role']>()
    expectTypeOf<'system'>().toMatchTypeOf<BridgeSessionMessage['role']>()
  })
})

describe('the mock does not invent host behaviour', () => {
  it('stop() leaves a status the host can actually report', async () => {
    const h = createTestContext({ pluginId: 'p' })
    const { sessionId } = await h.ctx.sessions.create({ prompt: 'hi' })
    await h.ctx.sessions.stop(sessionId)
    // The harness used to set 'stopped', which is not one of the eleven
    // statuses in session-status.ts:22-40. Asserting membership rather than a
    // hardcoded sentinel keeps this honest if the mock's choice changes.
    expect(HOST_SESSION_STATUSES).toContain(await h.ctx.sessions.getStatus(sessionId))
  })
})

describe('createMockSessionMessage — one definition of the backend row', () => {
  it('builds the shape the backend surface really returns', () => {
    const row = createMockSessionMessage('mock-message', 3, 'hello')
    // Named `text`, not `content` — the split this whole suite exists to pin.
    expect(row).toMatchObject({ id: 'mock-message-3', role: 'user', text: 'hello' })
    expect(row).not.toHaveProperty('content')
    expect(Date.parse(row.timestamp)).not.toBeNaN()
  })

  it('is shared by both mocks, so neither can drift from the host alone', async () => {
    // The dev shell imports this same function from @agent-mc/plugin-sdk/testing.
    const h = createTestContext({ pluginId: 'p' })
    const { sessionId } = await h.ctx.sessions.create({ prompt: 'hi' })
    await h.ctx.sessions.sendMessage(sessionId, 'a question')

    const [recorded] = await h.ctx.sessions.getMessages(sessionId)
    const direct = createMockSessionMessage('test-message', 1, 'a question')
    expect(Object.keys(recorded!).sort()).toEqual(Object.keys(direct).sort())
  })
})
