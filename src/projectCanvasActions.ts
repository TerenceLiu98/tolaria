import {
  createProjectCanvas,
  readProjectCanvas,
  saveProjectCanvas,
  type ProjectCanvas,
  type ProjectCanvasNode,
  type ProjectCanvasNodeType,
  type ProjectCanvasReadResult,
} from './projectCanvas'

const DEFAULT_VIEWPORT_WIDTH = 900
const DEFAULT_VIEWPORT_HEIGHT = 460
const DEFAULT_NODE_WIDTH = 240
const DEFAULT_NODE_HEIGHT = 110

export interface ProjectCanvasNodeRequest {
  type: ProjectCanvasNodeType
  ref?: string
  title?: string
  text?: string
  completed?: boolean
}

export interface AddNodeToProjectCanvasRequest {
  vaultPath: string
  projectPath: string
  node: ProjectCanvasNodeRequest
}

export interface AddNodeToProjectCanvasResult {
  canvas: ProjectCanvas
  createdCanvas: boolean
  duplicate: boolean
  node: ProjectCanvasNode
}

export interface ProjectCanvasActionDependencies {
  create: typeof createProjectCanvas
  read: typeof readProjectCanvas
  save: typeof saveProjectCanvas
}

const defaultDependencies: ProjectCanvasActionDependencies = {
  create: createProjectCanvas,
  read: readProjectCanvas,
  save: saveProjectCanvas,
}

function normalizedSlashPath(value: string): string {
  return value.replace(/\\/gu, '/').replace(/\/+$/u, '')
}

export function normalizeProjectCanvasNodeRef(ref: string | undefined, vaultPath: string): string | undefined {
  const trimmed = ref?.trim()
  if (!trimmed) return undefined

  const normalizedRef = normalizedSlashPath(trimmed)
  const normalizedVault = normalizedSlashPath(vaultPath)
  const vaultPrefix = `${normalizedVault}/`
  return normalizedRef.startsWith(vaultPrefix)
    ? normalizedRef.slice(vaultPrefix.length)
    : normalizedRef
}

function nextNodeId(type: ProjectCanvasNodeType, canvas: ProjectCanvas): string {
  const existingIds = new Set(canvas.nodes.map(node => node.id))
  for (let index = 1; index <= canvas.nodes.length + 1; index += 1) {
    const candidate = `${type}_${index}`
    if (!existingIds.has(candidate)) return candidate
  }
  return `${type}_${canvas.nodes.length + 2}`
}

function centeredNode(canvas: ProjectCanvas, request: ProjectCanvasNodeRequest, ref?: string): ProjectCanvasNode {
  const width = DEFAULT_NODE_WIDTH
  const height = DEFAULT_NODE_HEIGHT
  const { viewport } = canvas
  return {
    id: nextNodeId(request.type, canvas),
    type: request.type,
    ref,
    x: (DEFAULT_VIEWPORT_WIDTH / 2 - viewport.x) / viewport.zoom - width / 2,
    y: (DEFAULT_VIEWPORT_HEIGHT / 2 - viewport.y) / viewport.zoom - height / 2,
    width,
    height,
    title: request.title?.trim() || undefined,
    text: request.text?.trim() || undefined,
    completed: request.type === 'task' ? request.completed ?? false : undefined,
  }
}

function canvasFocusedOnNode(canvas: ProjectCanvas, node: ProjectCanvasNode): ProjectCanvas {
  return {
    ...canvas,
    viewport: {
      ...canvas.viewport,
      x: DEFAULT_VIEWPORT_WIDTH / 2 - (node.x + node.width / 2) * canvas.viewport.zoom,
      y: DEFAULT_VIEWPORT_HEIGHT / 2 - (node.y + node.height / 2) * canvas.viewport.zoom,
    },
  }
}

async function availableCanvas(
  request: AddNodeToProjectCanvasRequest,
  dependencies: ProjectCanvasActionDependencies,
): Promise<{ canvas: ProjectCanvas; created: boolean }> {
  const current = await dependencies.read(request.vaultPath, request.projectPath)
  if (current.canvas) return { canvas: current.canvas, created: false }

  const created = await dependencies.create(request.vaultPath, request.projectPath)
  if (!created.canvas) throw new Error(`Project Canvas could not be created for ${request.projectPath}`)
  return { canvas: created.canvas, created: true }
}

export async function addNodeToProjectCanvas(
  request: AddNodeToProjectCanvasRequest,
  dependencies: ProjectCanvasActionDependencies = defaultDependencies,
): Promise<AddNodeToProjectCanvasResult> {
  const available = await availableCanvas(request, dependencies)
  const ref = normalizeProjectCanvasNodeRef(request.node.ref, request.vaultPath)
  const existing = ref
    ? available.canvas.nodes.find(node => normalizeProjectCanvasNodeRef(node.ref, request.vaultPath) === ref)
    : undefined
  const node = existing ?? centeredNode(available.canvas, request.node, ref)
  const nextCanvas = existing
    ? canvasFocusedOnNode(available.canvas, existing)
    : { ...available.canvas, nodes: [...available.canvas.nodes, node] }
  const saved: ProjectCanvasReadResult = await dependencies.save(
    request.vaultPath,
    request.projectPath,
    nextCanvas,
  )

  return {
    canvas: saved.canvas ?? nextCanvas,
    createdCanvas: available.created,
    duplicate: Boolean(existing),
    node,
  }
}
