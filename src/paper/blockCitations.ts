import type { SourceBlock } from './sourceBlocks'

export const BLOCK_CITATION_PREFIX = '@block['
export const BLOCK_CITATION_SCHEME = 'block-citation://'
export const MALFORMED_BLOCK_CITATION_SCHEME = 'block-citation-malformed://'

const BLOCK_CITATION_END = ']'
const LABEL_SEPARATOR_RE = /\s/u
const CODE_SPAN_OR_FENCE_RE = /(```[\s\S]*?```|`[^`\n]+`)/g

export interface BlockCitationRange {
  start: number
  end: number
}

export interface BlockCitationTarget {
  paper_id: string
  block_id: string
}

export interface BlockCitation {
  kind: 'block_citation'
  malformed: false
  paperId: string
  blockId: string
  target: BlockCitationTarget
  label: string | null
  raw: string
  range: BlockCitationRange
}

export interface MalformedBlockCitation {
  kind: 'block_citation'
  malformed: true
  reason: BlockCitationMalformedReason
  raw: string
  range: BlockCitationRange
}

export type ParsedBlockCitation = BlockCitation | MalformedBlockCitation

export type BlockCitationMalformedReason =
  | 'missing_closing_bracket'
  | 'empty_target'
  | 'missing_separator'
  | 'empty_paper_id'
  | 'empty_block_id'
  | 'invalid_target'
  | 'invalid_label'
  | 'unexpected_trailing_content'

export interface FormatBlockCitationInput {
  paperId: string
  blockId: string
  label?: string | null
}

export type BlockCitationValidationIssueKind =
  | 'malformed'
  | 'missing_paper'
  | 'missing_block'

export type MaybePromise<T> = T | Promise<T>

export interface BlockCitationValidationResolver {
  hasPaper?: (paperId: string) => MaybePromise<boolean>
  hasBlock: (paperId: string, blockId: string) => MaybePromise<boolean>
}

export type BlockCitationValidationIssue =
  | {
    kind: 'malformed'
    citation: MalformedBlockCitation
    message: string
  }
  | {
    kind: 'missing_paper' | 'missing_block'
    citation: BlockCitation
    message: string
  }

export interface BlockCitationValidationResult {
  citations: BlockCitation[]
  malformed: MalformedBlockCitation[]
  issues: BlockCitationValidationIssue[]
}

interface MarkdownTextSegment {
  start: number
  text: string
}

interface ParseInnerResult {
  blockCitation: Omit<BlockCitation, 'raw' | 'range'>
  reason: null
}

interface ParseInnerFailure {
  blockCitation: null
  reason: BlockCitationMalformedReason
}

type ParseInnerOutcome = ParseInnerResult | ParseInnerFailure

function textSegmentsOutsideCode(markdown: string): MarkdownTextSegment[] {
  const segments: MarkdownTextSegment[] = []
  let lastIndex = 0
  let match = CODE_SPAN_OR_FENCE_RE.exec(markdown)

  while (match !== null) {
    if (match.index > lastIndex) {
      segments.push({ start: lastIndex, text: markdown.slice(lastIndex, match.index) })
    }
    lastIndex = match.index + match[0].length
    match = CODE_SPAN_OR_FENCE_RE.exec(markdown)
  }

  if (lastIndex < markdown.length) {
    segments.push({ start: lastIndex, text: markdown.slice(lastIndex) })
  }

  CODE_SPAN_OR_FENCE_RE.lastIndex = 0
  return segments
}

function malformedCitation(
  raw: string,
  start: number,
  end: number,
  reason: BlockCitationMalformedReason,
): MalformedBlockCitation {
  return {
    kind: 'block_citation',
    malformed: true,
    raw,
    range: { start, end },
    reason,
  }
}

function firstWhitespaceIndex(value: string): number {
  for (let index = 0; index < value.length; index++) {
    if (LABEL_SEPARATOR_RE.test(value.charAt(index))) return index
  }
  return -1
}

function invalidTargetReason(target: string): BlockCitationMalformedReason | null {
  if (!target) return 'empty_target'
  const separator = target.indexOf('#')
  if (separator === -1) return 'missing_separator'
  if (separator === 0) return 'empty_paper_id'
  if (separator === target.length - 1) return 'empty_block_id'
  if (separator !== target.lastIndexOf('#')) return 'invalid_target'
  if (target.includes('"') || target.includes('[') || target.includes(']') || /\s/u.test(target)) {
    return 'invalid_target'
  }
  return null
}

function parseQuotedLabel(rest: string): { label: string | null; reason: BlockCitationMalformedReason | null } {
  if (!rest.startsWith('"')) return { label: null, reason: 'invalid_label' }

  let label = ''
  let escaped = false
  for (let index = 1; index < rest.length; index++) {
    const char = rest.charAt(index)
    if (escaped) {
      label += char
      escaped = false
      continue
    }
    if (char === '\\') {
      escaped = true
      continue
    }
    if (char === '"') {
      return rest.slice(index + 1).trim().length === 0
        ? { label, reason: null }
        : { label: null, reason: 'unexpected_trailing_content' }
    }
    label += char
  }

  return { label: null, reason: 'invalid_label' }
}

function parseCitationInner(inner: string): ParseInnerOutcome {
  const trimmed = inner.trim()
  const targetEnd = firstWhitespaceIndex(trimmed)
  const target = targetEnd === -1 ? trimmed : trimmed.slice(0, targetEnd)
  const reason = invalidTargetReason(target)
  if (reason) return { blockCitation: null, reason }

  const rest = targetEnd === -1 ? '' : trimmed.slice(targetEnd).trim()
  const parsedLabel = rest ? parseQuotedLabel(rest) : { label: null, reason: null }
  if (parsedLabel.reason) return { blockCitation: null, reason: parsedLabel.reason }

  const separator = target.indexOf('#')
  const paperId = target.slice(0, separator)
  const blockId = target.slice(separator + 1)

  return {
    blockCitation: {
      kind: 'block_citation',
      malformed: false,
      paperId,
      blockId,
      target: {
        paper_id: paperId,
        block_id: blockId,
      },
      label: parsedLabel.label,
    },
    reason: null,
  }
}

function parseCitationAt(text: string, localStart: number, segmentStart: number): ParsedBlockCitation {
  const contentStart = localStart + BLOCK_CITATION_PREFIX.length
  const localEnd = text.indexOf(BLOCK_CITATION_END, contentStart)
  const absoluteStart = segmentStart + localStart

  if (localEnd === -1) {
    const raw = text.slice(localStart)
    return malformedCitation(
      raw,
      absoluteStart,
      segmentStart + text.length,
      'missing_closing_bracket',
    )
  }

  const raw = text.slice(localStart, localEnd + 1)
  const absoluteEnd = segmentStart + localEnd + 1
  const parsed = parseCitationInner(text.slice(contentStart, localEnd))

  if (!parsed.blockCitation) {
    return malformedCitation(raw, absoluteStart, absoluteEnd, parsed.reason)
  }

  return {
    ...parsed.blockCitation,
    raw,
    range: { start: absoluteStart, end: absoluteEnd },
  }
}

export function parseBlockCitations(markdown: string): ParsedBlockCitation[] {
  const citations: ParsedBlockCitation[] = []

  for (const segment of textSegmentsOutsideCode(markdown)) {
    let index = 0
    while (index < segment.text.length) {
      const next = segment.text.indexOf(BLOCK_CITATION_PREFIX, index)
      if (next === -1) break

      const citation = parseCitationAt(segment.text, next, segment.start)
      citations.push(citation)
      if (citation.malformed && citation.reason === 'missing_closing_bracket') break
      index = citation.range.end - segment.start
    }
  }

  return citations
}

function nonEmptyCitationPart(value: string, field: string): string {
  const trimmed = value.trim()
  if (trimmed.length > 0) return trimmed
  throw new Error(`${field} must not be empty`)
}

function escapeLabel(label: string): string {
  return label.replace(/\\/g, '\\\\').replace(/"/g, '\\"')
}

export function formatBlockCitation({ paperId, blockId, label }: FormatBlockCitationInput): string {
  const target = `${nonEmptyCitationPart(paperId, 'paperId')}#${nonEmptyCitationPart(blockId, 'blockId')}`
  return label && label.length > 0
    ? `${BLOCK_CITATION_PREFIX}${target} "${escapeLabel(label)}"]`
    : `${BLOCK_CITATION_PREFIX}${target}]`
}

