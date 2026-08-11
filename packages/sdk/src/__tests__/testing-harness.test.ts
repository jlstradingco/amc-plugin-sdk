import { describe, it, expect } from 'vitest'
import { createTestContext } from '../testing/index.js'

describe('createTestContext — identity + defaults', () => {
  it('exposes plugin identity and a dataDir', () => {
    const h = createTestContext({ pluginId: 'demo', pluginVersion: '2.1.0' })
    expect(h.ctx.pluginId).toBe('demo')
    expect(h.ctx.pluginVersion).toBe('2.1.0')
    expect(typeof h.ctx.dataDir).toBe('string')
  })

  it('defaults identity when not supplied', () => {
    const h = createTestContext()
    expect(h.ctx.pluginId).toBeTruthy()
    expect(h.ctx.pluginVersion).toBeTruthy()
  })
})

describe('storage', () => {
  it('round-trips set/get/list/delete in memory', async () => {
    const { ctx } = createTestContext()
    await ctx.storage.set('a', 1)
    await ctx.storage.set('b:x', 'hi')
    await ctx.storage.set('b:y', 'yo')
    expect(await ctx.storage.get('a')).toBe(1)
    const bItems = await ctx.storage.list('b:')
    expect(bItems.map((i) => i.key).sort()).toEqual(['b:x', 'b:y'])
    await ctx.storage.delete('a')
    expect(await ctx.storage.get('a')).toBeUndefined()
  })
})

describe('db — real in-memory collection', () => {
  it('insert assigns id + timestamps and query returns rows', async () => {
    const { ctx } = createTestContext()
    const row = await ctx.db.insert('notes', { title: 'first', done: false })
    expect(row.id).toBeTruthy()
    expect(row.created_at).toBeTruthy()
    const all = await ctx.db.query('notes')
    expect(all).toHaveLength(1)
    expect(all[0].title).toBe('first')
  })

  it('query filters by where, sorts by orderBy, and limits', async () => {
    const { ctx } = createTestContext()
    await ctx.db.insert('t', { name: 'c', pri: 3 })
    await ctx.db.insert('t', { name: 'a', pri: 1 })
    await ctx.db.insert('t', { name: 'b', pri: 2 })
    await ctx.db.insert('t', { name: 'a', pri: 9 })

    const onlyA = await ctx.db.query('t', { where: { name: 'a' } })
    expect(onlyA).toHaveLength(2)

    const sorted = await ctx.db.query('t', { orderBy: { pri: 'asc' } })
    expect(sorted.map((r) => r.pri)).toEqual([1, 2, 3, 9])

    const desc = await ctx.db.query('t', { orderBy: { pri: 'desc' }, limit: 2 })
    expect(desc.map((r) => r.pri)).toEqual([9, 3])
  })

  it('getById, update, delete, deleteWhere work', async () => {
    const { ctx } = createTestContext()
    const a = await ctx.db.insert('c', { v: 1 })
    const b = await ctx.db.insert('c', { v: 2 })
    expect((await ctx.db.getById('c', String(a.id)))?.v).toBe(1)

    await ctx.db.update('c', String(a.id), { v: 42 })
    expect((await ctx.db.getById('c', String(a.id)))?.v).toBe(42)

    await ctx.db.delete('c', String(b.id))
    expect(await ctx.db.getById('c', String(b.id))).toBeNull()

    await ctx.db.deleteWhere('c', { v: 42 })
    expect(await ctx.db.query('c')).toHaveLength(0)
  })
})

describe('settings — seeded from options', () => {
  it('returns seeded values', async () => {
    const { ctx } = createTestContext({ settings: { apiKey: 'sk-1', limit: 5 } })
    expect(await ctx.settings.get('apiKey')).toBe('sk-1')
    expect(await ctx.settings.getAll()).toEqual({ apiKey: 'sk-1', limit: 5 })
  })
})

