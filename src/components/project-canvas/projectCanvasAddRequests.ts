import { formatBlockCitation, parseBlockCitations, type FormatBlockCitationInput } from '../../paper/blockCitations'
import type { VaultEntry } from '../../types'
import type { ProjectCanvasNodeRequest } from '../../projectCanvasActions'

const MAX_AI_ANSWER_CHARS = 1400
const MAX_AI_ANSWER_BODY_CHARS = 1200

export type ProjectCanvasAddSource = 'ai_answer' | 'block_citation' | 'note_list' | 'paper_catalog'

export interface ProjectCanvasAddRequest {
  source: ProjectCanvasAddSource
  label: string
  node: ProjectCanvasNodeRequest
}

export function projectCanvasRequestForEntry(entry: VaultEntry): ProjectCanvasAddRequest | null {
  if (entry.isA !== 'Note' && entry.isA !== 'Paper') return null
  return {
    source: entry.isA === 'Paper' ? 'paper_catalog' : 'note_list',
    label: entry.title,
    node: {
      type: entry.isA === 'Paper' ? 'paper' : 'note',
      ref: entry.path,
      title: entry.title,
      text: entry.snippet || undefined,
    },
  }
}

export function projectCanvasRequestForBlockCitation(
  citation: FormatBlockCitationInput,
): ProjectCanvasAddRequest {
  const ref = formatBlockCitation(citation)
  const label = citation.label?.trim() || `${citation.paperId}#${citation.blockId}`
  return {
    source: 'block_citation',
    label,
    node: {
      type: 'paper_block',
      ref,
      title: label,
    },
  }
}

function compactAiAnswer(response: string): string {
  const trimmed = response.trim()
  if (trimmed.length <= MAX_AI_ANSWER_CHARS) return trimmed
  const citations = parseBlockCitations(trimmed)
    .filter(citation => !citation.malformed)
    .map(citation => citation.raw)
  const citationSuffix = [...new Set(citations)].join(' ')
  const bodyLimit = citationSuffix
    ? Math.min(MAX_AI_ANSWER_BODY_CHARS, MAX_AI_ANSWER_CHARS - citationSuffix.length - 2)
    : MAX_AI_ANSWER_CHARS
  const body = trimmed.slice(0, bodyLimit).trimEnd()
  return citationSuffix ? `${body}\n\n${citationSuffix}` : body
}

export function projectCanvasRequestForAiResponse(
  response: string,
  title: string,
): ProjectCanvasAddRequest {
  return {
    source: 'ai_answer',
    label: title,
    node: {
      type: 'text',
      title,
      text: compactAiAnswer(response),
    },
  }
}
