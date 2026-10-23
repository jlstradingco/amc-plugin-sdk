import { describe, it, expect } from 'vitest'
import {
  DEVELOPMENT_DOC,
  MAX_README_CHARS,
  describeReadmeProblems,
  findReadmeProblems
} from '../lib/readme-guard.js'

const CLEAN = [
  '# Smrzz',
  '',
  'Paste a link. Get the gist of any page.',
  '',
  '## What you get',
  '',
  '- A summary of a web page, video or podcast.',
  '- Docs at <https://example.com/docs> or mail <help@example.com>.',
  '',
  'Developer notes: `docs/DEVELOPMENT.md`.'
].join('\n')

const rulesOf = (readme: string): string[] => findReadmeProblems(readme).map((p) => p.rule)

describe('findReadmeProblems — what is allowed', () => {
  it('passes a plain customer README, including autolinks and the one-line development pointer', () => {
    expect(findReadmeProblems(CLEAN)).toEqual([])
  })

  it('passes an empty README', () => {
    expect(findReadmeProblems('')).toEqual([])
  })

  it('does not flag a tag inside a fenced code block, whatever the fence style', () => {
    const backticks = 'Run it:\n\n```html\n<p align="center">x</p>\n```\n\nDone.'
    const tildes = 'Run it:\n\n~~~\n<img src="a.png">\n~~~\n\nDone.'
    expect(findReadmeProblems(backticks)).toEqual([])
    expect(findReadmeProblems(tildes)).toEqual([])
  })

  it('does not flag a tag inside inline code', () => {
    expect(findReadmeProblems('Write `<div>` to open a box.')).toEqual([])
  })

  it('keeps scanning after a fence closes', () => {
    const readme = '```\n<b>code</b>\n```\n<b>prose</b>'
    expect(findReadmeProblems(readme)).toEqual([
      { rule: 'raw-html', line: 4, excerpt: '<b>' }
    ])
  })

  it('does not close a backtick fence with a shorter or different fence', () => {
    const readme = '````\n```\n<b>still code</b>\n~~~\n````\nplain'
    expect(findReadmeProblems(readme)).toEqual([])
  })

  it('allows a normal markdown image that is not a badge', () => {
    expect(findReadmeProblems('![Dashboard](https://cdn.example.com/dashboard.png)')).toEqual([])
  })

  it('allows prose that merely contains a less-than sign', () => {
    expect(findReadmeProblems('Keep it under 5 < 10 items and 3 > 2 tasks.')).toEqual([])
  })
})

describe('findReadmeProblems — raw HTML', () => {
  it('flags the GitHub-style centred header with the line of each offending tag', () => {
    const readme = '<p align="center">\n  <h1 align="center">Title</h1>\n</p>'
    expect(findReadmeProblems(readme)).toEqual([
      { rule: 'raw-html', line: 1, excerpt: '<p align="center">' },
      { rule: 'raw-html', line: 2, excerpt: '<h1 align="center">' },
      { rule: 'raw-html', line: 3, excerpt: '</p>' }
    ])
  })

  it.each(['<br>', '<br/>', '<br />', '<img src="a.png" alt="x">', '<details>', '</details>'])(
    'flags %s',
    (tag) => {
      expect(rulesOf(`text ${tag} text`)).toEqual(['raw-html'])
    }
  )

  it('flags a tag in a CRLF README on the right line', () => {
    expect(findReadmeProblems('one\r\ntwo\r\n<hr>\r\n')).toEqual([
      { rule: 'raw-html', line: 3, excerpt: '<hr>' }
    ])
  })

  it('ignores a leading byte order mark', () => {
    expect(findReadmeProblems('﻿# Title\n\nPlain.')).toEqual([])
  })
})

