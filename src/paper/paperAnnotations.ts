export type PaperAnnotationsState = 'missing' | 'empty' | 'ready'

export const PAPER_ANNOTATION_KINDS = [
  'highlight',
  'underline',
  'question',
  'comment',
  'bookmark',
] as const

export const PAPER_ANNOTATION_COLORS = [
  'questioning',
  'important',
  'original',
  'pending',
  'conclusion',
] as const

export type PaperAnnotationKind = typeof PAPER_ANNOTATION_KINDS[number]
export type PaperAnnotationColor = typeof PAPER_ANNOTATION_COLORS[number]

export interface PaperAnnotation {
  id: string
  paper_id: string
  kind: PaperAnnotationKind
  created_at: string
  block_id?: string
  color?: PaperAnnotationColor
  text?: string
  note?: string
  page?: number
  bbox?: number[]
  updated_at?: string
  deleted_at?: string
  [key: string]: unknown
}

export interface PaperAnnotationLineError {
  line: number
  kind: string
  message: string
}

export interface PaperAnnotationParseResult {
  state: Exclude<PaperAnnotationsState, 'missing'>
  annotations: PaperAnnotation[]
  errors: PaperAnnotationLineError[]
}

export type AnnotationsByBlockId = Record<string, PaperAnnotation[]>

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function nonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0
}

function lineError(line: number, kind: string, message: string): PaperAnnotationLineError {
  return { line, kind, message }
}

export function isPaperAnnotationKind(value: unknown): value is PaperAnnotationKind {
  return typeof value === 'string'
    && PAPER_ANNOTATION_KINDS.includes(value as PaperAnnotationKind)
}

export function isPaperAnnotationColor(value: unknown): value is PaperAnnotationColor {
  return typeof value === 'string'
    && PAPER_ANNOTATION_COLORS.includes(value as PaperAnnotationColor)
}

function hasCoordinateTarget(value: Record<string, unknown>): boolean {
  return Number.isInteger(value.page)
    && (value.page as number) > 0
    && Array.isArray(value.bbox)
    && value.bbox.length === 4
    && value.bbox.every((coordinate) => typeof coordinate === 'number' && Number.isFinite(coordinate))
}

export function validatePaperAnnotation(
  value: unknown,
  line = 1,
  expectedPaperId?: string,
): {
  annotation: PaperAnnotation | null
  errors: PaperAnnotationLineError[]
} {
  if (!isRecord(value)) {
    return {
      annotation: null,
      errors: [lineError(line, 'invalid_shape', 'Line must be a JSON object')],
    }
  }

  const errors: PaperAnnotationLineError[] = []
  for (const field of ['id', 'paper_id', 'kind', 'created_at']) {
    if (!nonEmptyString(value[field])) {
      errors.push(lineError(line, 'missing_required_field', `Missing required field \`${field}\``))
    }
  }

  if (expectedPaperId && value.paper_id !== expectedPaperId) {
    errors.push(lineError(line, 'paper_id_mismatch', `Annotation paper_id must match \`${expectedPaperId}\``))
  }
  if (nonEmptyString(value.kind) && !isPaperAnnotationKind(value.kind)) {
    errors.push(lineError(line, 'invalid_kind', 'Annotation kind must be highlight, underline, question, comment, or bookmark'))
  }
  if (value.color !== undefined && !isPaperAnnotationColor(value.color)) {
    errors.push(lineError(line, 'invalid_color', 'Annotation color must be questioning, important, original, pending, or conclusion'))
  }
  if (!nonEmptyString(value.block_id) && !hasCoordinateTarget(value)) {
    errors.push(lineError(line, 'missing_annotation_target', 'Annotation must include block_id or page plus bbox'))
  }
  if (errors.length > 0) return { annotation: null, errors }

  return {
    annotation: value as PaperAnnotation,
    errors: [],
  }
}

export function parsePaperAnnotationsJsonl(
  content: string,
  expectedPaperId?: string,
): PaperAnnotationParseResult {
  const annotations: PaperAnnotation[] = []
  const errors: PaperAnnotationLineError[] = []

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

    const result = validatePaperAnnotation(parsed, lineNumber, expectedPaperId)
    errors.push(...result.errors)
    if (result.annotation) annotations.push(result.annotation)
  }

  const validAnnotations = errors.length > 0 ? [] : annotations
  return {
    state: validAnnotations.length === 0 ? 'empty' : 'ready',
    annotations: validAnnotations,
    errors,
  }
}

export function annotationsForBlock(
  annotations: readonly PaperAnnotation[],
  blockId: string,
): PaperAnnotation[] {
  return annotations.filter((annotation) => annotation.block_id === blockId)
}

export function groupAnnotationsByBlockId(annotations: readonly PaperAnnotation[]): AnnotationsByBlockId {
  const grouped: AnnotationsByBlockId = {}
  for (const annotation of annotations) {
    if (!annotation.block_id) continue
    grouped[annotation.block_id] = [...(grouped[annotation.block_id] ?? []), annotation]
  }
  return grouped
}

export function createBlockAnnotationId(): string {
  const random = Math.random().toString(36).slice(2, 8)
  return `ann_${Date.now().toString(36)}_${random}`
}

export function createBlockAnnotation(input: {
  paperId: string
  blockId: string
  kind: PaperAnnotationKind
  color?: PaperAnnotationColor
  text?: string
  note?: string
  now?: Date
  id?: string
}): PaperAnnotation {
  const now = input.now ?? new Date()
  return {
    id: input.id ?? createBlockAnnotationId(),
    paper_id: input.paperId,
    block_id: input.blockId,
    kind: input.kind,
    color: input.color,
    created_at: now.toISOString(),
    text: input.text,
    note: input.note,
  }
}
