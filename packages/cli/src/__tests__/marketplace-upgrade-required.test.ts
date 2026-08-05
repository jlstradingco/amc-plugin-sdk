import { describe, it, expect } from 'vitest'
import {
  MarketplaceApiError,
  MarketplaceUpgradeRequiredError,
  UPGRADE_REQUIRED_STATUS,
  getRegistry
} from '../lib/marketplace-api.js'

/**
 * The published CLI hardcodes its marketplace URL, so once the legacy Cloud Functions are switched
 * off an old install has exactly one chance to explain itself: the 426 it gets back. These cases
 * pin that it is raised as its own error type and always names the command that fixes it.
 */

function withFetch<T>(impl: typeof globalThis.fetch, run: () => Promise<T>): Promise<T> {
  const original = globalThis.fetch
  globalThis.fetch = impl
  return run().finally(() => {
    globalThis.fetch = original
  })
}

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' }
  })
}

describe('426 Upgrade Required', () => {
  it('is raised as MarketplaceUpgradeRequiredError, not a generic API error', async () => {
    await withFetch(
      async () => jsonResponse(UPGRADE_REQUIRED_STATUS, { error: true, code: 'UPGRADE_REQUIRED', message: 'Update to 2.0.0.' }),
      async () => {
        await expect(getRegistry()).rejects.toBeInstanceOf(MarketplaceUpgradeRequiredError)
      }
    )
  })

  it('is still a MarketplaceApiError, so existing catch blocks keep working', async () => {
    await withFetch(
      async () => jsonResponse(UPGRADE_REQUIRED_STATUS, {}),
      async () => {
        await expect(getRegistry()).rejects.toBeInstanceOf(MarketplaceApiError)
      }
    )
  })

  it('always names the exact command that fixes it', async () => {
    await withFetch(
      async () => jsonResponse(UPGRADE_REQUIRED_STATUS, { error: true, code: 'UPGRADE_REQUIRED', message: 'Update to 2.0.0.' }),
      async () => {
        await expect(getRegistry()).rejects.toThrow(/npm i -g @agent-mc\/plugin-cli@latest/)
      }
    )
  })

  it('echoes a short server message alongside the fix', async () => {
    await withFetch(
      async () => jsonResponse(UPGRADE_REQUIRED_STATUS, { error: true, code: 'UPGRADE_REQUIRED', message: 'Update to 2.0.0 or newer.' }),
      async () => {
        await expect(getRegistry()).rejects.toThrow(/Update to 2\.0\.0 or newer\./)
      }
    )
  })

  it('falls back to its own copy when the body carries no message', async () => {
    await withFetch(
      async () => jsonResponse(UPGRADE_REQUIRED_STATUS, {}),
      async () => {
        await expect(getRegistry()).rejects.toThrow(/too old to use the marketplace/i)
      }
    )
  })

  it('falls back when the body is not JSON', async () => {
    await withFetch(
      async () => new Response('<html>502</html>', { status: UPGRADE_REQUIRED_STATUS }),
      async () => {
        await expect(getRegistry()).rejects.toThrow(/too old to use the marketplace/i)
      }
    )
  })

  it('does not echo an unbounded server message into the terminal', async () => {
    await withFetch(
      async () => jsonResponse(UPGRADE_REQUIRED_STATUS, { error: true, code: 'UPGRADE_REQUIRED', message: 'x'.repeat(5000) }),
      async () => {
        await expect(getRegistry()).rejects.toThrow(/too old to use the marketplace/i)
      }
    )
  })

  it('carries the UPGRADE_REQUIRED code', async () => {
    await withFetch(
      async () => jsonResponse(UPGRADE_REQUIRED_STATUS, {}),
      async () => {
        try {
          await getRegistry()
          expect.unreachable('should have thrown')
        } catch (err) {
          expect((err as MarketplaceApiError).code).toBe('UPGRADE_REQUIRED')
        }
      }
    )
  })
})

describe('other statuses are unchanged', () => {
  it('a 404 stays a plain MarketplaceApiError', async () => {
    await withFetch(
      async () => jsonResponse(404, { error: true, code: 'NOT_FOUND', message: 'nope' }),
      async () => {
        await expect(getRegistry()).rejects.not.toBeInstanceOf(MarketplaceUpgradeRequiredError)
      }
    )
  })

  it('a 500 stays a plain MarketplaceApiError', async () => {
    await withFetch(
      async () => jsonResponse(500, {}),
      async () => {
        await expect(getRegistry()).rejects.toBeInstanceOf(MarketplaceApiError)
      }
    )
  })
})
