import { useEffect, useState } from 'react'
import {
  getCachedNoteContentEntry,
  loadContentForOpen,
} from '../../hooks/noteContentCache'
import type { AppLocale } from '../../lib/i18n'
import type { VaultEntry } from '../../types'
import { extractEditorBody } from '../../hooks/editorTabContent'
import { MarkdownContent } from '../MarkdownContent'

interface ProjectDocumentPreviewProps {
  active: boolean
  entry: VaultEntry
  locale?: AppLocale
  onNavigateWikilink: (target: string) => void
}

export function ProjectDocumentPreview({
  active,
  entry,
  locale = 'en',
  onNavigateWikilink,
}: ProjectDocumentPreviewProps) {
  const [loaded, setLoaded] = useState<{ content: string; path: string } | null>(null)

  useEffect(() => {
    if (!active) return
    let canceled = false
    void loadContentForOpen({
      cachedEntry: getCachedNoteContentEntry(entry.path),
      entry,
      forceReload: false,
    }).then((loaded) => {
      if (!canceled) setLoaded({ content: extractEditorBody(loaded), path: entry.path })
    }).catch(() => {
      if (!canceled) setLoaded({ content: '', path: entry.path })
    })
    return () => {
      canceled = true
    }
  }, [active, entry])

  if (!active) return null
  const content = loaded?.path === entry.path ? loaded.content : null
  const preview = content?.trim() ? content : entry.snippet
  if (!preview) return null

  return (
    <div
      className="project-document-preview"
      data-testid="project-document-preview"
      onClick={event => event.stopPropagation()}
      onPointerDown={event => event.stopPropagation()}
      onWheel={event => event.stopPropagation()}
    >
      <MarkdownContent
        content={preview}
        locale={locale}
        onWikilinkClick={onNavigateWikilink}
      />
    </div>
  )
}
