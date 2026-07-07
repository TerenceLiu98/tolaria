import {
  createBlockAnnotationId,
  type PaperAnnotation,
  type PaperAnnotationKind,
  type PaperAnnotationReaction,
  type PaperAnnotationReply,
} from './annotations'

export type PaperCommentThreadFilter = 'all' | 'open' | 'resolved'
export type PaperCommentThreadSort = 'newest' | 'oldest'

export const PAPER_COMMENT_KIND: PaperAnnotationKind = 'comment'
export const PAPER_COMMENT_REACTION_EMOJI = '👍'

export function cleanOptionalCommentText(value: string | null | undefined): string | undefined {
  const trimmed = value?.trim() ?? ''
  return trimmed.length > 0 ? trimmed : undefined
}

export function activePaperAnnotationReplies(annotation: PaperAnnotation): PaperAnnotationReply[] {
  return Array.isArray(annotation.replies)
    ? annotation.replies.filter((reply) => typeof reply.deleted_at !== 'string')
    : []
}

export function activePaperAnnotationReactions(annotation: PaperAnnotation): PaperAnnotationReaction[] {
  return Array.isArray(annotation.reactions)
    ? annotation.reactions.filter((reaction) => typeof reaction.deleted_at !== 'string')
    : []
}

export function createPaperAnnotationReply(
  note: string,
  now = new Date(),
  createId: () => string = createBlockAnnotationId,
): PaperAnnotationReply {
  return {
    id: createId().replace(/^ann_/u, 'reply_'),
    note,
    created_at: now.toISOString(),
  }
}

export function createPaperAnnotationReaction(
  emoji: string,
  now = new Date(),
): PaperAnnotationReaction {
  return {
    emoji,
    count: 1,
    created_at: now.toISOString(),
  }
}

export function paperAnnotationIsResolved(annotation: PaperAnnotation): boolean {
  return typeof annotation.resolved_at === 'string' && annotation.resolved_at.trim().length > 0
}

export function paperAnnotationThreadTimestamp(annotation: PaperAnnotation): number {
  const timestamp = Date.parse(annotation.updated_at ?? annotation.created_at)
  return Number.isFinite(timestamp) ? timestamp : 0
}

export function visiblePaperCommentAnnotations(
  annotations: readonly PaperAnnotation[],
  filter: PaperCommentThreadFilter,
  sort: PaperCommentThreadSort,
): PaperAnnotation[] {
  const filteredAnnotations = annotations.filter((annotation) => {
    if (filter === 'open') return !paperAnnotationIsResolved(annotation)
    if (filter === 'resolved') return paperAnnotationIsResolved(annotation)
    return true
  })
  return [...filteredAnnotations].sort((left, right) => {
    const delta = paperAnnotationThreadTimestamp(left) - paperAnnotationThreadTimestamp(right)
    return sort === 'oldest' ? delta : -delta
  })
}

export function paperAnnotationHasReaction(annotation: PaperAnnotation, emoji: string): boolean {
  return activePaperAnnotationReactions(annotation).some((reaction) => reaction.emoji === emoji && reaction.count > 0)
}

export function savePaperAnnotationNote(
  annotation: PaperAnnotation,
  note: string,
  now = new Date(),
): PaperAnnotation {
  return {
    ...annotation,
    note: cleanOptionalCommentText(note),
    updated_at: now.toISOString(),
  }
}

export function togglePaperAnnotationResolved(
  annotation: PaperAnnotation,
  now = new Date(),
): PaperAnnotation {
  return {
    ...annotation,
    resolved_at: paperAnnotationIsResolved(annotation) ? undefined : now.toISOString(),
    updated_at: now.toISOString(),
  }
}

export function addPaperAnnotationReply(
  annotation: PaperAnnotation,
  replyNote: string,
  now = new Date(),
  createId?: () => string,
): PaperAnnotation | null {
  const cleanedReply = cleanOptionalCommentText(replyNote)
  if (!cleanedReply) return null
  return {
    ...annotation,
    replies: [
      ...activePaperAnnotationReplies(annotation),
      createPaperAnnotationReply(cleanedReply, now, createId),
    ],
    updated_at: now.toISOString(),
  }
}

export function deletePaperAnnotationReply(
  annotation: PaperAnnotation,
  replyId: string,
  now = new Date(),
): PaperAnnotation {
  return {
    ...annotation,
    replies: (annotation.replies ?? []).map((reply) => reply.id === replyId
      ? {
        ...reply,
        deleted_at: now.toISOString(),
        updated_at: now.toISOString(),
      }
      : reply),
    updated_at: now.toISOString(),
  }
}

export function togglePaperAnnotationReaction(
  annotation: PaperAnnotation,
  emoji: string,
  now = new Date(),
): PaperAnnotation {
  const reactions = activePaperAnnotationReactions(annotation)
  return {
    ...annotation,
    reactions: paperAnnotationHasReaction(annotation, emoji)
      ? reactions.filter((reaction) => reaction.emoji !== emoji)
      : [
        ...reactions,
        createPaperAnnotationReaction(emoji, now),
      ],
    updated_at: now.toISOString(),
  }
}