function validationMessage(kind: BlockCitationValidationIssueKind, citation: ParsedBlockCitation): string {
  if (kind === 'malformed') return `Malformed block citation: ${citation.raw}`
  if (citation.malformed) return `Malformed block citation: ${citation.raw}`
  if (kind === 'missing_paper') return `Paper not found for block citation: ${citation.paperId}`
  return `Block not found for block citation: ${citation.paperId}#${citation.blockId}`
}

export async function validateBlockCitations(
  markdown: string,
  resolver: BlockCitationValidationResolver,
): Promise<BlockCitationValidationResult> {
  const parsed = parseBlockCitations(markdown)
  const citations: BlockCitation[] = []
  const malformed: MalformedBlockCitation[] = []
  const issues: BlockCitationValidationIssue[] = []

  for (const citation of parsed) {
    if (citation.malformed) {
      malformed.push(citation)
      issues.push({
        kind: 'malformed',
        citation,
        message: validationMessage('malformed', citation),
      })
      continue
    }

    citations.push(citation)
    const paperExists = resolver.hasPaper ? await resolver.hasPaper(citation.paperId) : true
    if (!paperExists) {
      issues.push({
        kind: 'missing_paper',
        citation,
        message: validationMessage('missing_paper', citation),
      })
      continue
    }

    if (!await resolver.hasBlock(citation.paperId, citation.blockId)) {
      issues.push({
        kind: 'missing_block',
        citation,
        message: validationMessage('missing_block', citation),
      })
    }
  }

  return { citations, malformed, issues }
}

