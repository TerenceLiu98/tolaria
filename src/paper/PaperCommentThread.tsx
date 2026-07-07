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
  type PaperAnnotation,
  type PaperAnnotationKind,
} from './annotations'
import {
  activePaperAnnotationReactions,
  activePaperAnnotationReplies,
  addPaperAnnotationReply,
  cleanOptionalCommentText,
  deletePaperAnnotationReply,
  PAPER_COMMENT_KIND,
  PAPER_COMMENT_REACTION_EMOJI,
  paperAnnotationHasReaction,
  paperAnnotationIsResolved,
  savePaperAnnotationNote,
  togglePaperAnnotationReaction,
  togglePaperAnnotationResolved,
  type PaperCommentThreadFilter,
  type PaperCommentThreadSort,
  visiblePaperCommentAnnotations,
} from './paperCommentThreadModel'
import { paperAnnotationToComment } from './paperCommentProvider'
import type { SourceBlock } from './sourceBlocks'

function BlockAnnotationComposer({
  block,
  locale,
  onCreateAnnotation,
  selectedQuote,
}: {
  block: SourceBlock
  locale: AppLocale
  onCreateAnnotation: (block: SourceBlock, input: {
    kind: PaperAnnotationKind
    note?: string
    text?: string
  }) => void
  selectedQuote?: string | null
}) {
  const createAnnotation = useCallback((note: string) => {
    onCreateAnnotation(block, {
      kind: PAPER_COMMENT_KIND,
      note: cleanOptionalCommentText(note),
      text: cleanOptionalCommentText(selectedQuote),
    })
  }, [block, onCreateAnnotation, selectedQuote])

  return (
    <div
      className="grid gap-2 rounded-md border border-border/60 bg-muted/30 p-2"
      data-testid={`paper-reader-annotation-controls-${block.id}`}
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
        onSubmit={createAnnotation}
      />
    </div>
  )
}

