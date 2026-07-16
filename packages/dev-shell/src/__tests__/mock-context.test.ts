import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'
import { createMockContext } from '../mock-context'

describe('createMockContext', () => {
  let ctx: ReturnType<typeof createMockContext>

  beforeEach(() => {
    ctx = createMockContext({ pluginId: 'test', pluginVersion: '1.0.0', logToConsole: false })
  })

  it('sets pluginId and version', () => {
    expect(ctx.pluginId).toBe('test')
    expect(ctx.pluginVersion).toBe('1.0.0')
  })

  it('storage get/set round-trips', async () => {
    await ctx.storage.set('key', { hello: 'world' })
    const val = await ctx.storage.get('key')
    expect(val).toEqual({ hello: 'world' })
  })

  it('storage delete removes key', async () => {
    await ctx.storage.set('key', 'val')
    await ctx.storage.delete('key')
    expect(await ctx.storage.get('key')).toBeUndefined()
  })

  it('storage list returns all keys', async () => {
    await ctx.storage.set('a', 1)
    await ctx.storage.set('b', 2)
    const items = await ctx.storage.list()
    expect(items).toHaveLength(2)
    expect(items.map(i => i.key).sort()).toEqual(['a', 'b'])
  })

  it('storage list filters by prefix', async () => {
    await ctx.storage.set('user:name', 'Steve')
    await ctx.storage.set('user:age', 30)
    await ctx.storage.set('config:theme', 'dark')
    const items = await ctx.storage.list('user:')
    expect(items).toHaveLength(2)
  })

  it('events emit and on work', () => {
    const received: unknown[] = []
    ctx.events.on('test-event', (data) => received.push(data))
    ctx.events.emit('test-event', { msg: 'hello' })
    expect(received).toEqual([{ msg: 'hello' }])
  })

  it('events on returns unsubscribe function', () => {
    const received: unknown[] = []
    const unsub = ctx.events.on('test', (data) => received.push(data))
    ctx.events.emit('test', 1)
    unsub()
    ctx.events.emit('test', 2)
    expect(received).toEqual([1])
  })

  it('log methods are callable', () => {
    expect(() => ctx.log.info('hello')).not.toThrow()
    expect(() => ctx.log.warn('warning')).not.toThrow()
    expect(() => ctx.log.error('error')).not.toThrow()
    expect(() => ctx.log.debug('debug')).not.toThrow()
  })

  it('sidebar setBadge and setItems are callable', () => {
    expect(() => ctx.sidebar.setBadge(5)).not.toThrow()
    expect(() => ctx.sidebar.setItems([{ id: '1', title: 'Test' }])).not.toThrow()
  })
})

describe('createMockContext — faithful db', () => {
  let ctx: ReturnType<typeof createMockContext>

  beforeEach(() => {
    ctx = createMockContext({ pluginId: 'test', pluginVersion: '1.0.0', logToConsole: false })
  })

  it('insert assigns id + created_at/updated_at and returns the row', async () => {
    const row = await ctx.db.insert('todos', { title: 'Buy milk', done: false })
    expect(row.id).toEqual(expect.any(String))
    expect(row.title).toBe('Buy milk')
    expect(row.done).toBe(false)
    expect(row.created_at).toEqual(expect.any(String))
    expect(row.updated_at).toEqual(expect.any(String))
  })

  it('query returns previously inserted rows (not empty)', async () => {
    await ctx.db.insert('todos', { title: 'a' })
    await ctx.db.insert('todos', { title: 'b' })
    const rows = await ctx.db.query('todos')
    expect(rows).toHaveLength(2)
    expect(rows.map((r) => r.title)).toEqual(['a', 'b'])
  })

  it('query is scoped per collection', async () => {
    await ctx.db.insert('todos', { title: 'a' })
    await ctx.db.insert('notes', { title: 'n' })
    expect(await ctx.db.query('todos')).toHaveLength(1)
    expect(await ctx.db.query('notes')).toHaveLength(1)
  })

  it('query filters by where (equality, all keys AND-ed)', async () => {
    await ctx.db.insert('todos', { title: 'a', done: true })
    await ctx.db.insert('todos', { title: 'b', done: false })
    await ctx.db.insert('todos', { title: 'c', done: true })
    const done = await ctx.db.query('todos', { where: { done: true } })
    expect(done.map((r) => r.title).sort()).toEqual(['a', 'c'])
    const oneMatch = await ctx.db.query('todos', { where: { done: true, title: 'a' } })
    expect(oneMatch).toHaveLength(1)
  })

  it('query orders by orderBy + order (ASC default, DESC honored)', async () => {
    await ctx.db.insert('nums', { n: 3 })
    await ctx.db.insert('nums', { n: 1 })
    await ctx.db.insert('nums', { n: 2 })
    const asc = await ctx.db.query('nums', { orderBy: 'n' })
    expect(asc.map((r) => r.n)).toEqual([1, 2, 3])
    const desc = await ctx.db.query('nums', { orderBy: 'n', order: 'DESC' })
    expect(desc.map((r) => r.n)).toEqual([3, 2, 1])
  })

  it('query applies offset then limit', async () => {
    for (let i = 0; i < 5; i++) await ctx.db.insert('nums', { n: i })
    const page = await ctx.db.query('nums', { orderBy: 'n', limit: 2, offset: 1 })
    expect(page.map((r) => r.n)).toEqual([1, 2])
  })

  it('getById returns the stored row or null', async () => {
    const row = await ctx.db.insert('todos', { title: 'a' })
    const found = await ctx.db.getById('todos', row.id as string)
    expect(found?.title).toBe('a')
    expect(await ctx.db.getById('todos', 'missing')).toBeNull()
  })

  it('update merges fields, bumps updated_at, and persists', async () => {
    const row = await ctx.db.insert('todos', { title: 'a', done: false })
    const updated = await ctx.db.update('todos', row.id as string, { done: true })
    expect(updated.done).toBe(true)
    expect(updated.title).toBe('a')
    const reread = await ctx.db.getById('todos', row.id as string)
    expect(reread?.done).toBe(true)
  })

  it('update throws for an unknown id', async () => {
    await expect(ctx.db.update('todos', 'nope', { done: true })).rejects.toThrow()
  })

  it('delete removes a single row', async () => {
    const row = await ctx.db.insert('todos', { title: 'a' })
    await ctx.db.delete('todos', row.id as string)
    expect(await ctx.db.query('todos')).toHaveLength(0)
  })

  it('deleteWhere removes all matching rows', async () => {
    await ctx.db.insert('todos', { title: 'a', done: true })
    await ctx.db.insert('todos', { title: 'b', done: false })
    await ctx.db.insert('todos', { title: 'c', done: true })
    await ctx.db.deleteWhere('todos', { done: true })
    const left = await ctx.db.query('todos')
    expect(left.map((r) => r.title)).toEqual(['b'])
  })

  it('returned rows are copies — mutating them does not corrupt the store', async () => {
    const row = await ctx.db.insert('todos', { title: 'a' })
    ;(row as Record<string, unknown>).title = 'mutated'
    const reread = await ctx.db.getById('todos', row.id as string)
    expect(reread?.title).toBe('a')
  })
})