describe('findReadmeProblems — badge images', () => {
  it.each([
    '![Version](https://img.shields.io/badge/version-1.0-blue)',
    '![Build](https://badgen.net/npm/v/x)',
    '![npm](https://badge.fury.io/js/x.svg)',
    '![CI](https://github.com/o/r/actions/workflows/ci.yml/badge.svg)',
    '![cov](https://codecov.io/gh/o/r/branch/main/graph/badge.svg)'
  ])('flags %s', (badge) => {
    expect(rulesOf(badge)).toEqual(['badge-image'])
  })

  it('flags the badge inside a linked badge and names its line', () => {
    const readme = 'Intro\n\n[![Build](https://img.shields.io/badge/build-pass-green)](https://ci.example.com)'
    const problems = findReadmeProblems(readme)
    expect(problems).toHaveLength(1)
    expect(problems[0]).toMatchObject({ rule: 'badge-image', line: 3 })
  })

  it('flags every badge on a line of badges', () => {
    const row =
      '![A](https://img.shields.io/badge/a-1-blue) ![B](https://img.shields.io/badge/b-2-blue)'
    expect(rulesOf(row)).toEqual(['badge-image', 'badge-image'])
  })

  it('does not treat a URL that merely contains the word badge-guide as a badge', () => {
    expect(findReadmeProblems('![Guide](https://cdn.example.com/badge-guide.png)')).toEqual([])
  })
})

describe('findReadmeProblems — developer notes', () => {
  it.each([
    '## Developer notes',
    '# Developer Notes',
    '**Developer notes**',
    'Developer notes: run `npm run build` first, then pack.',
    'Developer notes — see the architecture below.'
  ])('flags %s', (line) => {
    expect(rulesOf(`Intro\n\n${line}`)).toEqual(['developer-notes'])
  })

  it('allows the one-line pointer to docs/DEVELOPMENT.md in its common spellings', () => {
    expect(findReadmeProblems('Developer notes: `docs/DEVELOPMENT.md`.')).toEqual([])
    expect(findReadmeProblems('developer notes: docs/DEVELOPMENT.md')).toEqual([])
  })

  it('does not flag a sentence that only mentions the phrase mid-line', () => {
    expect(findReadmeProblems('We keep our developer notes in a separate file.')).toEqual([])
  })
})

describe('findReadmeProblems — length', () => {
  it('passes a README of exactly the limit', () => {
    expect(findReadmeProblems('a'.repeat(MAX_README_CHARS))).toEqual([])
  })

  it('flags one character over the limit and names the line where the limit is crossed', () => {
    const readme = `${'a'.repeat(MAX_README_CHARS - 10)}\n${'b'.repeat(11)}`
    const problems = findReadmeProblems(readme)
    expect(problems).toHaveLength(1)
    expect(problems[0]).toMatchObject({ rule: 'too-long', line: 2 })
    expect(problems[0]!.excerpt).toBe(`${readme.length} characters`)
  })
})

describe('describeReadmeProblems', () => {
  it('names each offending line and the rule it broke', () => {
    const message = describeReadmeProblems(findReadmeProblems('ok\n<p align="center">'))
    expect(message).toBe('README.md line 2: raw HTML (<p align="center">)')
  })

  it('caps the list at five and says how many more there are', () => {
    const readme = Array.from({ length: 8 }, () => '<hr>').join('\n')
    const message = describeReadmeProblems(findReadmeProblems(readme))
    expect(message.split('; ')).toHaveLength(6)
    expect(message).toContain('README.md line 5:')
    expect(message).not.toContain('README.md line 6:')
    expect(message.endsWith('and 3 more')).toBe(true)
  })

  it('clips a very long excerpt', () => {
    const tag = `<span ${'x'.repeat(200)}>`
    const [problem] = findReadmeProblems(tag)
    expect(problem!.excerpt.length).toBeLessThanOrEqual(63)
    expect(problem!.excerpt.endsWith('...')).toBe(true)
  })

  it('exposes the document authors should move developer content to', () => {
    expect(DEVELOPMENT_DOC).toBe('docs/DEVELOPMENT.md')
  })
})
