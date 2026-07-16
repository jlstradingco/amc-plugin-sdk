import { describe, it, expect } from 'vitest'
import { parseTagsInput } from '../commands/create.js'

describe('parseTagsInput', () => {
  it('splits, trims and lowercases comma-separated tags in order', () => {
    expect(parseTagsInput('Linter, Security ,  DevOps', 'other')).toEqual([
      'linter',
      'security',
      'devops',
    ])
  })

  it('falls back to the category when the input is empty or missing', () => {
    expect(parseTagsInput('', 'productivity')).toEqual(['productivity'])
    expect(parseTagsInput(undefined, 'development')).toEqual(['development'])
    expect(parseTagsInput('   ,  , ', 'testing')).toEqual(['testing'])
  })

  it('dedupes and drops control chars / angle brackets / over-long tags', () => {
    expect(parseTagsInput('chat, chat, <script>, ' + 'x'.repeat(31) + ', ok', 'other')).toEqual([
      'chat',
      'ok',
    ])
  })

  it('caps the list at 10 tags', () => {
    const many = Array.from({ length: 15 }, (_, i) => `t${i}`).join(',')
    expect(parseTagsInput(many, 'other')).toHaveLength(10)
  })
})
