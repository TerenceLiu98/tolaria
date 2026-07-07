import { describe, expect, it } from 'vitest'
import {
  acceptedInlineAiSuggestion,
  appendInlineAiSuggestionDelta,
  completeInlineAiSuggestion,
  failInlineAiSuggestion,
  initialInlineAiSuggestionState,
  inlineTextFromBlockContent,
  selectedInlineAiBlockTarget,
  startInlineAiSuggestion,
} from './inlineAiSuggestionModel'
import type { TolariaSelectedBlock } from './toolbarBlocks'

function selectedBlock(overrides: Partial<TolariaSelectedBlock> = {}): TolariaSelectedBlock {
  return {
    content: [{ text: ' Selected block ' }],
    id: 'block-1',
    props: {},
    type: 'paragraph',
    ...overrides,
  } as TolariaSelectedBlock
}

describe('inlineAiSuggestionModel', () => {
  it('extracts visible inline text from BlockNote content arrays', () => {
    expect(inlineTextFromBlockContent(null)).toBeNull()
    expect(inlineTextFromBlockContent([{ text: '  ' }])).toBeNull()
    expect(inlineTextFromBlockContent([
      { text: 'Hello ' },
      { href: 'ignored' },
      { text: 'world' },
    ])).toBe('Hello world')
  })

  it('resolves a single selected text block as an inline AI target', () => {
    expect(selectedInlineAiBlockTarget([])).toBeNull()
    expect(selectedInlineAiBlockTarget([selectedBlock(), selectedBlock({ id: 'block-2' })])).toBeNull()
    expect(selectedInlineAiBlockTarget([selectedBlock({ content: [{ text: '   ' }] })])).toBeNull()

    expect(selectedInlineAiBlockTarget([selectedBlock()])).toEqual({
      target: { blockId: 'block-1', kind: 'block' },
      text: 'Selected block',
    })
  })

  it('keeps inline AI draft state transitions deterministic', () => {
    const streaming = startInlineAiSuggestion({ kind: 'selection' })
    const withDraft = appendInlineAiSuggestionDelta(
      appendInlineAiSuggestionDelta(streaming, 'Better '),
      'sentence',
    )
    const ready = completeInlineAiSuggestion(withDraft)

    expect(initialInlineAiSuggestionState()).toEqual({
      draft: '',
      errorMessage: '',
      status: 'idle',
      target: null,
    })
    expect(ready).toEqual({
      draft: 'Better sentence',
      errorMessage: '',
      status: 'ready',
      target: { kind: 'selection' },
    })
    expect(acceptedInlineAiSuggestion(ready)).toEqual({
      suggestion: 'Better sentence',
      target: { kind: 'selection' },
    })
  })

  it('does not accept empty drafts and preserves provider errors', () => {
    const streaming = startInlineAiSuggestion({ blockId: 'block-1', kind: 'block' })
    const failed = failInlineAiSuggestion(streaming, 'provider failed')

    expect(acceptedInlineAiSuggestion(streaming)).toBeNull()
    expect(failed).toEqual({
      draft: '',
      errorMessage: 'provider failed',
      status: 'error',
      target: { blockId: 'block-1', kind: 'block' },
    })
  })
})
