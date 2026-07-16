import { describe, it, expect } from 'vitest'
import { evaluatePublishAccount, SWITCH_ACCOUNT_GUIDANCE } from '../lib/publish-account.js'

describe('evaluatePublishAccount', () => {
  it('asks for confirmation when signed in and not --yes', () => {
    const gate = evaluatePublishAccount('octocat', {})
    expect(gate).toEqual({ action: 'confirm', github: 'octocat' })
  })

  it('proceeds without confirmation when --yes', () => {
    expect(evaluatePublishAccount('octocat', { yes: true })).toEqual({ action: 'proceed' })
  })

  it('aborts when --as does not match the signed-in account', () => {
    const gate = evaluatePublishAccount('personal-acct', { as: 'org-acct' })
    expect(gate.action).toBe('abort')
    if (gate.action === 'abort') {
      expect(gate.message).toContain('personal-acct')
      expect(gate.message).toContain('org-acct')
      expect(gate.suggestion).toMatch(/switch-account/)
    }
  })

  it('--as match is case-insensitive and still confirms', () => {
    const gate = evaluatePublishAccount('OctoCat', { as: 'octocat' })
    expect(gate).toEqual({ action: 'confirm', github: 'OctoCat' })
  })

  it('--as match with --yes proceeds', () => {
    expect(evaluatePublishAccount('octocat', { as: 'octocat', yes: true })).toEqual({ action: 'proceed' })
  })

  it('proceeds when no stored account (auth will run next)', () => {
    expect(evaluatePublishAccount(null, {})).toEqual({ action: 'proceed' })
  })

  it('--as against no stored account does not abort (auth will run)', () => {
    expect(evaluatePublishAccount(null, { as: 'octocat' })).toEqual({ action: 'proceed' })
  })

  it('exposes actionable switch-account guidance', () => {
    expect(SWITCH_ACCOUNT_GUIDANCE).toMatch(/incognito|private/i)
    expect(SWITCH_ACCOUNT_GUIDANCE).toMatch(/github\.com\/logout/)
  })
})
