import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import * as fs from 'node:fs'
import * as path from 'node:path'
import * as os from 'node:os'
import { checkReadmeIsStoreText, summarizePreflight } from '../lib/publish-preflight.js'
import { readmeStoreTextResult } from '../commands/preflight.js'

const DEVELOPER_README = [
  '<p align="center">',
  '  <h1 align="center">GitHub Integration for Omniscio</h1>',
  '</p>',
  '',
  '![Version](https://img.shields.io/badge/version-1.14.1-blue)'
].join('\n')

describe('checkReadmeIsStoreText', () => {
  it('passes a plain customer README', () => {
    const result = checkReadmeIsStoreText('# Smrzz\n\nPaste a link. Get the gist.')
    expect(result.status).toBe('pass')
    expect(summarizePreflight([result]).hasFailure).toBe(false)
  })

  it('passes when there is no README (the Listing check owns that warning)', () => {
    expect(checkReadmeIsStoreText(null).status).toBe('pass')
    expect(checkReadmeIsStoreText(undefined).status).toBe('pass')
  })

  it('fails a developer README, naming the offending lines and where developer content goes', () => {
    const result = checkReadmeIsStoreText(DEVELOPER_README)
    expect(result.status).toBe('fail')
    expect(result.message).toContain('README.md line 1: raw HTML (<p align="center">)')
    expect(result.message).toContain('README.md line 2: raw HTML')
    expect(result.message).toContain('README.md line 5: a badge image')
    expect(result.suggestion).toContain('docs/DEVELOPMENT.md')
    expect(summarizePreflight([result]).hasFailure).toBe(true)
  })

  it('fails a README over the length limit and says so', () => {
    const result = checkReadmeIsStoreText('word '.repeat(700))
    expect(result.status).toBe('fail')
    expect(result.message).toContain('more than 3000 characters')
  })

  it('fails a Developer notes section but not the one-line pointer', () => {
    expect(checkReadmeIsStoreText('Intro\n\n## Developer notes\n\nBuild with npm.').status).toBe('fail')
    expect(checkReadmeIsStoreText('Intro\n\nDeveloper notes: `docs/DEVELOPMENT.md`.').status).toBe('pass')
  })
})

describe('readmeStoreTextResult (the shipped preflight wiring)', () => {
  let tmp: string

  beforeEach(() => {
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'amc-readme-preflight-'))
  })

  afterEach(() => {
    fs.rmSync(tmp, { recursive: true, force: true })
  })

  it('blocks publish when the root README.md is a developer README', () => {
    fs.writeFileSync(path.join(tmp, 'README.md'), DEVELOPER_README)
    const result = readmeStoreTextResult(tmp)
    expect(result.status).toBe('fail')
    expect(summarizePreflight([result]).hasFailure).toBe(true)
  })

  it('finds the README under a different casing, as the packager does', () => {
    fs.writeFileSync(path.join(tmp, 'Readme.MD'), DEVELOPER_README)
    expect(readmeStoreTextResult(tmp).status).toBe('fail')
  })

  it('lets a clean root README through', () => {
    fs.writeFileSync(path.join(tmp, 'README.md'), '# Plugin\n\nDoes one useful thing.')
    expect(readmeStoreTextResult(tmp).status).toBe('pass')
  })

  it('does not read a README that is not at the root', () => {
    fs.mkdirSync(path.join(tmp, 'docs'))
    fs.writeFileSync(path.join(tmp, 'docs', 'README.md'), DEVELOPER_README)
    expect(readmeStoreTextResult(tmp).status).toBe('pass')
  })

  it('passes a plugin with no README at all', () => {
    expect(readmeStoreTextResult(tmp).status).toBe('pass')
  })
})
