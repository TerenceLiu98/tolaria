import { invoke } from '@tauri-apps/api/core'
import { isTauri, mockInvoke } from './mock-tauri'

export const PROJECT_CANVAS_SCHEMA = 'project-canvas/v1'
export const PROJECT_OVERVIEW_NODE_ID = 'project_overview'
const PROJECT_CANVAS_EDGE_ROUTINGS: ReadonlySet<string> = new Set(['straight', 'orthogonal', 'curved'])

const PROJECT_OVERVIEW_WIDTH = 420
const PROJECT_OVERVIEW_HEIGHT = 280

export type ProjectCanvasNodeType = 'note' | 'paper' | 'paper_block' | 'image' | 'text' | 'task' | 'group'
export type ProjectCanvasEdgeKind = 'related' | 'supports' | 'contradicts' | 'depends_on' | 'needs_reading'
export type ProjectCanvasEdgeRouting = 'straight' | 'orthogonal' | 'curved'
export type ProjectCanvasState = 'missing' | 'ready'
export type ProjectCanvasRefState = 'embedded' | 'resolved' | 'stale'

export interface ProjectCanvasViewport {
  x: number
  y: number
  zoom: number
}

export interface ProjectCanvasNode {
  id: string
  type: ProjectCanvasNodeType
  ref?: string
  x: number
  y: number
  width: number
  height: number
  title?: string
  text?: string
  completed?: boolean
  /** Optional Canvas-only parent reference for group/frame membership. */
  parentId?: string
}

export interface ProjectCanvasEdge {
  id: string
  from: string
  to: string
  kind: ProjectCanvasEdgeKind
  note?: string
  routing?: ProjectCanvasEdgeRouting
}

export interface ProjectCanvasSapientiaMetadata {
  schema: string
}

export interface ProjectCanvas {
  version: number
  project: string
  viewport: ProjectCanvasViewport
  nodes: ProjectCanvasNode[]
  edges: ProjectCanvasEdge[]
  sapientia: ProjectCanvasSapientiaMetadata
}

export interface ProjectCanvasPaths {
  projectPath: string
  canvasPath: string
}

export interface ProjectCanvasReadResult {
  projectPath: string
  canvasPath: string
  state: ProjectCanvasState
  canvas: ProjectCanvas | null
}

export interface ProjectCanvasResolvedRef {
  nodeId: string
  nodeType: ProjectCanvasNodeType
  ref?: string
  state: ProjectCanvasRefState
  targetPath?: string
  targetTitle?: string
  message?: string
}

export interface ProjectCanvasRefDiagnostic {
  nodeId: string
  kind: string
  message: string
  ref?: string
}

export interface ProjectCanvasResolveResult {
  projectPath: string
  canvasPath: string
  refs: ProjectCanvasResolvedRef[]
  diagnostics: ProjectCanvasRefDiagnostic[]
}

export function projectOverviewNode(projectPath: string): ProjectCanvasNode {
  return {
    height: PROJECT_OVERVIEW_HEIGHT,
    id: PROJECT_OVERVIEW_NODE_ID,
    ref: projectPath,
    type: 'note',
    width: PROJECT_OVERVIEW_WIDTH,
    x: 0,
    y: 0,
  }
}

function projectNodesWithOverview(nodes: ProjectCanvasNode[], projectPath: string): ProjectCanvasNode[] {
  const overviewIndex = nodes.findIndex(node => node.id === PROJECT_OVERVIEW_NODE_ID)
  if (overviewIndex < 0) return [...nodes, projectOverviewNode(projectPath)]

  return nodes.map((node, index) => index === overviewIndex
    ? {
        ...node,
        completed: undefined,
        ref: projectPath,
        text: undefined,
        type: 'note',
      }
    : node)
}

export function defaultProjectCanvas(projectPath: string): ProjectCanvas {
  return {
    version: 1,
    project: projectPath,
    viewport: { x: 0, y: 0, zoom: 1 },
    nodes: [projectOverviewNode(projectPath)],
    edges: [],
    sapientia: { schema: PROJECT_CANVAS_SCHEMA },
  }
}