export function createBlockCitationResolverFromBlocks(
  blocksByPaper: ReadonlyMap<string, readonly SourceBlock[]>,
): BlockCitationValidationResolver {
  return {
    hasPaper: (paperId) => blocksByPaper.has(paperId),
    hasBlock: (paperId, blockId) => blocksByPaper.get(paperId)?.some((block) => block.id === blockId) ?? false,
  }
}

function escapeMarkdownLinkText(text: string): string {
  return text.replace(/[\\[\]]/g, '\\$&')
}

function blockCitationDisplayText(citation: BlockCitation): string {
  return citation.label ?? `${citation.paperId}#${citation.blockId}`
}

function queryParams(params: Record<string, string | null>): string {
  const search = new URLSearchParams()
  for (const [key, value] of Object.entries(params)) {
    if (value !== null) search.set(key, value)
  }
  const encoded = search.toString()
  return encoded ? `?${encoded}` : ''
}

export function blockCitationHref(citation: BlockCitation): string {
  const target = encodeURIComponent(`${citation.paperId}#${citation.blockId}`)
  return `${BLOCK_CITATION_SCHEME}${target}${queryParams({
    label: citation.label,
    raw: citation.raw,
  })}`
}

export function malformedBlockCitationHref(citation: MalformedBlockCitation): string {
  return `${MALFORMED_BLOCK_CITATION_SCHEME}${encodeURIComponent(citation.raw)}${queryParams({
    reason: citation.reason,
  })}`
}

function replaceBlockCitationsInText(text: string): string {
  const parsed = parseBlockCitations(text)
  if (parsed.length === 0) return text

  let result = ''
  let index = 0
  for (const citation of parsed) {
    const localStart = citation.range.start
    const localEnd = citation.range.end
    result += text.slice(index, localStart)
    const label = citation.malformed ? citation.raw : blockCitationDisplayText(citation)
    const href = citation.malformed
      ? malformedBlockCitationHref(citation)
      : blockCitationHref(citation)
    result += `[${escapeMarkdownLinkText(label)}](${href})`
    index = localEnd
  }
  return result + text.slice(index)
}

export function preprocessBlockCitations(markdown: string): string {
  let result = ''
  let lastIndex = 0

  for (const segment of textSegmentsOutsideCode(markdown)) {
    result += markdown.slice(lastIndex, segment.start)
    result += replaceBlockCitationsInText(segment.text)
    lastIndex = segment.start + segment.text.length
  }

  return result + markdown.slice(lastIndex)
}

function parseCitationHrefPayload(href: string): { target: string; params: URLSearchParams } {
  const payload = href.slice(BLOCK_CITATION_SCHEME.length)
  const queryStart = payload.indexOf('?')
  const encodedTarget = queryStart === -1 ? payload : payload.slice(0, queryStart)
  const query = queryStart === -1 ? '' : payload.slice(queryStart + 1)
  return {
    target: decodeURIComponent(encodedTarget),
    params: new URLSearchParams(query),
  }
}

export function blockCitationFromHref(href: string): FormatBlockCitationInput | null {
  if (!href.startsWith(BLOCK_CITATION_SCHEME)) return null
  const { target, params } = parseCitationHrefPayload(href)
  const separator = target.indexOf('#')
  if (separator <= 0 || separator === target.length - 1 || separator !== target.lastIndexOf('#')) return null

  return {
    paperId: target.slice(0, separator),
    blockId: target.slice(separator + 1),
    label: params.get('label'),
  }
}

export function malformedBlockCitationFromHref(href: string): { raw: string; reason: string | null } | null {
  if (!href.startsWith(MALFORMED_BLOCK_CITATION_SCHEME)) return null
  const payload = href.slice(MALFORMED_BLOCK_CITATION_SCHEME.length)
  const queryStart = payload.indexOf('?')
  const encodedRaw = queryStart === -1 ? payload : payload.slice(0, queryStart)
  const query = queryStart === -1 ? '' : payload.slice(queryStart + 1)
  return {
    raw: decodeURIComponent(encodedRaw),
    reason: new URLSearchParams(query).get('reason'),
  }
}