function PaperAnnotationEditor({
  annotation,
  locale,
  onDeleteAnnotation,
  onSaveAnnotation,
}: {
  annotation: PaperAnnotation
  locale: AppLocale
  onDeleteAnnotation: (annotationId: string) => void
  onSaveAnnotation: (annotation: PaperAnnotation) => void
}) {
  const [note, setNote] = useState(annotation.note ?? annotation.text ?? '')
  const isResolved = paperAnnotationIsResolved(annotation)
  const reactions = activePaperAnnotationReactions(annotation)
  const replies = activePaperAnnotationReplies(annotation)
  const hasPrimaryReaction = paperAnnotationHasReaction(annotation, PAPER_COMMENT_REACTION_EMOJI)

  const saveAnnotation = useCallback(() => {
    onSaveAnnotation(savePaperAnnotationNote(annotation, note))
  }, [annotation, note, onSaveAnnotation])
  const toggleResolved = useCallback(() => {
    onSaveAnnotation(togglePaperAnnotationResolved(annotation))
  }, [annotation, onSaveAnnotation])
  const addReply = useCallback((replyNote: string) => {
    const nextAnnotation = addPaperAnnotationReply(annotation, replyNote)
    if (nextAnnotation) onSaveAnnotation(nextAnnotation)
  }, [annotation, onSaveAnnotation])
  const deleteReply = useCallback((replyId: string) => {
    onSaveAnnotation(deletePaperAnnotationReply(annotation, replyId))
  }, [annotation, onSaveAnnotation])
  const toggleReaction = useCallback(() => {
    onSaveAnnotation(togglePaperAnnotationReaction(annotation, PAPER_COMMENT_REACTION_EMOJI))
  }, [annotation, onSaveAnnotation])

  return (
    <li
      className="grid gap-2 rounded-md bg-muted/60 px-2 py-2 text-xs text-muted-foreground"
      data-testid={`paper-reader-annotation-editor-${annotation.id}`}
    >
      <div className="flex flex-wrap items-center gap-2">
        {isResolved ? (
          <span
            className="rounded bg-background px-1.5 py-0.5 text-[11px] font-medium text-muted-foreground"
            data-testid={`paper-reader-annotation-resolved-${annotation.id}`}
          >
            {translate(locale, 'paper.reader.commentResolved')}
          </span>
        ) : null}
        {replies.length > 0 ? (
          <span
            className="rounded bg-background px-1.5 py-0.5 text-[11px] font-medium text-muted-foreground"
            data-testid={`paper-reader-annotation-reply-count-${annotation.id}`}
          >
            {translate(locale, 'paper.reader.commentReplies', { count: replies.length })}
          </span>
        ) : null}
        {reactions.map((reaction) => (
          <span
            key={reaction.emoji}
            className="rounded bg-background px-1.5 py-0.5 text-[11px] font-medium text-muted-foreground"
            data-testid={`paper-reader-annotation-reaction-${annotation.id}-${reaction.emoji}`}
          >
            {reaction.emoji} {reaction.count}
          </span>
        ))}
        <Button
          type="button"
          variant="secondary"
          size="xs"
          onClick={saveAnnotation}
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
          title={translate(locale, 'paper.reader.deleteAnnotation')}
          aria-label={translate(locale, 'paper.reader.deleteAnnotation')}
          onClick={() => onDeleteAnnotation(annotation.id)}
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
          data-testid={`paper-reader-annotation-replies-${annotation.id}`}
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
  annotations,
  block,
  locale,
  onCreateAnnotation,
  onDeleteAnnotation,
  onSaveAnnotation,
  onCopyCitation,
  onClose,
  selectedQuote,
}: {
  annotations: PaperAnnotation[]
  block: SourceBlock
  locale: AppLocale
  onCreateAnnotation: (block: SourceBlock, input: {
    kind: PaperAnnotationKind
    note?: string
    text?: string
  }) => void
  onDeleteAnnotation: (annotationId: string) => void
  onSaveAnnotation: (annotation: PaperAnnotation) => void
  onCopyCitation: (block: SourceBlock) => void
  onClose: () => void
  selectedQuote?: string | null
}) {
  const [filter, setFilter] = useState<PaperCommentThreadFilter>('all')
  const [sort, setSort] = useState<PaperCommentThreadSort>('newest')
  const visibleAnnotations = useMemo(
    () => visiblePaperCommentAnnotations(annotations, filter, sort),
    [annotations, filter, sort],
  )
  const comments = visibleAnnotations
    .map(paperAnnotationToComment)
    .filter((comment): comment is NoteComment => comment !== null)
  const emptyText = annotations.length === 0
    ? translate(locale, 'paper.reader.noBlockComments')
    : translate(locale, 'paper.reader.noMatchingBlockComments')
  const filterOptions: Array<{ label: string; value: PaperCommentThreadFilter }> = [
    { label: translate(locale, 'paper.reader.commentFilterAll'), value: 'all' },
    { label: translate(locale, 'paper.reader.commentFilterOpen'), value: 'open' },
    { label: translate(locale, 'paper.reader.commentFilterResolved'), value: 'resolved' },
  ]

  return (
    <CommentThreadPanel
      commentsListTestId={`paper-reader-annotations-${block.id}`}
      comments={comments}
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
      renderComment={(comment) => {
        const annotation = visibleAnnotations.find((candidate) => candidate.id === comment.id)
        if (!annotation) return null
        return (
          <PaperAnnotationEditor
            key={annotation.id}
            annotation={annotation}
            locale={locale}
            onDeleteAnnotation={onDeleteAnnotation}
            onSaveAnnotation={onSaveAnnotation}
          />
        )
      }}
    >
      <BlockAnnotationComposer
        block={block}
        locale={locale}
        onCreateAnnotation={onCreateAnnotation}
        selectedQuote={selectedQuote}
      />
    </CommentThreadPanel>
  )
}