function finiteOrDefault(value: number, fallback: number): number {
  return Number.isFinite(value) ? value : fallback
}

export function normalizeProjectCanvas(canvas: ProjectCanvas, projectPath: string): ProjectCanvas {
  return {
    version: 1,
    project: projectPath,
    viewport: {
      x: finiteOrDefault(canvas.viewport.x, 0),
      y: finiteOrDefault(canvas.viewport.y, 0),
      zoom: canvas.viewport.zoom > 0 && Number.isFinite(canvas.viewport.zoom) ? canvas.viewport.zoom : 1,
    },
    nodes: projectNodesWithOverview(canvas.nodes, projectPath)
      .sort((left, right) => left.id.localeCompare(right.id)),
    edges: [...canvas.edges].sort((left, right) => left.id.localeCompare(right.id)),
    sapientia: { schema: PROJECT_CANVAS_SCHEMA },
  }
}

export function validateProjectCanvas(canvas: ProjectCanvas): string[] {
  const errors: string[] = []
  const nodeIds = new Set<string>()
  const edgeIds = new Set<string>()
  for (const node of canvas.nodes) {
    if (!node.id.trim()) errors.push('Project Canvas node id cannot be empty')
    if (nodeIds.has(node.id)) errors.push(`Project Canvas node id is duplicated: ${node.id}`)
    nodeIds.add(node.id)
  }
  for (const edge of canvas.edges) {
    if (!edge.id.trim()) errors.push('Project Canvas edge id cannot be empty')
    if (edgeIds.has(edge.id)) errors.push(`Project Canvas edge id is duplicated: ${edge.id}`)
    edgeIds.add(edge.id)
    if (!nodeIds.has(edge.from)) errors.push(`Project Canvas edge ${edge.id} references missing source node ${edge.from}`)
    if (!nodeIds.has(edge.to)) errors.push(`Project Canvas edge ${edge.id} references missing target node ${edge.to}`)
    if (edge.routing && !PROJECT_CANVAS_EDGE_ROUTINGS.has(edge.routing)) {
      errors.push(`Project Canvas edge ${edge.id} has unsupported routing ${edge.routing}`)
    }
  }
  return errors
}

function invokeProjectCanvasCommand<T>(command: string, args: Record<string, unknown>): Promise<T> {
  return isTauri()
    ? invoke<T>(command, args)
    : mockInvoke<T>(command, args)
}

export function readProjectCanvas(vaultPath: string, projectPath: string): Promise<ProjectCanvasReadResult> {
  return invokeProjectCanvasCommand<ProjectCanvasReadResult>('read_project_canvas', { vaultPath, projectPath })
}

export function saveProjectCanvas(
  vaultPath: string,
  projectPath: string,
  canvas: ProjectCanvas,
): Promise<ProjectCanvasReadResult> {
  return invokeProjectCanvasCommand<ProjectCanvasReadResult>('save_project_canvas', {
    canvas,
    projectPath,
    vaultPath,
  })
}

export function createProjectCanvas(vaultPath: string, projectPath: string): Promise<ProjectCanvasReadResult> {
  return invokeProjectCanvasCommand<ProjectCanvasReadResult>('create_project_canvas', { vaultPath, projectPath })
}

export function resolveProjectCanvasRefs(
  vaultPath: string,
  projectPath: string,
  canvas: ProjectCanvas,
): Promise<ProjectCanvasResolveResult> {
  return invokeProjectCanvasCommand<ProjectCanvasResolveResult>('resolve_project_canvas_refs', {
    canvas,
    projectPath,
    vaultPath,
  })
}

export function loadProjectCanvasPaths(vaultPath: string, projectPath: string): Promise<ProjectCanvasPaths> {
  return invokeProjectCanvasCommand<ProjectCanvasPaths>('project_canvas_paths', { vaultPath, projectPath })
}
