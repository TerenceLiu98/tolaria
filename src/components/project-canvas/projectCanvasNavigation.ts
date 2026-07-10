export const PROJECT_CANVAS_OPEN_EVENT = 'sapientia:project-canvas-open'
export const PROJECT_CANVAS_NAVIGATE_EVENT = 'sapientia:project-canvas-navigate'
export const PROJECT_CANVAS_DRAFT_EVENT = 'sapientia:project-canvas-draft'

export interface ProjectCanvasOpenIntent {
  projectPath: string
  nodeId: string
}

export type ProjectCanvasOpenEvent = CustomEvent<ProjectCanvasOpenIntent>

export interface ProjectCanvasNavigateIntent {
  projectPath: string
  target: string
}

export type ProjectCanvasNavigateEvent = CustomEvent<ProjectCanvasNavigateIntent>

export interface ProjectCanvasDraftIntent {
  projectPath: string
  title: string
  content: string
}

export type ProjectCanvasDraftEvent = CustomEvent<ProjectCanvasDraftIntent>

let pendingIntent: ProjectCanvasOpenIntent | null = null
let pendingNavigateIntent: ProjectCanvasNavigateIntent | null = null
let pendingDraftIntent: ProjectCanvasDraftIntent | null = null

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

export function requestProjectCanvasNavigate(intent: ProjectCanvasNavigateIntent): void {
  pendingNavigateIntent = { ...intent }
  window.dispatchEvent(new CustomEvent(PROJECT_CANVAS_NAVIGATE_EVENT, { detail: intent }))
}

export function pendingProjectCanvasNavigate(projectPath: string): ProjectCanvasNavigateIntent | null {
  return pendingNavigateIntent?.projectPath === projectPath ? { ...pendingNavigateIntent } : null
}

export function consumeProjectCanvasNavigate(projectPath: string): ProjectCanvasNavigateIntent | null {
  const intent = pendingProjectCanvasNavigate(projectPath)
  if (intent) pendingNavigateIntent = null
  return intent
}

export function requestProjectCanvasDraft(intent: ProjectCanvasDraftIntent): void {
  pendingDraftIntent = { ...intent }
  window.dispatchEvent(new CustomEvent(PROJECT_CANVAS_DRAFT_EVENT, { detail: intent }))
}

export function pendingProjectCanvasDraft(projectPath: string): ProjectCanvasDraftIntent | null {
  return pendingDraftIntent?.projectPath === projectPath ? { ...pendingDraftIntent } : null
}

export function consumeProjectCanvasDraft(projectPath: string): ProjectCanvasDraftIntent | null {
  const intent = pendingProjectCanvasDraft(projectPath)
  if (intent) pendingDraftIntent = null
  return intent
}
