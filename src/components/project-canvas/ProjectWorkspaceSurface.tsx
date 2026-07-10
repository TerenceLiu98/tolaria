import type { AppLocale } from '../../lib/i18n'
import type { VaultEntry } from '../../types'
import type { AiSelectedTextContext } from '../../utils/ai-context'
import { ProjectCanvasSurface } from './ProjectCanvasSurface'
import './ProjectCanvasSurface.css'

interface ProjectWorkspaceSurfaceProps {
  editable?: boolean
  entries: VaultEntry[]
  locale?: AppLocale
  onContentChange?: (path: string, content: string) => void
  onNavigateWikilink: (target: string) => void
  onSave?: () => void
  onSelectedTextContextChange?: (context: AiSelectedTextContext | null) => void
  sourceEntry: VaultEntry
  vaultPath?: string
}

export function ProjectWorkspaceSurface({
  editable = true,
  entries,
  locale = 'en',
  onContentChange,
  onNavigateWikilink,
  onSave,
  onSelectedTextContextChange,
  sourceEntry,
  vaultPath,
}: ProjectWorkspaceSurfaceProps) {
  return (
    <div className="project-workspace-surface" data-testid="project-workspace-surface">
      <ProjectCanvasSurface
        editable={editable}
        entry={sourceEntry}
        entries={entries}
        onContentChange={onContentChange}
        onSave={onSave}
        onSelectedTextContextChange={onSelectedTextContextChange}
        vaultPath={vaultPath}
        locale={locale}
        onNavigateWikilink={onNavigateWikilink}
      />
    </div>
  )
}
