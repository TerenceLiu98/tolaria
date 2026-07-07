import { isRecord, type TolariaSelectedBlock } from './toolbarBlocks'

export type InlineAiSuggestionStatus = 'idle' | 'streaming' | 'ready' | 'error'

export type InlineAiSuggestionTarget =
  | { kind: 'selection' }
  | { blockId: string; kind: 'block' }

export interface InlineAiSuggestionState {
  draft: string
  errorMessage: string
  status: InlineAiSuggestionStatus
  target: InlineAiSuggestionTarget | null
}

export function initialInlineAiSuggestionState(): InlineAiSuggestionState {
  return {
    draft: '',
    errorMessage: '',
    status: 'idle',
    target: null,
  }
}

export function inlineTextFromBlockContent(content: unknown): string | null {
  if (!Array.isArray(content)) return null

  const text = content
    .map((item) => (isRecord(item) && typeof item.text === 'string' ? item.text : ''))
    .join('')
    .trim()
  return text.length > 0 ? text : null
}

export function selectedInlineAiBlockTarget(blocks: TolariaSelectedBlock[]): {
  target: InlineAiSuggestionTarget
  text: string
} | null {
  if (blocks.length !== 1) return null

  const block = blocks[0]
  const blockText = inlineTextFromBlockContent(block.content)
  return blockText ? { target: { blockId: block.id, kind: 'block' }, text: blockText } : null
}

export function startInlineAiSuggestion(target: InlineAiSuggestionTarget): InlineAiSuggestionState {
  return {
    draft: '',
    errorMessage: '',
    status: 'streaming',
    target,
  }
}

export function appendInlineAiSuggestionDelta(state: InlineAiSuggestionState, delta: string): InlineAiSuggestionState {
  return {
    ...state,
    draft: `${state.draft}${delta}`,
  }
}

export function completeInlineAiSuggestion(state: InlineAiSuggestionState): InlineAiSuggestionState {
  return {
    ...state,
    status: 'ready',
  }
}

export function failInlineAiSuggestion(state: InlineAiSuggestionState, errorMessage: string): InlineAiSuggestionState {
  return {
    ...state,
    errorMessage,
    status: 'error',
  }
}

export function acceptedInlineAiSuggestion(state: InlineAiSuggestionState): {
  suggestion: string
  target: InlineAiSuggestionTarget
} | null {
  const suggestion = state.draft.trim()
  if (!suggestion || !state.target) return null
  return { suggestion, target: state.target }
}
