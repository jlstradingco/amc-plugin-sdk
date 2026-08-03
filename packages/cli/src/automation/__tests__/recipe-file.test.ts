import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'
import {
  findRecipeFiles,
  resolveRecipePath,
  loadRecipe,
  RecipeFileError
} from '../lib/recipe-file.js'

let dir: string
beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'amc-rf-'))
})
afterEach(() => {
  fs.rmSync(dir, { recursive: true, force: true })
})

const write = (name: string, body: unknown): void =>
  fs.writeFileSync(path.join(dir, name), JSON.stringify(body), 'utf-8')

describe('findRecipeFiles', () => {
  it('finds every *.recipe.json in a directory', () => {
    write('a.recipe.json', {})
    write('b.recipe.json', {})
    write('c.json', {})
    expect(findRecipeFiles(dir).map((p) => path.basename(p))).toEqual([
      'a.recipe.json',
      'b.recipe.json'
    ])
  })

  it('returns an empty list for a directory with none', () => {
    expect(findRecipeFiles(dir)).toEqual([])
  })

  it('returns an empty list for a directory that does not exist', () => {
    expect(findRecipeFiles(path.join(dir, 'nope'))).toEqual([])
  })
})

describe('resolveRecipePath', () => {
  it('resolves the single recipe without an explicit path', () => {
    write('only.recipe.json', {})
    expect(path.basename(resolveRecipePath(dir))).toBe('only.recipe.json')
  })

  it('errors and NAMES the candidates when ambiguous', () => {
    write('a.recipe.json', {})
    write('b.recipe.json', {})
    try {
      resolveRecipePath(dir)
      expect.unreachable('should have thrown')
    } catch (e) {
      expect(e).toBeInstanceOf(RecipeFileError)
      expect((e as RecipeFileError).suggestion).toContain('a.recipe.json')
      expect((e as RecipeFileError).suggestion).toContain('b.recipe.json')
    }
  })

  it('errors with what it looked for when none exist — never a raw ENOENT', () => {
    try {
      resolveRecipePath(dir)
      expect.unreachable('should have thrown')
    } catch (e) {
      expect((e as Error).message).toContain('.recipe.json')
      expect((e as Error).message).not.toContain('ENOENT')
    }
  })

  it('honours an explicit relative path', () => {
    write('a.recipe.json', {})
    write('b.recipe.json', {})
    expect(path.basename(resolveRecipePath(dir, 'b.recipe.json'))).toBe('b.recipe.json')
  })

  it('errors helpfully when the explicit path is missing', () => {
    try {
      resolveRecipePath(dir, 'ghost.recipe.json')
      expect.unreachable('should have thrown')
    } catch (e) {
      expect(e).toBeInstanceOf(RecipeFileError)
      expect((e as RecipeFileError).suggestion).toContain('Check the path')
    }
  })
})

describe('loadRecipe', () => {
  it('parses a valid recipe file', () => {
    write('x.recipe.json', { name: 'X', steps: [] })
    const loaded = loadRecipe(path.join(dir, 'x.recipe.json'))
    expect(loaded.recipe.name).toBe('X')
    expect(loaded.path).toContain('x.recipe.json')
    expect(loaded.raw.length).toBeGreaterThan(0)
  })

  it('reports malformed JSON without leaking the parser error', () => {
    fs.writeFileSync(path.join(dir, 'bad.recipe.json'), '{ not json', 'utf-8')
    try {
      loadRecipe(path.join(dir, 'bad.recipe.json'))
      expect.unreachable('should have thrown')
    } catch (e) {
      expect((e as Error).message).toContain('not valid JSON')
      expect((e as Error).message).not.toContain('Unexpected token')
    }
  })

  it('rejects a JSON array at the root', () => {
    write('arr.recipe.json', [1, 2])
    expect(() => loadRecipe(path.join(dir, 'arr.recipe.json'))).toThrow(RecipeFileError)
  })

  it('rejects a JSON scalar at the root', () => {
    fs.writeFileSync(path.join(dir, 'num.recipe.json'), '42', 'utf-8')
    expect(() => loadRecipe(path.join(dir, 'num.recipe.json'))).toThrow(RecipeFileError)
  })

  it('rejects a JSON null at the root', () => {
    fs.writeFileSync(path.join(dir, 'null.recipe.json'), 'null', 'utf-8')
    expect(() => loadRecipe(path.join(dir, 'null.recipe.json'))).toThrow(RecipeFileError)
  })

  it('reports an unreadable file without leaking errno', () => {
    try {
      loadRecipe(path.join(dir, 'absent.recipe.json'))
      expect.unreachable('should have thrown')
    } catch (e) {
      expect((e as Error).message).toContain('Could not read')
      expect((e as Error).message).not.toContain('ENOENT')
    }
  })
})
