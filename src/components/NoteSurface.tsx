import type { ReactNode } from 'react'
import type { useCreateBlockNote } from '@blocknote/react'
import { cn } from '@/lib/utils'
import type { NoteComment } from '../comments/commentProvider'
import type { AppLocale } from '../lib/i18n'
import type { VaultEntry } from '../types'
import { CommentGutter } from './comments/CommentUI'
import { SingleEditorView } from './SingleEditorView'

export interface NoteSurfaceCommentAnchor {
  comments: readonly NoteComment[]
  id: string
  title: string
}

export interface NoteSurfaceCommentOptions {
  anchors: readonly NoteSurfaceCommentAnchor[]
  onOpenThread: (anchorId: string) => void
  renderThread: (anchorId: string) => ReactNode
  selectedAnchorId: string | null
}

export function NoteSurface({
  className,
  commentOptions,
  editable = true,
  editor,
  entries,
  locale = 'en',
  onChange,
  onNavigateWikilink,
  sourceEntry,
  vaultPath,
}: {
  className?: string
  commentOptions?: NoteSurfaceCommentOptions
  editable?: boolean
  editor: ReturnType<typeof useCreateBlockNote>
  entries: VaultEntry[]
  locale?: AppLocale
  onChange?: () => void
  onNavigateWikilink: (target: string) => void
  sourceEntry?: VaultEntry | null
  vaultPath?: string
}) {
  return (
    <div
      className={cn(
        'note-surface grid min-h-0 flex-1',
        commentOptions ? 'grid-cols-[minmax(0,1fr)_3rem] gap-2' : 'grid-cols-1',
        className,
      )}
      data-testid="note-surface"
      data-note-surface-readonly={!editable ? 'true' : undefined}
    >
      <div className="min-w-0">
        <SingleEditorView
          editor={editor}
          entries={entries}
          onNavigateWikilink={onNavigateWikilink}
          onChange={onChange}
          sourceEntry={sourceEntry}
          vaultPath={vaultPath}
          editable={editable}
          locale={locale}
        />
      </div>
      {commentOptions ? (
        <aside
          className="relative flex min-h-0 flex-col overflow-visible border-l border-border"
          data-testid="note-surface-comment-seam"
        >
          <div className="flex min-h-0 flex-1 flex-col gap-1 overflow-visible p-2">
            {commentOptions.anchors.map((anchor) => {
              const isOpen = commentOptions.selectedAnchorId === anchor.id
              return (
                <div
                  key={anchor.id}
                  className="group/comment-anchor relative grid justify-items-end gap-2"
                  data-testid={`note-surface-comment-anchor-${anchor.id}`}
                >
                  <CommentGutter
                    anchorId={anchor.id}
                    count={anchor.comments.length}
                    isOpen={isOpen}
                    onOpenThread={commentOptions.onOpenThread}
                    title={anchor.title}
                  />
                  {isOpen ? (
                    <div className="absolute right-10 top-0 z-20 w-[min(22rem,calc(100vw-5rem))] max-w-[80vw]">
                      {commentOptions.renderThread(anchor.id)}
                    </div>
                  ) : null}
                </div>
              )
            })}
          </div>
        </aside>
      ) : null}
    </div>
  )
}
