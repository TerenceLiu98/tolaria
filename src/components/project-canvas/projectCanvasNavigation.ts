export const PROJECT_CANVAS_OPEN_EVENT = 'sapientia:project-canvas-open'

export interface ProjectCanvasOpenIntent {
  projectPath: string
  nodeId: string
}

export type ProjectCanvasOpenEvent = CustomEvent<ProjectCanvasOpenIntent>

let pendingIntent: ProjectCanvasOpenIntent | null = null

export function requestProjectCanvasOpen(intent: ProjectCanvasOpenIntent): void {
  pendingIntent = { ...intent }
  window.dispatchEvent(new CustomEvent(PROJECT_CANVAS_OPEN_EVENT, { detail: intent }))
}

export function pendingProjectCanvasOpen(projectPath: string): ProjectCanvasOpenIntent | null {
  return pendingIntent?.projectPath === projectPath ? { ...pendingIntent } : null
}

export function consumeProjectCanvasOpen(projectPath: string): ProjectCanvasOpenIntent | null {
  const intent = pendingProjectCanvasOpen(projectPath)
  if (intent) pendingIntent = null
  return intent
}
