import type { AppLocale } from '../../lib/i18n'
import type { VaultEntry } from '../../types'
import { ProjectCanvasSurface } from './ProjectCanvasSurface'
import './ProjectCanvasSurface.css'

interface ProjectWorkspaceSurfaceProps {
  entries: VaultEntry[]
  locale?: AppLocale
  onNavigateWikilink: (target: string) => void
  sourceEntry: VaultEntry
  vaultPath?: string
}

export function ProjectWorkspaceSurface({
  entries,
  locale = 'en',
  onNavigateWikilink,
  sourceEntry,
  vaultPath,
}: ProjectWorkspaceSurfaceProps) {
  return (
    <div className="project-workspace-surface" data-testid="project-workspace-surface">
      <ProjectCanvasSurface
        entry={sourceEntry}
        entries={entries}
        vaultPath={vaultPath}
        locale={locale}
        onNavigateWikilink={onNavigateWikilink}
      />
    </div>
  )
}
