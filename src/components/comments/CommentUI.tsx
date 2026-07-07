import { NotePencil, Plus, X } from '@phosphor-icons/react'
import { type ReactNode, useState } from 'react'
import { cn } from '@/lib/utils'
import { Button } from '../ui/button'
import { Textarea } from '../ui/textarea'
import type { NoteComment } from '../../comments/commentProvider'

export function CommentGutter({
  anchorId,
  count,
  isOpen,
  onOpenThread,
  title,
}: {
  anchorId: string
  count: number
  isOpen: boolean
  onOpenThread: (anchorId: string) => void
  title: string
}) {
  return (
    <div className="flex justify-end pt-1">
      <Button
        type="button"
        variant={isOpen || count > 0 ? 'secondary' : 'ghost'}
        size="icon-sm"
        className={cn(
          'relative size-8 rounded-md text-muted-foreground',
          count === 0 && !isOpen && 'opacity-0 transition-opacity group-hover/comment-anchor:opacity-100 group-focus-within/comment-anchor:opacity-100',
        )}
        title={title}
        aria-label={title}
        aria-expanded={isOpen}
        onClick={() => onOpenThread(anchorId)}
      >
        {count > 0 ? <NotePencil className="size-4" /> : <Plus className="size-4" />}
        {count > 0 ? (
          <span
            className="absolute -right-1 -top-1 min-w-4 rounded-full bg-primary px-1 text-[10px] font-semibold leading-4 text-primary-foreground"
            data-testid={`comment-gutter-count-${anchorId}`}
          >
            {count}
          </span>
        ) : null}
      </Button>
    </div>
  )
}

export function CommentComposer({
  label,
  onSubmit,
  placeholder,
  submitLabel,
}: {
  label: string
  onSubmit: (body: string) => void
  placeholder: string
  submitLabel: string
}) {
  const [body, setBody] = useState('')
  const trimmedBody = body.trim()
  return (
    <div className="grid gap-2">
      <Textarea
        aria-label={label}
        className="min-h-14 resize-y text-xs"
        placeholder={placeholder}
        value={body}
        onChange={(event) => setBody(event.currentTarget.value)}
      />
      <div className="flex justify-end">
        <Button
          type="button"
          size="sm"
          disabled={trimmedBody.length === 0}
          onClick={() => {
            if (trimmedBody.length === 0) return
            onSubmit(trimmedBody)
            setBody('')
          }}
        >
          <Plus className="size-4" />
          {submitLabel}
        </Button>
      </div>
    </div>
  )
}

export function CommentThreadPanel({
  actions,
  children,
  closeLabel = 'Close',
  commentsListTestId,
  comments,
  emptyText,
  onClose,
  renderComment,
  subtitle,
  testId,
  title,
  toolbar,
}: {
  actions?: ReactNode
  children?: ReactNode
  closeLabel?: string
  commentsListTestId?: string
  comments: readonly NoteComment[]
  emptyText: string
  onClose?: () => void
  renderComment: (comment: NoteComment) => ReactNode
  subtitle?: string
  testId?: string
  title: string
  toolbar?: ReactNode
}) {
  return (
    <aside
      className="grid max-h-[min(28rem,80vh)] gap-3 overflow-auto rounded-md border border-border bg-popover p-3 shadow-lg"
      data-testid={testId}
      onKeyDown={(event) => {
        if (event.key === 'Escape' && onClose) {
          event.stopPropagation()
          onClose()
        }
      }}
    >
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <h3 className="text-sm font-semibold text-foreground">{title}</h3>
          {subtitle ? <p className="mt-1 truncate text-xs text-muted-foreground">{subtitle}</p> : null}
        </div>
        {actions || onClose ? (
          <div className="flex flex-wrap items-center gap-1">
            {actions}
            {onClose ? (
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                aria-label={closeLabel}
                title={closeLabel}
                onClick={onClose}
              >
                <X className="size-3.5" />
              </Button>
            ) : null}
          </div>
        ) : null}
      </div>
      {toolbar}
      {comments.length === 0 ? (
        <p className="text-xs text-muted-foreground">{emptyText}</p>
      ) : (
        <ul className="grid gap-1" data-testid={commentsListTestId}>{comments.map(renderComment)}</ul>
      )}
      {children}
    </aside>
  )
}
