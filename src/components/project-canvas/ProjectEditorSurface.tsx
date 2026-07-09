import { useEffect, useState } from 'react'
import type { useCreateBlockNote } from '@blocknote/react'
import { translate, type AppLocale } from '../../lib/i18n'
import type { AiSelectedTextContext } from '../../utils/ai-context'
import type { VaultEntry } from '../../types'
import { NoteSurface } from '../NoteSurface'
import { Button } from '../ui/button'
import { ProjectCanvasSurface } from './ProjectCanvasSurface'
import {
  pendingProjectCanvasOpen,
  PROJECT_CANVAS_OPEN_EVENT,
  type ProjectCanvasOpenEvent,
} from './projectCanvasNavigation'
import './ProjectCanvasSurface.css'

interface ProjectEditorSurfaceProps {
  currentContent: string
  editor: ReturnType<typeof useCreateBlockNote>
  entries: VaultEntry[]
  onNavigateWikilink: (target: string) => void
  onChange?: () => void
  onSelectedTextContextChange?: (context: AiSelectedTextContext | null) => void
  sourceEntry: VaultEntry
  vaultPath?: string
  editable: boolean
  locale?: AppLocale
}

export function ProjectEditorSurface({
  currentContent,
  editor,
  entries,
  onNavigateWikilink,
  onChange,
  onSelectedTextContextChange,
  sourceEntry,
  vaultPath,
  editable,
  locale = 'en',
}: ProjectEditorSurfaceProps) {
  const [mode, setMode] = useState<'note' | 'canvas'>(() => (
    pendingProjectCanvasOpen(sourceEntry.path) ? 'canvas' : 'note'
  ))

  useEffect(() => {
    const handleOpen = (event: Event) => {
      const intent = (event as ProjectCanvasOpenEvent).detail
      if (intent.projectPath === sourceEntry.path) setMode('canvas')
    }
    window.addEventListener(PROJECT_CANVAS_OPEN_EVENT, handleOpen)
    return () => window.removeEventListener(PROJECT_CANVAS_OPEN_EVENT, handleOpen)
  }, [sourceEntry.path])

  return (
    <div className="project-editor-surface" data-testid="project-editor-surface">
      <div className="project-editor-surface__tabs">
        <Button
          type="button"
          size="xs"
          variant={mode === 'note' ? 'secondary' : 'ghost'}
          onClick={() => setMode('note')}
        >
          {translate(locale, 'projectCanvas.tabNote')}
        </Button>
        <Button
          type="button"
          size="xs"
          variant={mode === 'canvas' ? 'secondary' : 'ghost'}
          onClick={() => setMode('canvas')}
        >
          {translate(locale, 'projectCanvas.tabCanvas')}
        </Button>
      </div>
      <div className="project-editor-surface__body">
        {mode === 'note' ? (
          <div className="editor-content-wrapper" data-note-pdf-export-root="true">
            <NoteSurface
              currentContent={currentContent}
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
        ) : (
          <ProjectCanvasSurface
            entry={sourceEntry}
            entries={entries}
            vaultPath={vaultPath}
            locale={locale}
            onNavigateWikilink={onNavigateWikilink}
          />
        )}
      </div>
    </div>
  )
}
