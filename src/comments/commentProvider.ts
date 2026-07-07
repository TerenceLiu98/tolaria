export interface NoteCommentAnchor {
  id: string
  label?: string
  metadata?: Record<string, string | number | null>
}

export interface NoteCommentReply {
  body: string
  createdAt?: string | null
  id: string
  updatedAt?: string | null
}

export interface NoteComment {
  anchorId: string
  body: string
  color?: string | null
  createdAt?: string | null
  id: string
  kind: string
  quote?: string | null
  replies?: NoteCommentReply[]
  updatedAt?: string | null
}

export interface NoteCommentDraft {
  anchorId: string
  body: string
  color?: string | null
  kind: string
  quote?: string | null
}

export interface CommentProvider {
  createComment: (draft: NoteCommentDraft) => Promise<NoteComment>
  deleteComment: (commentId: string) => Promise<void>
  listComments: (anchorIds: readonly string[]) => Promise<Record<string, NoteComment[]>>
  resolveAnchor: (anchorId: string) => NoteCommentAnchor | null
  updateComment: (comment: NoteComment) => Promise<NoteComment>
}

export function groupCommentsByAnchor(comments: readonly NoteComment[]): Record<string, NoteComment[]> {
  const grouped: Record<string, NoteComment[]> = {}
  for (const comment of comments) {
    grouped[comment.anchorId] = [...(grouped[comment.anchorId] ?? []), comment]
  }
  return grouped
}
