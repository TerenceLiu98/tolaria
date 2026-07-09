import {
  createBlockCommentId,
  type PaperComment,
  type PaperCommentKind,
  type PaperCommentReaction,
  type PaperCommentReply,
} from './comments'

export type PaperCommentThreadFilter = 'all' | 'open' | 'resolved'
export type PaperCommentThreadSort = 'newest' | 'oldest'

export const PAPER_COMMENT_KIND: PaperCommentKind = 'comment'
export const PAPER_COMMENT_REACTION_EMOJI = '👍'

export function cleanOptionalCommentText(value: string | null | undefined): string | undefined {
  const trimmed = value?.trim() ?? ''
  return trimmed.length > 0 ? trimmed : undefined
}

export function activePaperCommentReplies(comment: PaperComment): PaperCommentReply[] {
  return Array.isArray(comment.replies)
    ? comment.replies.filter((reply) => typeof reply.deleted_at !== 'string')
    : []
}

export function activePaperCommentReactions(comment: PaperComment): PaperCommentReaction[] {
  return Array.isArray(comment.reactions)
    ? comment.reactions.filter((reaction) => typeof reaction.deleted_at !== 'string')
    : []
}

export function createPaperCommentReply(
  note: string,
  now = new Date(),
  createId: () => string = createBlockCommentId,
): PaperCommentReply {
  return {
    id: createId().replace(/^ann_/u, 'reply_'),
    note,
    created_at: now.toISOString(),
  }
}

export function createPaperCommentReaction(
  emoji: string,
  now = new Date(),
): PaperCommentReaction {
  return {
    emoji,
    count: 1,
    created_at: now.toISOString(),
  }
}

export function paperCommentIsResolved(comment: PaperComment): boolean {
  return typeof comment.resolved_at === 'string' && comment.resolved_at.trim().length > 0
}

export function paperCommentThreadTimestamp(comment: PaperComment): number {
  const timestamp = Date.parse(comment.updated_at ?? comment.created_at)
  return Number.isFinite(timestamp) ? timestamp : 0
}

export function visiblePaperComments(
  comments: readonly PaperComment[],
  filter: PaperCommentThreadFilter,
  sort: PaperCommentThreadSort,
): PaperComment[] {
  const filteredComments = comments.filter((comment) => {
    if (filter === 'open') return !paperCommentIsResolved(comment)
    if (filter === 'resolved') return paperCommentIsResolved(comment)
    return true
  })
  return [...filteredComments].sort((left, right) => {
    const delta = paperCommentThreadTimestamp(left) - paperCommentThreadTimestamp(right)
    return sort === 'oldest' ? delta : -delta
  })
}

export function paperCommentHasReaction(comment: PaperComment, emoji: string): boolean {
  return activePaperCommentReactions(comment).some((reaction) => reaction.emoji === emoji && reaction.count > 0)
}

export function savePaperCommentNote(
  comment: PaperComment,
  note: string,
  now = new Date(),
): PaperComment {
  return {
    ...comment,
    note: cleanOptionalCommentText(note),
    updated_at: now.toISOString(),
  }
}

export function togglePaperCommentResolved(
  comment: PaperComment,
  now = new Date(),
): PaperComment {
  return {
    ...comment,
    resolved_at: paperCommentIsResolved(comment) ? undefined : now.toISOString(),
    updated_at: now.toISOString(),
  }
}

export function addPaperCommentReply(
  comment: PaperComment,
  replyNote: string,
  now = new Date(),
  createId?: () => string,
): PaperComment | null {
  const cleanedReply = cleanOptionalCommentText(replyNote)
  if (!cleanedReply) return null
  return {
    ...comment,
    replies: [
      ...activePaperCommentReplies(comment),
      createPaperCommentReply(cleanedReply, now, createId),
    ],
    updated_at: now.toISOString(),
  }
}

export function deletePaperCommentReply(
  comment: PaperComment,
  replyId: string,
  now = new Date(),
): PaperComment {
  return {
    ...comment,
    replies: (comment.replies ?? []).map((reply) => reply.id === replyId
      ? {
        ...reply,
        deleted_at: now.toISOString(),
        updated_at: now.toISOString(),
      }
      : reply),
    updated_at: now.toISOString(),
  }
}

export function togglePaperCommentReaction(
  comment: PaperComment,
  emoji: string,
  now = new Date(),
): PaperComment {
  const reactions = activePaperCommentReactions(comment)
  return {
    ...comment,
    reactions: paperCommentHasReaction(comment, emoji)
      ? reactions.filter((reaction) => reaction.emoji !== emoji)
      : [
        ...reactions,
        createPaperCommentReaction(emoji, now),
      ],
    updated_at: now.toISOString(),
  }
}
