import { forwardRef, useImperativeHandle, useMemo } from 'react'
import type { useCreateBlockNote } from '@blocknote/react'
import { cn } from '@/lib/utils'
import type { AppLocale } from '../lib/i18n'
import type { AiSelectedTextContext } from '../utils/ai-context'
import type { VaultEntry } from '../types'
import type { EditorCommentAnchor, EditorCommentOptions } from './comments/commentAnchors'
import { createBlockNoteEditorAdapter, type SapientiaEditorAdapter } from './editorAdapter'
import { SingleEditorView } from './SingleEditorView'

export type NoteSurfaceCommentAnchor = EditorCommentAnchor
export type NoteSurfaceCommentOptions = EditorCommentOptions

export type NoteSurfaceAdapter = SapientiaEditorAdapter

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
  const editorAdapter = useMemo(() => createBlockNoteEditorAdapter(editor), [editor])
  useImperativeHandle(ref, () => editorAdapter, [editorAdapter])

  return (
    <div
      className={cn(
        'note-surface relative min-h-0 flex-1',
        className,
      )}
      data-testid="note-surface"
      data-note-surface-readonly={!editable ? 'true' : undefined}
    >
      <SingleEditorView
        commentOptions={commentOptions}
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
  )
})
