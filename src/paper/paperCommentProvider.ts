import {
  groupCommentsByAnchor,
  type NoteComment,
  type NoteCommentReaction,
  type NoteCommentReply,
  type NoteCommentAnchor,
} from '../comments/commentProvider'
import type { PaperComment } from './comments'
import { blockDisplayText } from './paperReaderModel'
import type { SourceBlock } from './sourceBlocks'

function paperCommentReplies(comment: PaperComment): NoteCommentReply[] {
  const replies = Array.isArray(comment.replies) ? comment.replies : []
  return replies
    .filter((reply) => typeof reply.deleted_at !== 'string')
    .map((reply) => ({
      body: reply.note,
      createdAt: reply.created_at,
      id: reply.id,
      updatedAt: reply.updated_at ?? null,
    }))
}

function paperCommentReactions(comment: PaperComment): NoteCommentReaction[] {
  const reactions = Array.isArray(comment.reactions) ? comment.reactions : []
  return reactions
    .filter((reaction) => typeof reaction.deleted_at !== 'string')
    .map((reaction) => ({
      count: reaction.count,
      createdAt: reaction.created_at ?? null,
      emoji: reaction.emoji,
      updatedAt: reaction.updated_at ?? null,
    }))
}

export function paperCommentToComment(comment: PaperComment): NoteComment | null {
  if (!comment.block_id) return null
  return {
    anchorId: comment.block_id,
    body: comment.note ?? comment.text ?? '',
    createdAt: comment.created_at,
    id: comment.id,
    kind: comment.kind,
    quote: comment.text ?? null,
    reactions: paperCommentReactions(comment),
    replies: paperCommentReplies(comment),
    updatedAt: comment.updated_at ?? null,
  }
}

export function paperCommentsByBlockId(comments: readonly PaperComment[]): Record<string, NoteComment[]> {
  return groupCommentsByAnchor(comments
    .map(paperCommentToComment)
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
