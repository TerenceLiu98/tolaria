export type PaperCommentsState = 'missing' | 'empty' | 'ready'

export const PAPER_COMMENT_KINDS = [
  'comment',
] as const

export type PaperCommentKind = typeof PAPER_COMMENT_KINDS[number]

export interface PaperCommentReply {
  id: string
  note: string
  created_at: string
  updated_at?: string
  deleted_at?: string
}

export interface PaperCommentReaction {
  emoji: string
  count: number
  created_at?: string
  updated_at?: string
  deleted_at?: string
}

export interface PaperComment {
  id: string
  paper_id: string
  kind: PaperCommentKind
  created_at: string
  block_id?: string
  text?: string
  note?: string
  page?: number
  bbox?: number[]
  reactions?: PaperCommentReaction[]
  replies?: PaperCommentReply[]
  resolved_at?: string
  updated_at?: string
  deleted_at?: string
  [key: string]: unknown
}

export interface PaperCommentLineError {
  line: number
  kind: string
  message: string
}

export interface PaperCommentParseResult {
  state: Exclude<PaperCommentsState, 'missing'>
  comments: PaperComment[]
  errors: PaperCommentLineError[]
}

export type CommentsByBlockId = Record<string, PaperComment[]>

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function nonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0
}

function lineError(line: number, kind: string, message: string): PaperCommentLineError {
  return { line, kind, message }
}

export function isPaperCommentKind(value: unknown): value is PaperCommentKind {
  return typeof value === 'string'
    && PAPER_COMMENT_KINDS.includes(value as PaperCommentKind)
}

function hasCoordinateTarget(value: Record<string, unknown>): boolean {
  return Number.isInteger(value.page)
    && (value.page as number) > 0
    && Array.isArray(value.bbox)
    && value.bbox.length === 4
    && value.bbox.every((coordinate) => typeof coordinate === 'number' && Number.isFinite(coordinate))
}

export function validatePaperComment(
  value: unknown,
  line = 1,
  expectedPaperId?: string,
): {
  comment: PaperComment | null
  errors: PaperCommentLineError[]
} {
  if (!isRecord(value)) {
    return {
      comment: null,
      errors: [lineError(line, 'invalid_shape', 'Line must be a JSON object')],
    }
  }

  const errors: PaperCommentLineError[] = []
  for (const field of ['id', 'paper_id', 'kind', 'created_at']) {
    if (!nonEmptyString(value[field])) {
      errors.push(lineError(line, 'missing_required_field', `Missing required field \`${field}\``))
    }
  }

  if (expectedPaperId && value.paper_id !== expectedPaperId) {
    errors.push(lineError(line, 'paper_id_mismatch', `Comment paper_id must match \`${expectedPaperId}\``))
  }
  if (nonEmptyString(value.kind) && !isPaperCommentKind(value.kind)) {
    errors.push(lineError(line, 'invalid_kind', 'Paper comment kind must be comment'))
  }
  if ('color' in value) {
    errors.push(lineError(line, 'deprecated_field', 'Paper comments must not include comment color'))
  }
  if (!nonEmptyString(value.block_id) && !hasCoordinateTarget(value)) {
    errors.push(lineError(line, 'missing_comment_target', 'Comment must include block_id or page plus bbox'))
  }
  if (errors.length > 0) return { comment: null, errors }

  return {
    comment: value as PaperComment,
    errors: [],
  }
}

export function parsePaperCommentsJsonl(
  content: string,
  expectedPaperId?: string,
): PaperCommentParseResult {
  const comments: PaperComment[] = []
  const errors: PaperCommentLineError[] = []

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

    const result = validatePaperComment(parsed, lineNumber, expectedPaperId)
    errors.push(...result.errors)
    if (result.comment) comments.push(result.comment)
  }

  const validComments = errors.length > 0 ? [] : comments
  return {
    state: validComments.length === 0 ? 'empty' : 'ready',
    comments: validComments,
    errors,
  }
}

export function commentsForBlock(
  comments: readonly PaperComment[],
  blockId: string,
): PaperComment[] {
  return comments.filter((comment) => comment.block_id === blockId)
}

export function groupCommentsByBlockId(comments: readonly PaperComment[]): CommentsByBlockId {
  const grouped: CommentsByBlockId = {}
  for (const comment of comments) {
    if (!comment.block_id) continue
    grouped[comment.block_id] = [...(grouped[comment.block_id] ?? []), comment]
  }
  return grouped
}

export function createBlockCommentId(): string {
  const random = Math.random().toString(36).slice(2, 8)
  return `ann_${Date.now().toString(36)}_${random}`
}

export function createBlockComment(input: {
  paperId: string
  blockId: string
  kind: PaperCommentKind
  text?: string
  note?: string
  now?: Date
  id?: string
}): PaperComment {
  const now = input.now ?? new Date()
  return {
    id: input.id ?? createBlockCommentId(),
    paper_id: input.paperId,
    block_id: input.blockId,
    kind: input.kind,
    created_at: now.toISOString(),
    text: input.text,
    note: input.note,
  }
}
