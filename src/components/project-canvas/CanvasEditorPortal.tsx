import { useCallback, useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import {
  cacheNoteContent,
  getCachedNoteContentEntry,
  loadContentForOpen,
} from '../../hooks/noteContentCache'
import { extractEditorBody } from '../../hooks/editorTabContent'
import type { AppLocale } from '../../lib/i18n'
import type { VaultEntry } from '../../types'
import type { AiSelectedTextContext } from '../../utils/ai-context'
import { serializeRichEditorDocumentToMarkdown } from '../../utils/richEditorMarkdown'
import { NoteSurface } from '../NoteSurface'
import { useSapientiaBlockNoteEditor } from '../useSapientiaBlockNoteEditor'

interface CanvasEditorPortalProps {
  editable: boolean
  entries: VaultEntry[]
  entry: VaultEntry
  locale?: AppLocale
  onClose?: () => void
  onContentChange?: (path: string, content: string) => void
  onNavigateWikilink: (target: string) => void
  onSelectedTextContextChange?: (context: AiSelectedTextContext | null) => void
  target: HTMLElement | null
  vaultPath?: string
}

export function CanvasEditorPortal({
  editable,
  entries,
  entry,
  locale = 'en',
  onClose,
  onContentChange,
  onNavigateWikilink,
  onSelectedTextContextChange,
  target,
  vaultPath,
}: CanvasEditorPortalProps) {
  const editor = useSapientiaBlockNoteEditor({ activePath: entry.path, vaultPath })
  const sourceContentRef = useRef<string | null>(null)
  const loadRequestRef = useRef(0)
  const [loadedPath, setLoadedPath] = useState<string | null>(null)
  const [sourceContent, setSourceContent] = useState<string | null>(null)

  useEffect(() => {
    const requestId = loadRequestRef.current + 1
    loadRequestRef.current = requestId
    sourceContentRef.current = null
    void loadContentForOpen({
      cachedEntry: getCachedNoteContentEntry(entry.path),
      entry,
      forceReload: false,
    }).then(async (content) => {
      const blocks = await editor.tryParseMarkdownToBlocks(extractEditorBody(content))
      if (loadRequestRef.current !== requestId) return
      sourceContentRef.current = content
      setSourceContent(content)
      editor.replaceBlocks(editor.document, blocks)
      setLoadedPath(entry.path)
    }).catch(() => {
      if (loadRequestRef.current === requestId) setLoadedPath(null)
    })
    return () => {
      loadRequestRef.current += 1
    }
  }, [editor, entry])

  const handleChange = useCallback(() => {
    const sourceContent = sourceContentRef.current
    if (sourceContent === null || loadedPath !== entry.path || !onContentChange) return
    const content = serializeRichEditorDocumentToMarkdown({
      editor,
      notePath: entry.path,
      tabContent: sourceContent,
      vaultPath,
    })
    sourceContentRef.current = content
    setSourceContent(content)
    cacheNoteContent(entry.path, content, entry, { parsedBlockPreload: false })
    onContentChange(entry.path, content)
  }, [editor, entry, loadedPath, onContentChange, vaultPath])

  if (!target || loadedPath !== entry.path || sourceContent === null) return null

  return createPortal(
    <div
      className="canvas-editor-portal"
      data-testid="canvas-editor-portal"
      onClick={event => event.stopPropagation()}
      onDoubleClick={event => event.stopPropagation()}
      onKeyDown={(event) => {
        event.stopPropagation()
        if (event.key === 'Escape') onClose?.()
      }}
      onPointerDown={event => event.stopPropagation()}
      onWheel={event => event.stopPropagation()}
    >
      <NoteSurface
        className="canvas-editor-portal__surface"
        currentContent={sourceContent}
        editable={editable}
        editor={editor}
        entries={entries}
        locale={locale}
        onChange={handleChange}
        onNavigateWikilink={onNavigateWikilink}
        onSelectedTextContextChange={onSelectedTextContextChange}
        sourceEntry={entry}
        vaultPath={vaultPath}
      />
    </div>,
    target,
  )
}
