import { useCallback, useMemo, useState } from 'react'
import {
  Check,
  ClipboardText,
  Trash,
} from '@phosphor-icons/react'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import {
  CommentComposer,
  CommentThreadPanel,
} from '../components/comments/CommentUI'
import type { NoteComment } from '../comments/commentProvider'
import { translate, type AppLocale } from '../lib/i18n'
import {
  type PaperComment,
  type PaperCommentKind,
} from './comments'
import {
  activePaperCommentReactions,
  activePaperCommentReplies,
  addPaperCommentReply,
  cleanOptionalCommentText,
  deletePaperCommentReply,
  PAPER_COMMENT_KIND,
  PAPER_COMMENT_REACTION_EMOJI,
  paperCommentHasReaction,
  paperCommentIsResolved,
  savePaperCommentNote,
  togglePaperCommentReaction,
  togglePaperCommentResolved,
  type PaperCommentThreadFilter,
  type PaperCommentThreadSort,
  visiblePaperComments,
} from './paperCommentThreadModel'
import { paperCommentToComment } from './paperCommentProvider'
import type { SourceBlock } from './sourceBlocks'

function BlockCommentComposer({
  block,
  locale,
  onCreateComment,
  selectedQuote,
}: {
  block: SourceBlock
  locale: AppLocale
  onCreateComment: (block: SourceBlock, input: {
    kind: PaperCommentKind
    note?: string
    text?: string
  }) => void
  selectedQuote?: string | null
}) {
  const createComment = useCallback((note: string) => {
    onCreateComment(block, {
      kind: PAPER_COMMENT_KIND,
      note: cleanOptionalCommentText(note),
      text: cleanOptionalCommentText(selectedQuote),
    })
  }, [block, onCreateComment, selectedQuote])

  return (
    <div
      className="grid gap-2 rounded-md border border-border/60 bg-muted/30 p-2"
      data-testid={`paper-reader-comment-controls-${block.id}`}
    >
      {selectedQuote ? (
        <blockquote
          className="line-clamp-3 rounded border-l-2 border-primary/50 bg-background/70 px-2 py-1 text-xs text-muted-foreground"
          data-testid={`paper-reader-comment-selected-quote-${block.id}`}
        >
          {selectedQuote}
        </blockquote>
      ) : null}
      <CommentComposer
        label={translate(locale, 'paper.reader.addComment')}
        placeholder={translate(locale, 'paper.reader.addComment')}
        submitLabel={translate(locale, 'paper.reader.addComment')}
        onSubmit={createComment}
      />
    </div>
  )
}

function PaperCommentEditor({
  comment,
  locale,
  onDeleteComment,
  onSaveComment,
}: {
  comment: PaperComment
  locale: AppLocale
  onDeleteComment: (commentId: string) => void
  onSaveComment: (comment: PaperComment) => void
}) {
  const [note, setNote] = useState(comment.note ?? comment.text ?? '')
  const isResolved = paperCommentIsResolved(comment)
  const reactions = activePaperCommentReactions(comment)
  const replies = activePaperCommentReplies(comment)
  const hasPrimaryReaction = paperCommentHasReaction(comment, PAPER_COMMENT_REACTION_EMOJI)

  const saveComment = useCallback(() => {
    onSaveComment(savePaperCommentNote(comment, note))
  }, [comment, note, onSaveComment])
  const toggleResolved = useCallback(() => {
    onSaveComment(togglePaperCommentResolved(comment))
  }, [comment, onSaveComment])
  const addReply = useCallback((replyNote: string) => {
    const nextComment = addPaperCommentReply(comment, replyNote)
    if (nextComment) onSaveComment(nextComment)
  }, [comment, onSaveComment])
  const deleteReply = useCallback((replyId: string) => {
    onSaveComment(deletePaperCommentReply(comment, replyId))
  }, [comment, onSaveComment])
  const toggleReaction = useCallback(() => {
    onSaveComment(togglePaperCommentReaction(comment, PAPER_COMMENT_REACTION_EMOJI))
  }, [comment, onSaveComment])

  return (
    <li
      className="grid gap-2 rounded-md bg-muted/60 px-2 py-2 text-xs text-muted-foreground"
      data-testid={`paper-reader-comment-editor-${comment.id}`}
    >
      <div className="flex flex-wrap items-center gap-2">
        {isResolved ? (
          <span
            className="rounded bg-background px-1.5 py-0.5 text-[11px] font-medium text-muted-foreground"
            data-testid={`paper-reader-comment-resolved-${comment.id}`}
          >
            {translate(locale, 'paper.reader.commentResolved')}
          </span>
        ) : null}
        {replies.length > 0 ? (
          <span
            className="rounded bg-background px-1.5 py-0.5 text-[11px] font-medium text-muted-foreground"
            data-testid={`paper-reader-comment-reply-count-${comment.id}`}
          >
            {translate(locale, 'paper.reader.commentReplies', { count: replies.length })}
          </span>
        ) : null}
        {reactions.map((reaction) => (
          <span
            key={reaction.emoji}
            className="rounded bg-background px-1.5 py-0.5 text-[11px] font-medium text-muted-foreground"
            data-testid={`paper-reader-comment-reaction-${comment.id}-${reaction.emoji}`}
          >
            {reaction.emoji} {reaction.count}
          </span>
        ))}
        <Button
          type="button"
          variant="secondary"
          size="xs"
          onClick={saveComment}
        >
          <Check className="size-3.5" />
          {translate(locale, 'common.save')}
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="xs"
          onClick={toggleResolved}
        >
          {isResolved ? translate(locale, 'paper.reader.reopenComment') : translate(locale, 'paper.reader.resolveComment')}
        </Button>
        <Button
          type="button"
          variant={hasPrimaryReaction ? 'secondary' : 'ghost'}
          size="xs"
          aria-pressed={hasPrimaryReaction}
          onClick={toggleReaction}
        >
          {hasPrimaryReaction
            ? translate(locale, 'paper.reader.removeCommentReaction', { emoji: PAPER_COMMENT_REACTION_EMOJI })
            : translate(locale, 'paper.reader.reactToComment', { emoji: PAPER_COMMENT_REACTION_EMOJI })}
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="icon-xs"
          title={translate(locale, 'paper.reader.deleteComment')}
          aria-label={translate(locale, 'paper.reader.deleteComment')}
          onClick={() => onDeleteComment(comment.id)}
        >
          <Trash className="size-4" />
        </Button>
      </div>
      <Textarea
        aria-label={translate(locale, 'paper.reader.addComment')}
        className="min-h-14 resize-y text-xs"
        placeholder={translate(locale, 'paper.reader.addComment')}
        value={note}
        onChange={(event) => setNote(event.currentTarget.value)}
      />
      {replies.length > 0 ? (
        <ul
          className="grid gap-1 border-l border-border/70 pl-2"
          data-testid={`paper-reader-comment-replies-${comment.id}`}
        >
          {replies.map((reply) => (
            <li key={reply.id} className="flex items-start justify-between gap-2 rounded bg-background/70 px-2 py-1 text-xs text-foreground">
              <span>{reply.note}</span>
              <Button
                type="button"
                variant="ghost"
                size="icon-xs"
                title={translate(locale, 'paper.reader.deleteReply')}
                aria-label={translate(locale, 'paper.reader.deleteReply')}
                onClick={() => deleteReply(reply.id)}
              >
                <Trash className="size-3.5" />
              </Button>
            </li>
          ))}
        </ul>
      ) : null}
      <CommentComposer
        label={translate(locale, 'paper.reader.replyToComment')}
        placeholder={translate(locale, 'paper.reader.replyToComment')}
        submitLabel={translate(locale, 'paper.reader.replyToComment')}
        onSubmit={addReply}
      />
    </li>
  )
}

