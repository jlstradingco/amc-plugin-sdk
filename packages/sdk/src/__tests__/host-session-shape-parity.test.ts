import { describe, it, expect, expectTypeOf } from 'vitest'
import { createTestContext } from '../testing/index.js'
import type { SessionMessage, SessionStatus } from '../types/context.js'
import type { BridgeSession, BridgeSessionMessage } from '../types/bridge.js'
import {
  HOST_MESSAGE_SURFACES,
  HOST_SESSION_CREATE_KEYS,
  HOST_BRIDGE_SESSION_CREATE_KEYS,
  HOST_SOURCES,
} from './fixtures/host-manifest-mirror.js'

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
    expect(HOST_SESSION_CREATE_KEYS).toEqual(['prompt', 'userInitiated'])
  })

  it('keeps userInitiated OFF the webview surface, which strips it', () => {
    // bridge-method-schemas.ts:197-199 is a non-strict zod tuple, so an extra
    // key never reaches the handler. Declaring it here would swap one silent
    // wrong answer for another.
    expect(HOST_BRIDGE_SESSION_CREATE_KEYS).toEqual(['prompt'])
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
    // The single fact behind the `m.text ?? m.content ?? ''` hedge.
    expect(HOST_MESSAGE_SURFACES.worker.textField).toBe('text')
    expect(HOST_MESSAGE_SURFACES.webview.textField).toBe('content')
    expect(HOST_MESSAGE_SURFACES.sessionHistory.textField).toBe('content')

    expectTypeOf<SessionMessage>().toHaveProperty('text')
    expectTypeOf<BridgeSessionMessage>().toHaveProperty('content')
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

  it('only the backend surface is genuinely unfiltered', () => {
    // The dependency ledger calls the webview surface "raw"; it is not. It
    // filters metadata.partial === true at session-handler.ts:318. Recording
    // the correction here so the SDK documents what is true.
    expect(HOST_MESSAGE_SURFACES.worker.filtersPartialRows).toBe(false)
    expect(HOST_MESSAGE_SURFACES.webview.filtersPartialRows).toBe(true)
    expect(HOST_MESSAGE_SURFACES.sessionHistory.filtersPartialRows).toBe(true)
  })

  it('only sessionHistory drops system rows and closes the role union', () => {
    expect(HOST_MESSAGE_SURFACES.worker.keepsSystemRows).toBe(true)
    expect(HOST_MESSAGE_SURFACES.webview.keepsSystemRows).toBe(true)
    expect(HOST_MESSAGE_SURFACES.sessionHistory.keepsSystemRows).toBe(false)
    expect(HOST_MESSAGE_SURFACES.sessionHistory.closedRoleUnion).toBe(true)
    expect(HOST_MESSAGE_SURFACES.sessionHistory.extractsText).toBe(true)
  })
})

describe('the mock does not invent host behaviour', () => {
  it('stop() leaves a status the host can actually report', async () => {
    const h = createTestContext({ pluginId: 'p' })
    const { sessionId } = await h.ctx.sessions.create({ prompt: 'hi' })
    await h.ctx.sessions.stop(sessionId)
    // The harness used to set 'stopped', which is not one of the eleven
    // statuses in session-status.ts:22-40.
    expect(await h.ctx.sessions.getStatus(sessionId)).toBe('ended')
  })
})
