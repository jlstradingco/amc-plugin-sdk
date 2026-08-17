import { describe, it, expect } from 'vitest'
import {
  checkHostCapabilities,
  extractRoutePaths,
  surfacesReferencedBy
} from '../checks/host-capabilities.js'
import type { SdkCrossAppSurface } from '../data/cross-app-matrix.js'

// A tiny stand-in matrix. Using a fixture rather than the shipped snapshot keeps these
// assertions stable when the real matrix gains surfaces, while still exercising the
// exact code path the shipped one drives.
const MATRIX: SdkCrossAppSurface[] = [
  { surface: 'jira', pathPrefixes: ['/jira'], status: 'GET /jira/status', identity: 'issue.key' },
  {
    surface: 'supermail',
    pathPrefixes: ['/supermail'],
    status: 'GET /supermail/status',
    identity: 'thread.id'
  },
  { surface: 'kms', pathPrefixes: ['/kms'], status: null, identity: null }
]

const recipe = (over: Record<string, unknown> = {}): Record<string, unknown> => ({
  name: 'Demo',
  scope: 'global',
  executionMode: 'multi-session',
  steps: [{ name: 'Step', prompt: 'Do a thing.' }],
  ...over
})

const codes = (findings: { code: string }[]): string[] => findings.map((f) => f.code)

describe('extractRoutePaths', () => {
  it('finds a route inside a curl command', () => {
    const paths = extractRoutePaths(
      "curl -s -H 'Authorization: Bearer x' http://127.0.0.1:19519/jira/issues"
    )
    expect(paths).toContain('/jira/issues')
  })

  it('finds a route wrapped in backticks and trailing punctuation', () => {
    expect(extractRoutePaths('Call `/supermail/inbox`.')).toContain('/supermail/inbox')
  })

  it('strips a trailing sentence period from a bare path', () => {
    expect(extractRoutePaths('Then hit /jira/projects.')).toContain('/jira/projects')
  })

  it('finds parameterised routes as written in prose', () => {
    expect(extractRoutePaths('POST /supermail/threads/:id/archive')).toContain(
      '/supermail/threads/:id/archive'
    )
  })
})

describe('surfacesReferencedBy', () => {
  it('maps a route to its owning surface', () => {
    expect(surfacesReferencedBy('GET /jira/issues', MATRIX)).toEqual(['jira'])
  })

  it('finds every distinct surface in one text', () => {
    expect(
      surfacesReferencedBy('GET /jira/issues then POST /supermail/threads/x/archive', MATRIX)
    ).toEqual(['jira', 'supermail'])
  })

  it('does not report a surface for unrelated prose', () => {
    expect(surfacesReferencedBy('Summarise the week and/or the month.', MATRIX)).toEqual([])
  })

  it('does not mistake a filesystem path for a route', () => {
    expect(surfacesReferencedBy('Read /etc/hosts and report.', MATRIX)).toEqual([])
  })
})

describe('checkHostCapabilities', () => {
  it('passes a listing that declares exactly what it uses', () => {
    const findings = checkHostCapabilities(
      recipe({
        requiresApps: ['jira'],
        steps: [{ name: 'Read', prompt: 'Call GET /jira/issues and summarise.' }]
      }),
      MATRIX
    )
    expect(codes(findings)).toEqual([])
  })

  it('errors when a step calls an app the listing never declared', () => {
    // The headline case: invisible at publish, invisible at install, fatal mid-run.
    const findings = checkHostCapabilities(
      recipe({ steps: [{ name: 'Read', prompt: 'Call GET /jira/issues.' }] }),
      MATRIX
    )
    expect(codes(findings)).toContain('undeclared-required-app')
    expect(findings.find((f) => f.code === 'undeclared-required-app')?.severity).toBe('error')
  })

  it('names the offending app in the message so the fix is obvious', () => {
    const findings = checkHostCapabilities(
      recipe({ steps: [{ name: 'S', prompt: 'GET /supermail/inbox' }] }),
      MATRIX
    )
    expect(findings[0].message).toContain('supermail')
    expect(findings[0].fix).toContain('supermail')
  })

  it('warns — but does not block — on a declared app the listing never calls', () => {
    const findings = checkHostCapabilities(recipe({ requiresApps: ['jira'] }), MATRIX)
    const unused = findings.find((f) => f.code === 'unused-required-app')
    expect(unused?.severity).toBe('warning')
  })

  it('errors on an app name that is not a real surface', () => {
    const findings = checkHostCapabilities(recipe({ requiresApps: ['jjira'] }), MATRIX)
    expect(codes(findings)).toContain('unknown-required-app')
    expect(findings.find((f) => f.code === 'unknown-required-app')?.severity).toBe('error')
  })

  it('does not also report an unknown app as unused', () => {
    // One problem, one finding — reporting the same typo twice buries the real fix.
    const findings = checkHostCapabilities(recipe({ requiresApps: ['jjira'] }), MATRIX)
    expect(codes(findings)).not.toContain('unused-required-app')
  })

  it('flags a declared app that cannot be preflighted, as info only', () => {
    const findings = checkHostCapabilities(
      recipe({
        requiresApps: ['kms'],
        steps: [{ name: 'S', prompt: 'GET /kms/notes' }]
      }),
      MATRIX
    )
    const unpreflightable = findings.find((f) => f.code === 'unpreflightable-required-app')
    expect(unpreflightable?.severity).toBe('info')
  })

  it('scans pipeline steps, not just the top-level steps array', () => {
    // Pipelines ride the publish envelope, so a dependency hidden in one travels too.
    const findings = checkHostCapabilities(
      recipe({
        steps: [{ name: 'Top', prompt: 'Nothing here.' }],
        pipelines: { review: [{ name: 'Deep', prompt: 'Call GET /jira/issues.' }] }
      }),
      MATRIX
    )
    expect(codes(findings)).toContain('undeclared-required-app')
  })

  it('scans the top-level description too', () => {
    const findings = checkHostCapabilities(
      recipe({ description: 'This automation reads GET /jira/issues.' }),
      MATRIX
    )
    expect(codes(findings)).toContain('undeclared-required-app')
  })

  it('passes a listing that touches no AMC app at all', () => {
    const findings = checkHostCapabilities(
      recipe({ steps: [{ name: 'Think', prompt: 'Summarise the attached text.' }] }),
      MATRIX
    )
    expect(codes(findings)).toEqual([])
  })

  it('tolerates a malformed requiresApps without throwing', () => {
    // Remote-untrusted input reaches this check via a hand-edited file.
    expect(() => checkHostCapabilities(recipe({ requiresApps: 'jira' }), MATRIX)).not.toThrow()
    expect(() =>
      checkHostCapabilities(recipe({ requiresApps: [1, null, 'jira'] }), MATRIX)
    ).not.toThrow()
  })

  it('every error-severity finding carries a fix', () => {
    const findings = checkHostCapabilities(
      recipe({ requiresApps: ['nope'], steps: [{ name: 'S', prompt: 'GET /jira/issues' }] }),
      MATRIX
    )
    for (const f of findings.filter((x) => x.severity === 'error')) {
      expect(f.fix, `${f.code} has no fix`).toBeTruthy()
    }
  })
})