export function PaperCommentThread({
  comments,
  block,
  locale,
  onCreateComment,
  onDeleteComment,
  onSaveComment,
  onCopyCitation,
  onClose,
  selectedQuote,
}: {
  comments: PaperComment[]
  block: SourceBlock
  locale: AppLocale
  onCreateComment: (block: SourceBlock, input: {
    kind: PaperCommentKind
    note?: string
    text?: string
  }) => void
  onDeleteComment: (commentId: string) => void
  onSaveComment: (comment: PaperComment) => void
  onCopyCitation: (block: SourceBlock) => void
  onClose: () => void
  selectedQuote?: string | null
}) {
  const [filter, setFilter] = useState<PaperCommentThreadFilter>('all')
  const [sort, setSort] = useState<PaperCommentThreadSort>('newest')
  const visibleComments = useMemo(
    () => visiblePaperComments(comments, filter, sort),
    [comments, filter, sort],
  )
  const threadComments = visibleComments
    .map(paperCommentToComment)
    .filter((comment): comment is NoteComment => comment !== null)
  const emptyText = comments.length === 0
    ? translate(locale, 'paper.reader.noBlockComments')
    : translate(locale, 'paper.reader.noMatchingBlockComments')
  const filterOptions: Array<{ label: string; value: PaperCommentThreadFilter }> = [
    { label: translate(locale, 'paper.reader.commentFilterAll'), value: 'all' },
    { label: translate(locale, 'paper.reader.commentFilterOpen'), value: 'open' },
    { label: translate(locale, 'paper.reader.commentFilterResolved'), value: 'resolved' },
  ]

  return (
    <CommentThreadPanel
      commentsListTestId={`paper-reader-comments-${block.id}`}
      comments={threadComments}
      emptyText={emptyText}
      closeLabel={translate(locale, 'window.close')}
      onClose={onClose}
      testId={`paper-reader-comment-thread-${block.id}`}
      title={translate(locale, 'paper.reader.commentThread')}
      toolbar={(
        <div className="flex flex-wrap items-center gap-1" data-testid={`paper-reader-comment-thread-controls-${block.id}`}>
          {filterOptions.map((option) => (
            <Button
              key={option.value}
              type="button"
              variant={filter === option.value ? 'secondary' : 'ghost'}
              size="xs"
              aria-pressed={filter === option.value}
              onClick={() => setFilter(option.value)}
            >
              {option.label}
            </Button>
          ))}
          <Button
            type="button"
            variant="ghost"
            size="xs"
            onClick={() => setSort(sort === 'newest' ? 'oldest' : 'newest')}
          >
            {sort === 'newest'
              ? translate(locale, 'paper.reader.commentSortNewest')
              : translate(locale, 'paper.reader.commentSortOldest')}
          </Button>
        </div>
      )}
      actions={(
        <Button
          type="button"
          variant="ghost"
          size="xs"
          onClick={() => onCopyCitation(block)}
        >
          <ClipboardText className="size-3.5" />
          {translate(locale, 'paper.reader.copyBlockCitation')}
        </Button>
      )}
      renderComment={(threadComment) => {
        const sourceComment = visibleComments.find((candidate) => candidate.id === threadComment.id)
        if (!sourceComment) return null
        return (
          <PaperCommentEditor
            key={sourceComment.id}
            comment={sourceComment}
            locale={locale}
            onDeleteComment={onDeleteComment}
            onSaveComment={onSaveComment}
          />
        )
      }}
    >
      <BlockCommentComposer
        block={block}
        locale={locale}
        onCreateComment={onCreateComment}
        selectedQuote={selectedQuote}
      />
    </CommentThreadPanel>
  )
}
