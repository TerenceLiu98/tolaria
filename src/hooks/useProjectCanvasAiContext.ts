import { useEffect, useState } from 'react'
import { loadPaperBlock } from '../paper/blocks'
import {
  readProjectCanvas,
  resolveProjectCanvasRefs,
} from '../projectCanvas'
import {
  buildProjectCanvasAiContext,
  type ProjectCanvasAiContext,
} from '../projectCanvasAiContext'
import { useProjectCanvasSelection } from '../projectCanvasSelectionStore'
import type { VaultEntry } from '../types'

interface ProjectCanvasAiContextInput {
  activeEntry?: VaultEntry | null
  entries: VaultEntry[]
  selectedNodeId: string | null
  vaultPath: string
}

export interface ProjectCanvasAiContextDependencies {
  read: typeof readProjectCanvas
  readBlock: typeof readPaperBlock
  resolve: typeof resolveProjectCanvasRefs
}

const defaultDependencies: ProjectCanvasAiContextDependencies = {
  read: readProjectCanvas,
  readBlock: readPaperBlock,
  resolve: resolveProjectCanvasRefs,
}

async function readPaperBlock(vaultPath: string, paperId: string, blockId: string) {
  const result = await loadPaperBlock(vaultPath, paperId, blockId)
  return result.block
}

export async function loadProjectCanvasAiContext(
  input: ProjectCanvasAiContextInput,
  dependencies: ProjectCanvasAiContextDependencies = defaultDependencies,
): Promise<ProjectCanvasAiContext | null> {
  const { activeEntry, entries, selectedNodeId, vaultPath } = input
  if (!activeEntry || activeEntry.isA !== 'Project' || !vaultPath) return null
  const result = await dependencies.read(vaultPath, activeEntry.path)
  if (!result.canvas) return null
  const resolved = await dependencies.resolve(vaultPath, activeEntry.path, result.canvas).catch(() => ({
    projectPath: activeEntry.path,
    canvasPath: result.canvasPath,
    refs: [],
    diagnostics: [],
  }))
  return buildProjectCanvasAiContext({
    canvas: result.canvas,
    entries,
    projectEntry: activeEntry,
    refs: resolved.refs,
    selectedNodeId,
    vaultPath,
    readBlock: dependencies.readBlock,
  })
}

export function useProjectCanvasAiContext({
  activeEntry,
  entries,
  vaultPath,
}: Omit<ProjectCanvasAiContextInput, 'selectedNodeId'>): ProjectCanvasAiContext | null {
  const selection = useProjectCanvasSelection()
  const [context, setContext] = useState<ProjectCanvasAiContext | null>(null)
  const selectedNodeId = selection.projectPath === activeEntry?.path ? selection.nodeId : null

  useEffect(() => {
    let current = true
    void loadProjectCanvasAiContext({ activeEntry, entries, selectedNodeId, vaultPath })
      .then(nextContext => { if (current) setContext(nextContext) })
      .catch(() => { if (current) setContext(null) })
    return () => { current = false }
  }, [activeEntry, entries, selectedNodeId, vaultPath])

  return context
}
