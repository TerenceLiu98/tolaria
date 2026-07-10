import type { AppLocale } from '../../lib/i18n'
import type { VaultEntry } from '../../types'
import type { AiSelectedTextContext } from '../../utils/ai-context'
import type { PaperParserProvider } from '../../paper/parserSettings'
import { ProjectCanvasSurface } from './ProjectCanvasSurface'
import './ProjectCanvasSurface.css'

interface ProjectWorkspaceSurfaceProps {
  editable?: boolean
  entries: VaultEntry[]
  locale?: AppLocale
  onCopyFilePath?: (path: string) => void
  onContentChange?: (path: string, content: string) => void
  onNavigateWikilink: (target: string) => void
  onOpenExternalFile?: (path: string) => void
  onParsePaper?: (paperId: string, options?: { force?: boolean }) => void | Promise<void>
  onRevealFile?: (path: string) => void
  onSave?: () => void
  onSelectedTextContextChange?: (context: AiSelectedTextContext | null) => void
  paperParserProvider?: PaperParserProvider
  sourceEntry: VaultEntry
  vaultPath?: string
}

export function ProjectWorkspaceSurface({
  editable = true,
  entries,
  locale = 'en',
  onCopyFilePath,
  onContentChange,
  onNavigateWikilink,
  onOpenExternalFile,
  onParsePaper,
  onRevealFile,
  onSave,
  onSelectedTextContextChange,
  paperParserProvider = 'none',
  sourceEntry,
  vaultPath,
}: ProjectWorkspaceSurfaceProps) {
  return (
    <div className="project-workspace-surface" data-testid="project-workspace-surface">
      <ProjectCanvasSurface
        editable={editable}
        entry={sourceEntry}
        entries={entries}
        onCopyFilePath={onCopyFilePath}
        onContentChange={onContentChange}
        onOpenExternalFile={onOpenExternalFile}
        onParsePaper={onParsePaper}
        onRevealFile={onRevealFile}
        onSave={onSave}
        onSelectedTextContextChange={onSelectedTextContextChange}
        paperParserProvider={paperParserProvider}
        vaultPath={vaultPath}
        locale={locale}
        onNavigateWikilink={onNavigateWikilink}
      />
    </div>
  )
}
