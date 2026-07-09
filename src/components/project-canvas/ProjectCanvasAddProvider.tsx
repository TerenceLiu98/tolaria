import { useCallback, useMemo, useState, type ReactNode } from 'react'
import { FolderOpen, MagnifyingGlass } from '@phosphor-icons/react'
import { translate, type AppLocale } from '../../lib/i18n'
import { trackProjectCanvasExternalNodeAdded } from '../../lib/productAnalytics'
import type { VaultEntry } from '../../types'
import {
  addNodeToProjectCanvas,
  type AddNodeToProjectCanvasResult,
} from '../../projectCanvasActions'
import { Button } from '../ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '../ui/dialog'
import { Input } from '../ui/input'
import type { ProjectCanvasAddRequest } from './projectCanvasAddRequests'
import { ProjectCanvasAddContext } from './projectCanvasAddContext'
import { requestProjectCanvasOpen } from './projectCanvasNavigation'

type AddNodeAction = typeof addNodeToProjectCanvas
interface ProjectCanvasAddProviderProps {
  addNode?: AddNodeAction
  children: ReactNode
  entries: VaultEntry[]
  locale?: AppLocale
  onOpenProject: (entry: VaultEntry) => void
  vaultPath: string
}

function projectVaultPath(project: VaultEntry, fallback: string): string {
  return project.workspace?.path || fallback
}

export function ProjectCanvasAddProvider({
  addNode = addNodeToProjectCanvas,
  children,
  entries,
  locale = 'en',
  onOpenProject,
  vaultPath,
}: ProjectCanvasAddProviderProps) {
  const [request, setRequest] = useState<ProjectCanvasAddRequest | null>(null)
  const [query, setQuery] = useState('')
  const [busyProjectPath, setBusyProjectPath] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const projects = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase()
    return entries
      .filter(entry => entry.isA === 'Project' && !entry.archived)
      .filter(entry => !normalizedQuery || entry.title.toLowerCase().includes(normalizedQuery))
  }, [entries, query])

  const close = useCallback(() => {
    setRequest(null)
    setQuery('')
    setError(null)
    setBusyProjectPath(null)
  }, [])

  const requestAdd = useCallback((nextRequest: ProjectCanvasAddRequest) => {
    setRequest(nextRequest)
    setQuery('')
    setError(null)
  }, [])

  const selectProject = useCallback(async (project: VaultEntry) => {
    if (!request) return
    setBusyProjectPath(project.path)
    setError(null)
    try {
      const result: AddNodeToProjectCanvasResult = await addNode({
        vaultPath: projectVaultPath(project, vaultPath),
        projectPath: project.path,
        node: request.node,
      })
      trackProjectCanvasExternalNodeAdded({
        createdCanvas: result.createdCanvas,
        duplicate: result.duplicate,
        nodeType: result.node.type,
        source: request.source,
      })
      requestProjectCanvasOpen({ projectPath: project.path, nodeId: result.node.id })
      onOpenProject(project)
      close()
    } catch (addError) {
      setError(addError instanceof Error ? addError.message : String(addError))
      setBusyProjectPath(null)
    }
  }, [addNode, close, onOpenProject, request, vaultPath])

  return (
    <ProjectCanvasAddContext.Provider value={requestAdd}>
      {children}
      <Dialog open={Boolean(request)} onOpenChange={(open) => { if (!open) close() }}>
        <DialogContent className="max-h-[min(640px,calc(100vh-2rem))] overflow-hidden sm:max-w-[460px]">
          <DialogHeader>
            <DialogTitle>{translate(locale, 'projectCanvas.picker.title')}</DialogTitle>
            <DialogDescription>
              {translate(locale, 'projectCanvas.picker.description', { item: request?.label ?? '' })}
            </DialogDescription>
          </DialogHeader>
          <div className="relative">
            <MagnifyingGlass className="pointer-events-none absolute left-3 top-2.5 text-muted-foreground" size={16} />
            <Input
              className="pl-9"
              value={query}
              onChange={event => setQuery(event.target.value)}
              placeholder={translate(locale, 'projectCanvas.picker.search')}
              autoFocus
            />
          </div>
          <div className="flex max-h-[360px] min-h-24 flex-col gap-1 overflow-y-auto">
            {projects.map(project => (
              <Button
                key={`${project.workspace?.id ?? 'active'}:${project.path}`}
                type="button"
                variant="ghost"
                className="h-auto min-w-0 justify-start px-3 py-2 text-left"
                disabled={Boolean(busyProjectPath)}
                onClick={() => { void selectProject(project) }}
              >
                <FolderOpen size={16} />
                <span className="min-w-0 flex-1 truncate">{project.title}</span>
                {project.workspace?.mounted && (
                  <span className="shrink-0 text-xs text-muted-foreground">{project.workspace.shortLabel}</span>
                )}
              </Button>
            ))}
            {projects.length === 0 && (
              <p className="px-3 py-6 text-center text-sm text-muted-foreground">
                {translate(locale, 'projectCanvas.picker.empty')}
              </p>
            )}
          </div>
          {busyProjectPath && (
            <p className="text-xs text-muted-foreground">{translate(locale, 'projectCanvas.picker.adding')}</p>
          )}
          {error && <p className="text-sm text-destructive" role="alert">{error}</p>}
        </DialogContent>
      </Dialog>
    </ProjectCanvasAddContext.Provider>
  )
}
