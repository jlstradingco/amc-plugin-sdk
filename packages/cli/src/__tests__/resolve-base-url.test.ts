import { describe, it, expect } from 'vitest'
import { resolveBaseUrl } from '../lib/auth.js'

// F076: every authed call sends `Authorization: Bearer <id-token>` to the base URL,
// so an http:// override would put a reusable marketplace credential on the wire in
// cleartext. The override is validated; the loopback carve-out keeps local dev working.
describe('resolveBaseUrl', () => {
  it('returns the default when the override is unset or blank', () => {
    expect(resolveBaseUrl(undefined)).toBe('https://amcback.jls.dev/marketplace')
    expect(resolveBaseUrl('')).toBe('https://amcback.jls.dev/marketplace')
    expect(resolveBaseUrl('   ')).toBe('https://amcback.jls.dev/marketplace')
  })

  it('accepts an https override verbatim', () => {
    expect(resolveBaseUrl('https://staging.example.com/marketplace')).toBe(
      'https://staging.example.com/marketplace'
    )
  })

  it('strips a single trailing slash so routes never double up', () => {
    expect(resolveBaseUrl('https://example.com/marketplace/')).toBe(
      'https://example.com/marketplace'
    )
  })

  it('allows plain http only to localhost / loopback for local development', () => {
    expect(resolveBaseUrl('http://localhost:5001/marketplace')).toBe(
      'http://localhost:5001/marketplace'
    )
    expect(resolveBaseUrl('http://127.0.0.1:5001/marketplace')).toBe(
      'http://127.0.0.1:5001/marketplace'
    )
    expect(resolveBaseUrl('http://[::1]:5001/marketplace')).toBe('http://[::1]:5001/marketplace')
  })

  it('refuses a cleartext http override to a remote host', () => {
    expect(() => resolveBaseUrl('http://marketplace.evil.test')).toThrow(/https/i)
    expect(() => resolveBaseUrl('http://amcback.jls.dev/marketplace')).toThrow(/cleartext/i)
  })

  it('refuses a non-http(s) scheme', () => {
    expect(() => resolveBaseUrl('ftp://example.com')).toThrow(/https/i)
    expect(() => resolveBaseUrl('file:///etc/passwd')).toThrow()
  })

  it('refuses a value that is not a URL at all', () => {
    expect(() => resolveBaseUrl('not a url')).toThrow(/not a valid URL/i)
  })
})
