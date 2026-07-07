import {
  groupCommentsByAnchor,
  type NoteComment,
  type NoteCommentReaction,
  type NoteCommentReply,
  type NoteCommentAnchor,
} from '../comments/commentProvider'
import type { PaperAnnotation } from './annotations'
import { blockDisplayText } from './paperReaderModel'
import type { SourceBlock } from './sourceBlocks'

function paperAnnotationReplies(annotation: PaperAnnotation): NoteCommentReply[] {
  const replies = Array.isArray(annotation.replies) ? annotation.replies : []
  return replies
    .filter((reply) => typeof reply.deleted_at !== 'string')
    .map((reply) => ({
      body: reply.note,
      createdAt: reply.created_at,
      id: reply.id,
      updatedAt: reply.updated_at ?? null,
    }))
}

function paperAnnotationReactions(annotation: PaperAnnotation): NoteCommentReaction[] {
  const reactions = Array.isArray(annotation.reactions) ? annotation.reactions : []
  return reactions
    .filter((reaction) => typeof reaction.deleted_at !== 'string')
    .map((reaction) => ({
      count: reaction.count,
      createdAt: reaction.created_at ?? null,
      emoji: reaction.emoji,
      updatedAt: reaction.updated_at ?? null,
    }))
}

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
    reactions: paperAnnotationReactions(annotation),
    replies: paperAnnotationReplies(annotation),
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