describe('capture surfaces', () => {
  it('records toasts, notifications, logs, events, badges, inbox', async () => {
    const h = createTestContext()
    h.ctx.toast.show({ type: 'success', message: 'yay' })
    h.ctx.toast.notify({ title: 'T', body: 'B' })
    h.ctx.log.info('hello', 1)
    h.ctx.log.error('boom')
    h.ctx.sidebar.setBadge(7)
    // `status` and `timestamp` are REQUIRED — the host drops the whole batch
    // silently if either is missing, so the types now insist on them.
    h.ctx.sidebar.setItems([{ id: 's1', title: 'S', status: 'idle' }])
    await h.ctx.inbox.setItems([
      { id: 'i1', title: 'I', timestamp: '2026-08-11T00:00:00.000Z' }
    ])
    h.ctx.events.emit('ch', { n: 1 })

    expect(h.toasts).toEqual([{ type: 'success', message: 'yay' }])
    expect(h.notifications).toEqual([{ title: 'T', body: 'B' }])
    expect(h.logs.filter((l) => l.level === 'error')).toHaveLength(1)
    expect(h.sidebarBadge).toBe(7)
    expect(h.sidebarItems).toHaveLength(1)
    expect(h.inboxItems).toHaveLength(1)
    expect(h.emittedEvents).toEqual([{ channel: 'ch', data: { n: 1 } }])
  })
})

describe('cron + cli triggers', () => {
  it('runCron invokes the registered handler', async () => {
    const h = createTestContext()
    let ran = 0
    h.ctx.cron.register('job', '* * * * *', async () => { ran++ })
    expect(h.ctx.cron.isRegistered('job')).toBe(true)
    await h.runCron('job')
    expect(ran).toBe(1)
  })

  it('callCli routes to the registered handler', async () => {
    const h = createTestContext()
    h.ctx.cli.handle('ping', async () => ({ status: 200, body: { pong: true } }))
    const res = await h.callCli('ping', { method: 'GET', path: 'ping' })
    expect(res.status).toBe(200)
    expect(res.body).toEqual({ pong: true })
  })

  it('callCli returns 404 for an unregistered path', async () => {
    const h = createTestContext()
    const res = await h.callCli('nope', { method: 'GET', path: 'nope' })
    expect(res.status).toBe(404)
  })
})

describe('overridable http / ai / auth', () => {
  it('uses an injected fetch', async () => {
    const h = createTestContext({
      fetch: async () => new Response('ok', { status: 201 })
    })
    const res = await h.ctx.http.fetch('https://example.test')
    expect(res.status).toBe(201)
  })

  it('http.fetch without an injected fetch rejects clearly', async () => {
    const h = createTestContext()
    await expect(h.ctx.http.fetch('https://example.test')).rejects.toThrow(/not mocked/i)
  })

  it('seeds an authenticated user when provided', async () => {
    const h = createTestContext({
      auth: { user: { uid: 'u1', email: 'a@b.co', displayName: null, photoURL: null } }
    })
    expect(await h.ctx.auth.isAuthenticated()).toBe(true)
    expect((await h.ctx.auth.getUser())?.uid).toBe('u1')
  })
})

// `spend` mirrors the HOST's real posture rather than being a friendly stub, so
// a plugin developed against it hits the same branches it will hit in AMC.
//
// The tts / sessionHistory / firebase blocks that used to sit here were deleted
// on 2026-08-11: all three are WEBVIEW-only capabilities with no backend ctx
// entry, so every one of those 12 tests was asserting the behaviour of a mock
// for a namespace that is `undefined` in production. They were the clearest
// example in the repo of a green test proving nothing.
describe('createTestContext — spend', () => {
  describe('spend', () => {
    it('reports an all-zero breakdown by default', async () => {
      const b = await createTestContext().ctx.spend.getBreakdown()
      expect(b.windows.yesterday.codingValue).toBe(0)
      expect(b.windows.week.outOfPocket).toBe(0)
      expect(b.windows.month.backgroundTotal).toBe(0)
      expect(b.codingEngines).toEqual([])
      expect(b.notableCharges).toEqual([])
    })

    it('merges a seeded breakdown over the zeroed default', async () => {
      const h = createTestContext({
        spend: { codingEngines: [{ engine: 'claude', value: 1.5, sessions: 2 }] }
      })
      const b = await h.ctx.spend.getBreakdown()
      expect(b.codingEngines).toHaveLength(1)
      // Untouched fields keep their zeroed defaults.
      expect(b.windows.yesterday.codingValue).toBe(0)
    })
  })
})
