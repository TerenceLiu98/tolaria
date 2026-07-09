import { invoke } from '@tauri-apps/api/core'
import { isTauri, mockInvoke } from '../mock-tauri'
import type { PaperComment, PaperCommentLineError, PaperCommentsState } from './paperComments'

export type {
  CommentsByBlockId,
  PaperComment,
  PaperCommentKind,
  PaperCommentLineError,
  PaperCommentParseResult,
  PaperCommentReaction,
  PaperCommentReply,
  PaperCommentsState,
} from './paperComments'
export {
  commentsForBlock,
  createBlockComment,
  createBlockCommentId,
  groupCommentsByBlockId,
  isPaperCommentKind,
  PAPER_COMMENT_KINDS,
  parsePaperCommentsJsonl,
  validatePaperComment,
} from './paperComments'

export interface PaperCommentsReadResult {
  paperId: string
  path: string
  state: PaperCommentsState
  comments: PaperComment[]
}

export interface PaperCommentsError {
  kind: string
  message: string
  paperId: string
  path: string
  lineErrors: PaperCommentLineError[]
}

function invokePaperCommentCommand<T>(command: string, args: Record<string, unknown>): Promise<T> {
  return isTauri()
    ? invoke<T>(command, args)
    : mockInvoke<T>(command, args)
}

export function loadPaperComments(
  vaultPath: string,
  paperId: string,
): Promise<PaperCommentsReadResult> {
  return invokePaperCommentCommand<PaperCommentsReadResult>('read_paper_comments', {
    vaultPath,
    paperId,
  })
}

export function savePaperComment(
  vaultPath: string,
  paperId: string,
  comment: PaperComment,
): Promise<PaperCommentsReadResult> {
  return invokePaperCommentCommand<PaperCommentsReadResult>('save_paper_comment', {
    vaultPath,
    paperId,
    comment,
  })
}

export function deletePaperComment(
  vaultPath: string,
  paperId: string,
  commentId: string,
): Promise<PaperCommentsReadResult> {
  return invokePaperCommentCommand<PaperCommentsReadResult>('delete_paper_comment', {
    vaultPath,
    paperId,
    commentId,
  })
}

export function resetPaperComments(
  vaultPath: string,
  paperId: string,
): Promise<PaperCommentsReadResult> {
  return invokePaperCommentCommand<PaperCommentsReadResult>('reset_paper_comments', {
    vaultPath,
    paperId,
  })
}
