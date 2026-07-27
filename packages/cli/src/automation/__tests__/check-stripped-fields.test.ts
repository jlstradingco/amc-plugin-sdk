import { describe, it, expect } from 'vitest'
import { checkStrippedFields } from '../checks/stripped-fields.js'

const codes = (recipe: Record<string, unknown>): string[] =>
  checkStrippedFields(recipe).map((f) => f.code)

describe('checkStrippedFields', () => {
  it('says nothing about a recipe whose every field travels', () => {
    expect(
      checkStrippedFields({
        name: 'Digest',
        description: 'd',
        executionMode: 'multi-session',
        steps: [{ name: 'a', prompt: 'b' }]
      })
    ).toEqual([])
  })

  it('says nothing about an empty recipe', () => {
    expect(checkStrippedFields({})).toEqual([])
  })

  describe('top-level fields', () => {
    it('names an unexpected field that will not be published', () => {
      const found = checkStrippedFields({ name: 'D', notAThing: 1 })
      expect(found).toHaveLength(1)
      expect(found[0]?.code).toBe('field-not-published')
      expect(found[0]?.message).toContain('"notAThing"')
    })

    it('stays advisory — it never blocks a publish', () => {
      expect(checkStrippedFields({ name: 'D', notAThing: 1 })[0]?.severity).toBe('info')
    })

    it('carries a remedy that mentions a typo, the usual cause', () => {
      expect(checkStrippedFields({ name: 'D', notAThing: 1 })[0]?.fix).toContain('spelling')
    })

    it('names several fields in one finding, sorted', () => {
      const found = checkStrippedFields({ name: 'D', zebra: 1, alpha: 2 })
      expect(found).toHaveLength(1)
      expect(found[0]?.message).toContain('"alpha", "zebra"')
    })

    it('reads naturally for a single field', () => {
      expect(checkStrippedFields({ notAThing: 1 })[0]?.message).toContain('carry it')
    })

    it('reads naturally for several fields', () => {
      expect(checkStrippedFields({ a: 1, b: 2 })[0]?.message).toContain('carry them')
    })

    it('stays silent about the local fields AMC itself drops on purpose', () => {
      // Every one of these is present on a recipe exported from AMC. Naming them would
      // put advisory lines in front of an author who did nothing wrong.
      expect(
        checkStrippedFields({
          name: 'D',
          id: 'r_1',
          createdAt: '2020-01-01',
          updatedAt: '2020-01-02',
          approvalStatus: 'approved',
          homeProjectId: 'p_1',
          orchestratorModel: 'sonnet',
          agentTriggerable: true,
          scope: 'global'
        })
      ).toEqual([])
    })

    it('stays silent about the fields the CLI stamps itself', () => {
      expect(checkStrippedFields({ name: 'D', schemaVersion: 1, kind: 'recipe' })).toEqual([])
    })

    it('still names an unexpected field sitting beside the expected ones', () => {
      const found = checkStrippedFields({ name: 'D', id: 'r_1', scope: 'global', typoed: 1 })
      expect(found).toHaveLength(1)
      expect(found[0]?.message).toContain('"typoed"')
      expect(found[0]?.message).not.toContain('"scope"')
    })
  })

  describe('step fields', () => {
    it('names an unexpected step field', () => {
      const found = checkStrippedFields({ steps: [{ name: 'a', prompt: 'b', notAThing: 1 }] })
      expect(found).toHaveLength(1)
      expect(found[0]?.code).toBe('step-field-not-published')
      expect(found[0]?.message).toContain('"notAThing"')
    })

    it('stays advisory', () => {
      const found = checkStrippedFields({ steps: [{ name: 'a', notAThing: 1 }] })
      expect(found[0]?.severity).toBe('info')
    })

    it('collapses the same field across many steps into one line', () => {
      const found = checkStrippedFields({
        steps: [
          { name: 'a', notAThing: 1 },
          { name: 'b', notAThing: 2 },
          { name: 'c', notAThing: 3 }
        ]
      })
      expect(found).toHaveLength(1)
      expect(found[0]?.message).toContain('"notAThing"')
    })

    it('covers steps inside pipelines', () => {
      const found = checkStrippedFields({ pipelines: { review: [{ name: 'r', notAThing: 1 }] } })
      expect(found.map((f) => f.code)).toEqual(['step-field-not-published'])
    })

    it('stays silent about the four non-portable fields, which are already errors', () => {
      // `checkPortability` explains what each of these breaks for the importer. A
      // second, vaguer line about the same mistake is noise.
      expect(
        checkStrippedFields({
          steps: [
            {
              name: 'a',
              prompt: 'b',
              script: './x.sh',
              subRecipe: 'other',
              promptFile: './p.txt',
              targetProjectId: 'p_1'
            }
          ]
        })
      ).toEqual([])
    })

    it('stays silent about a step id, which every exported recipe carries', () => {
      expect(checkStrippedFields({ steps: [{ id: 's_1', name: 'a', prompt: 'b' }] })).toEqual([])
    })

    it('keeps every allow-listed step field quiet', () => {
      expect(
        checkStrippedFields({
          steps: [
            {
              name: 'a',
              prompt: 'b',
              approvalGate: { message: 'ok?' },
              supervisor: { systemPrompt: 's' },
              timeoutMinutes: 5,
              onError: 'continue'
            }
          ]
        })
      ).toEqual([])
    })

    it('ignores an entry that is not a step at all', () => {
      // `checkSteps` reports that as a malformed-step error; there are no fields here
      // to name.
      expect(checkStrippedFields({ steps: [null, 'x'] })).toEqual([])
    })
  })

  it('reports the top-level line before the step line', () => {
    expect(codes({ topTypo: 1, steps: [{ name: 'a', stepTypo: 2 }] })).toEqual([
      'field-not-published',
      'step-field-not-published'
    ])
  })

  it('does not throw on malformed input', () => {
    expect(() => checkStrippedFields({ steps: 'nope', pipelines: 42 })).not.toThrow()
  })
})
