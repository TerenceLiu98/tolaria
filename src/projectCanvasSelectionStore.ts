import { useSyncExternalStore } from 'react'
import { createCrossWindowPersistedStore } from './lib/crossWindowPersistedStore'

const EMPTY_SELECTION: ProjectCanvasSelection = { projectPath: null, nodeId: null }

export interface ProjectCanvasSelection {
  projectPath: string | null
  nodeId: string | null
}

function sanitizedSelection(value: unknown): ProjectCanvasSelection {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return EMPTY_SELECTION
  const record = value as Record<string, unknown>
  return {
    projectPath: typeof record.projectPath === 'string' ? record.projectPath : null,
    nodeId: typeof record.nodeId === 'string' ? record.nodeId : null,
  }
}

const selectionStore = createCrossWindowPersistedStore<ProjectCanvasSelection>({
  broadcastChannelName: 'sapientia-project-canvas-selection',
  broadcastMessage: { type: 'project-canvas-selection-updated' },
  emptySnapshot: EMPTY_SELECTION,
  sanitizeStoredValue: sanitizedSelection,
  storageKey: 'sapientia:project-canvas-selection:v1',
})

selectionStore.ensureCrossWindowSync()

export function projectCanvasSelectionSnapshot(): ProjectCanvasSelection {
  return selectionStore.getSnapshot()
}

export function subscribeProjectCanvasSelection(listener: () => void): () => void {
  return selectionStore.subscribe(listener)
}

export function publishProjectCanvasSelection(selection: ProjectCanvasSelection): void {
  selectionStore.publishSnapshot(sanitizedSelection(selection))
}

export function useProjectCanvasSelection(): ProjectCanvasSelection {
  return useSyncExternalStore(
    subscribeProjectCanvasSelection,
    projectCanvasSelectionSnapshot,
    projectCanvasSelectionSnapshot,
  )
}
