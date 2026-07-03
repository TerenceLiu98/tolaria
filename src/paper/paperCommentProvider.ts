import {
  groupCommentsByAnchor,
  type NoteComment,
  type NoteCommentAnchor,
} from '../comments/commentProvider'
import type { PaperAnnotation } from './annotations'
import { blockDisplayText } from './paperReaderModel'
import type { SourceBlock } from './sourceBlocks'

export function paperAnnotationToComment(annotation: PaperAnnotation): NoteComment | null {
  if (!annotation.block_id) return null
  return {
    anchorId: annotation.block_id,
    body: annotation.note ?? annotation.text ?? '',
    color: annotation.color ?? null,
    createdAt: annotation.created_at,
    id: annotation.id,
    kind: annotation.kind,
    quote: annotation.text ?? null,
    updatedAt: annotation.updated_at ?? null,
  }
}

export function paperCommentsByBlockId(annotations: readonly PaperAnnotation[]): Record<string, NoteComment[]> {
  return groupCommentsByAnchor(annotations
    .map(paperAnnotationToComment)
    .filter((comment): comment is NoteComment => comment !== null))
}

export function paperCommentAnchorForBlock(block: SourceBlock): NoteCommentAnchor {
  return {
    id: block.id,
    label: blockDisplayText(block),
    metadata: {
      kind: block.kind,
      page: block.page,
      section: block.section ?? null,
    },
  }
}