describe('createMockContext — persisted storage', () => {
  let dir: string

  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'amc-mock-storage-'))
  })

  afterEach(() => {
    fs.rmSync(dir, { recursive: true, force: true })
  })

  it('persists storage to dataDir and reloads it in a fresh context', async () => {
    const a = createMockContext({
      pluginId: 'test',
      pluginVersion: '1.0.0',
      logToConsole: false,
      dataDir: dir,
    })
    await a.storage.set('greeting', { hello: 'world' })
    await a.storage.set('count', 42)

    const b = createMockContext({
      pluginId: 'test',
      pluginVersion: '1.0.0',
      logToConsole: false,
      dataDir: dir,
    })
    expect(await b.storage.get('greeting')).toEqual({ hello: 'world' })
    expect(await b.storage.get('count')).toBe(42)
  })

  it('delete is persisted across contexts', async () => {
    const a = createMockContext({ pluginId: 'test', pluginVersion: '1.0.0', logToConsole: false, dataDir: dir })
    await a.storage.set('k', 'v')
    await a.storage.delete('k')
    const b = createMockContext({ pluginId: 'test', pluginVersion: '1.0.0', logToConsole: false, dataDir: dir })
    expect(await b.storage.get('k')).toBeUndefined()
  })

  it('does NOT write to disk when no dataDir is provided', async () => {
    const c = createMockContext({ pluginId: 'test', pluginVersion: '1.0.0', logToConsole: false })
    await c.storage.set('k', 'v')
    expect(await c.storage.get('k')).toBe('v')
    // no throw, purely in-memory — nothing to assert on disk
  })
})

describe('createMockContext — settings from dev config', () => {
  it('settings.getAll returns the seeded dev config', async () => {
    const ctx = createMockContext({
      pluginId: 'test',
      pluginVersion: '1.0.0',
      logToConsole: false,
      settings: { apiKey: 'dev-key', maxItems: 10 },
    })
    expect(await ctx.settings.getAll()).toEqual({ apiKey: 'dev-key', maxItems: 10 })
    expect(await ctx.settings.get('apiKey')).toBe('dev-key')
    expect(await ctx.settings.get('maxItems')).toBe(10)
  })

  it('settings.get returns undefined for an unknown key', async () => {
    const ctx = createMockContext({ pluginId: 'test', pluginVersion: '1.0.0', logToConsole: false })
    expect(await ctx.settings.get('nope')).toBeUndefined()
    expect(await ctx.settings.getAll()).toEqual({})
  })

  it('settings.getAll returns a copy — mutation does not leak back', async () => {
    const ctx = createMockContext({
      pluginId: 'test',
      pluginVersion: '1.0.0',
      logToConsole: false,
      settings: { a: 1 },
    })
    const all = await ctx.settings.getAll()
    ;(all as Record<string, unknown>).a = 999
    expect(await ctx.settings.get('a')).toBe(1)
  })
})
