import { describe, expect, it } from 'vitest'
import { createRpcDouble } from '../testing/index.js'
import { HOST_INVOKE_FAILURES } from './fixtures/host-mirror.js'

// The double is only worth having if it fails and transforms data the way the host does; a
// friendlier double would let a plugin's tests pass against behaviour production never has.

const [NOT_RUNNING] = HOST_INVOKE_FAILURES.notDelivered
const STOPPED = HOST_INVOKE_FAILURES.ambiguous[1]
const NON_SERIALIZABLE = HOST_INVOKE_FAILURES.ambiguous[2]

describe('createRpcDouble', () => {
  it('delivers arguments and results through JSON, as the host does', async () => {
    const double = createRpcDouble()
    let received: unknown[] = []
    double.rpc.handle('echo', (...args) => {
      received = args
      return { when: new Date('2026-10-12T00:00:00Z'), gone: undefined, list: [undefined] }
    })
    const result = await double.backend.invoke('echo', new Date('2026-01-01T00:00:00Z'), [undefined])
    expect(received).toEqual(['2026-01-01T00:00:00.000Z', [null]])
    expect(result).toEqual({ when: '2026-10-12T00:00:00.000Z', list: [null] })
    expect(double.calls).toEqual([{ method: 'echo', args: ['2026-01-01T00:00:00.000Z', [null]] }])
  })

  it('rejects an unregistered method with the host text', async () => {
    const double = createRpcDouble()
    await expect(double.backend.invoke('demo:cmd.start')).rejects.toThrow(HOST_INVOKE_FAILURES.notDelivered[3])
  })

  it('rejects every call while stopped, and fails calls in flight when it stops', async () => {
    const double = createRpcDouble()
    double.rpc.handle('forever', () => new Promise(() => {}))
    const inFlight = double.backend.invoke('forever')
    double.setStopped(true)
    await expect(inFlight).rejects.toThrow(STOPPED)
    await expect(double.backend.invoke('forever')).rejects.toThrow(NOT_RUNNING)
    double.setStopped(false)
    double.rpc.handle('ok', () => 1)
    await expect(double.backend.invoke('ok')).resolves.toBe(1)
  })

  it('flattens a thrown error to its message, as the host does', async () => {
    const double = createRpcDouble()
    class DetailedError extends Error {
      code = 'E_DETAIL'
    }
    double.rpc.handle('fail', () => {
      throw new DetailedError('kept only as text')
    })
    const error = await double.backend.invoke('fail').catch((err: unknown) => err)
    expect(error).toBeInstanceOf(Error)
    expect(error).not.toBeInstanceOf(DetailedError)
    expect(error).toMatchObject({ message: 'kept only as text' })
    expect((error as { code?: string }).code).toBeUndefined()
  })

  it('fails a result that is not JSON data with the host text, and such arguments before sending', async () => {
    const double = createRpcDouble()
    double.rpc.handle('big', () => BigInt(1))
    await expect(double.backend.invoke('big')).rejects.toThrow(NON_SERIALIZABLE)
    double.rpc.handle('noop', () => null)
    await expect(double.backend.invoke('noop', BigInt(1))).rejects.toThrow(/not serialisable/)
    expect(double.calls).toEqual([{ method: 'big', args: [] }])
  })

  it('stops calling a handler once it is removed', async () => {
    const double = createRpcDouble()
    double.rpc.handle('gone', () => 1)
    double.rpc.removeHandler('gone')
    await expect(double.backend.invoke('gone')).rejects.toThrow(/No backend handler registered/)
  })
})
