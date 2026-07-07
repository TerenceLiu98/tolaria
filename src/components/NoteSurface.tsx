import { forwardRef, useCallback, useImperativeHandle, useLayoutEffect, useMemo, useState, type ReactNode } from 'react'
import type { useCreateBlockNote } from '@blocknote/react'
import { cn } from '@/lib/utils'
import type { NoteComment } from '../comments/commentProvider'
import type { AppLocale } from '../lib/i18n'
import type { AiSelectedTextContext } from '../utils/ai-context'
import type { VaultEntry } from '../types'
import { CommentGutter } from './comments/CommentUI'
import { createBlockNoteEditorAdapter, type SapientiaEditorAdapter } from './editorAdapter'
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

export type NoteSurfaceAdapter = SapientiaEditorAdapter

interface CommentAnchorPosition {
  anchor: NoteSurfaceCommentAnchor
  top: number
}

export interface NoteSurfaceProps {
  className?: string
  commentOptions?: NoteSurfaceCommentOptions
  editable?: boolean
  editor: ReturnType<typeof useCreateBlockNote>
  entries: VaultEntry[]
  locale?: AppLocale
  onChange?: () => void
  onSelectedTextContextChange?: (context: AiSelectedTextContext | null) => void
  onNavigateWikilink: (target: string) => void
  sourceEntry?: VaultEntry | null
  vaultPath?: string
}

function cssAttributeValue(value: string): string {
  return typeof CSS !== 'undefined' && typeof CSS.escape === 'function'
    ? CSS.escape(value)
    : value.replace(/["\\]/gu, '\\$&')
}

function editorBlockIdAtIndex(
  editor: ReturnType<typeof useCreateBlockNote>,
  index: number,
): string | null {
  const block = editor.document?.[index]
  return typeof block === 'object' && block !== null && 'id' in block && typeof block.id === 'string'
    ? block.id
    : null
}

function blockElementForAnchorIndex(
  editor: ReturnType<typeof useCreateBlockNote>,
  index: number,
): HTMLElement | null {
  const blockId = editorBlockIdAtIndex(editor, index)
  if (!blockId) return null
  const target = editor.domElement?.querySelector(`[data-id="${cssAttributeValue(blockId)}"]`)
  return target instanceof HTMLElement ? target : null
}

function useCommentAnchorPositions({
  anchors,
  editor,
  surfaceElement,
}: {
  anchors: readonly NoteSurfaceCommentAnchor[]
  editor: ReturnType<typeof useCreateBlockNote>
  surfaceElement: HTMLElement | null
}) {
  const [positions, setPositions] = useState<CommentAnchorPosition[]>([])

  const measure = useCallback(() => {
    if (!surfaceElement) {
      setPositions(anchors.map((anchor, index) => ({ anchor, top: index * 40 })))
      return
    }

    const surfaceRect = surfaceElement.getBoundingClientRect()
    setPositions(anchors.map((anchor, index) => {
      const blockElement = blockElementForAnchorIndex(editor, index)
      if (!blockElement) return { anchor, top: index * 40 }
      const blockRect = blockElement.getBoundingClientRect()
      return {
        anchor,
        top: Math.max(0, blockRect.top - surfaceRect.top),
      }
    }))
  }, [anchors, editor, surfaceElement])

  useLayoutEffect(() => {
    let animationFrame = requestAnimationFrame(measure)
    const scheduleMeasure = () => {
      cancelAnimationFrame(animationFrame)
      animationFrame = requestAnimationFrame(measure)
    }

    window.addEventListener('resize', scheduleMeasure)
    const resizeObserver = typeof ResizeObserver !== 'undefined'
      ? new ResizeObserver(scheduleMeasure)
      : null
    if (surfaceElement) resizeObserver?.observe(surfaceElement)
    if (editor.domElement instanceof HTMLElement) resizeObserver?.observe(editor.domElement)

    return () => {
      cancelAnimationFrame(animationFrame)
      window.removeEventListener('resize', scheduleMeasure)
      resizeObserver?.disconnect()
    }
  }, [editor, measure, surfaceElement])

  return positions
}

function CommentAnchorOverlay({
  anchors,
  editor,
  onOpenThread,
  renderThread,
  selectedAnchorId,
  surfaceElement,
}: NoteSurfaceCommentOptions & {
  editor: ReturnType<typeof useCreateBlockNote>
  surfaceElement: HTMLElement | null
}) {
  const positions = useCommentAnchorPositions({ anchors, editor, surfaceElement })

  return (
    <div
      className="pointer-events-none absolute inset-y-0 right-1 z-10 w-10"
      data-testid="note-surface-comment-seam"
    >
      {positions.map(({ anchor, top }) => {
        const isOpen = selectedAnchorId === anchor.id
        return (
          <div
            key={anchor.id}
            className="group/comment-anchor pointer-events-auto absolute right-0"
            data-paper-source-block-id={anchor.id}
            data-testid={`note-surface-comment-anchor-${anchor.id}`}
            style={{ top }}
          >
            <CommentGutter
              anchorId={anchor.id}
              count={anchor.comments.length}
              isOpen={isOpen}
              onOpenThread={onOpenThread}
              title={anchor.title}
            />
            {isOpen ? (
              <div className="absolute right-10 top-0 z-20 w-[min(22rem,calc(100vw-5rem))] max-w-[80vw]">
                {renderThread(anchor.id)}
              </div>
            ) : null}
          </div>
        )
      })}
    </div>
  )
}

export const NoteSurface = forwardRef<NoteSurfaceAdapter, NoteSurfaceProps>(function NoteSurface({
  className,
  commentOptions,
  editable = true,
  editor,
  entries,
  locale = 'en',
  onChange,
  onSelectedTextContextChange,
  onNavigateWikilink,
  sourceEntry,
  vaultPath,
}, ref) {
  const [surfaceElement, setSurfaceElement] = useState<HTMLDivElement | null>(null)
  const editorAdapter = useMemo(() => createBlockNoteEditorAdapter(editor), [editor])
  useImperativeHandle(ref, () => editorAdapter, [editorAdapter])

  return (
    <div
      ref={setSurfaceElement}
      className={cn(
        'note-surface relative min-h-0 flex-1',
        className,
      )}
      data-testid="note-surface"
      data-note-surface-readonly={!editable ? 'true' : undefined}
    >
      <div className={cn('min-w-0', commentOptions && 'pr-10')}>
        <SingleEditorView
          editor={editor}
          entries={entries}
          onNavigateWikilink={onNavigateWikilink}
          onChange={onChange}
          onSelectedTextContextChange={onSelectedTextContextChange}
          sourceEntry={sourceEntry}
          vaultPath={vaultPath}
          editable={editable}
          locale={locale}
        />
      </div>
      {commentOptions ? (
        <CommentAnchorOverlay
          anchors={commentOptions.anchors}
          editor={editor}
          onOpenThread={commentOptions.onOpenThread}
          renderThread={commentOptions.renderThread}
          selectedAnchorId={commentOptions.selectedAnchorId}
          surfaceElement={surfaceElement}
        />
      ) : null}
    </div>
  )
})
