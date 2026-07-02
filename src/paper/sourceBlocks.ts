export type PaperBlocksState = 'missing' | 'empty' | 'ready'

export interface SourceBlock {
  id: string
  paper_id: string
  kind: string
  page: number
  hash: string
  text?: string
  caption?: string
  bbox?: number[]
  section?: string
  order?: number
  source_asset?: string
  confidence?: number
  parser?: string
  [key: string]: unknown
}

export interface SourceBlockLineError {
  line: number
  kind: string
  message: string
}

export interface SourceBlockParseResult {
  state: Exclude<PaperBlocksState, 'missing'>
  blocks: SourceBlock[]
  errors: SourceBlockLineError[]
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function nonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0
}

function lineError(line: number, kind: string, message: string): SourceBlockLineError {
  return { line, kind, message }
}

export function validateSourceBlock(value: unknown, line = 1): {
  block: SourceBlock | null
  errors: SourceBlockLineError[]
} {
  if (!isRecord(value)) {
    return {
      block: null,
      errors: [lineError(line, 'invalid_shape', 'Line must be a JSON object')],
    }
  }

  const errors: SourceBlockLineError[] = []
  for (const field of ['id', 'paper_id', 'kind', 'hash']) {
    if (!nonEmptyString(value[field])) {
      errors.push(lineError(line, 'missing_required_field', `Missing required field \`${field}\``))
    }
  }
  if (!Number.isInteger(value.page) || (value.page as number) <= 0) {
    errors.push(lineError(line, 'missing_required_field', 'Required field `page` must be a positive integer'))
  }
  if (errors.length > 0) return { block: null, errors }

  return {
    block: value as SourceBlock,
    errors: [],
  }
}

export function parseSourceBlocksJsonl(content: string): SourceBlockParseResult {
  const blocks: SourceBlock[] = []
  const errors: SourceBlockLineError[] = []

  for (const [index, line] of content.split(/\r?\n/u).entries()) {
    const lineNumber = index + 1
    const trimmed = line.trim()
    if (!trimmed) continue

    let parsed: unknown
    try {
      parsed = JSON.parse(trimmed) as unknown
    } catch (error) {
      errors.push(lineError(lineNumber, 'malformed_json', `Line is not valid JSON: ${String(error)}`))
      continue
    }

    const result = validateSourceBlock(parsed, lineNumber)
    errors.push(...result.errors)
    if (result.block) blocks.push(result.block)
  }

  const validBlocks = errors.length > 0 ? [] : blocks
  return {
    state: validBlocks.length === 0 ? 'empty' : 'ready',
    blocks: validBlocks,
    errors,
  }
}

export function findSourceBlockById(blocks: readonly SourceBlock[], blockId: string): SourceBlock | null {
  return blocks.find((block) => block.id === blockId) ?? null
}

export function sourceBlockSearchText(block: SourceBlock): string {
  return [block.text, block.caption, block.section]
    .filter((value): value is string => typeof value === 'string')
    .join('\n')
    .toLowerCase()
}

export function searchSourceBlocks(blocks: readonly SourceBlock[], query: string): SourceBlock[] {
  const normalizedQuery = query.trim().toLowerCase()
  if (!normalizedQuery) return []
  return blocks.filter((block) => sourceBlockSearchText(block).includes(normalizedQuery))
}

export function sampleSourceBlocksJsonl(paperId: string): string {
  return [
    JSON.stringify({
      id: 'b0001',
      paper_id: paperId,
      kind: 'title',
      page: 1,
      text: 'Attention Is All You Need',
      hash: 'sha256:fixture-title',
    }),
    JSON.stringify({
      id: 'b0002',
      paper_id: paperId,
      kind: 'paragraph',
      page: 2,
      text: 'The Transformer allows for significantly more parallelization.',
      hash: 'sha256:fixture-paragraph',
      section: 'Introduction',
      order: 2,
    }),
  ].join('\n') + '\n'
}
