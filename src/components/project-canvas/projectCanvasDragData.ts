import type { ProjectCanvasNodeType } from '../../projectCanvas'
import type { VaultEntry } from '../../types'

export const PROJECT_CANVAS_DRAG_MIME = 'application/x-sapientia-project-canvas-node'

export interface ProjectCanvasDragPayload {
  nodeType: ProjectCanvasNodeType
  ref: string
  title?: string
  text?: string
}

export function projectCanvasDragPayloadFromEntry(entry: VaultEntry): ProjectCanvasDragPayload | null {
  if (entry.isA !== 'Note' && entry.isA !== 'Paper') return null
  return {
    nodeType: entry.isA === 'Paper' ? 'paper' : 'note',
    ref: entry.path,
    title: entry.title,
    text: entry.snippet || undefined,
  }
}

export function writeProjectCanvasDragPayload(dataTransfer: DataTransfer, payload: ProjectCanvasDragPayload): void {
  dataTransfer.setData(PROJECT_CANVAS_DRAG_MIME, JSON.stringify(payload))
  dataTransfer.setData('text/plain', payload.ref)
}

export function readProjectCanvasDragPayload(dataTransfer: DataTransfer): ProjectCanvasDragPayload | null {
  const raw = dataTransfer.getData(PROJECT_CANVAS_DRAG_MIME)
  if (!raw) return null
  try {
    const parsed = JSON.parse(raw) as Partial<ProjectCanvasDragPayload>
    if (!parsed.nodeType || !parsed.ref) return null
    if (parsed.nodeType !== 'note' && parsed.nodeType !== 'paper') return null
    return {
      nodeType: parsed.nodeType,
      ref: parsed.ref,
      title: parsed.title,
      text: parsed.text,
    }
  } catch {
    return null
  }
}
