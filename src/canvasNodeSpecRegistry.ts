import type { ProjectCanvasNode, ProjectCanvasNodeType } from './projectCanvas'
import type { TranslationKey } from './lib/i18n'

export type CanvasNodePresentation = 'overview' | 'preview' | 'card' | 'edit'
export type CanvasNodeSpecKey = ProjectCanvasNodeType | 'overview'
export type CanvasNodeRenderer = 'overview' | 'document' | 'paper_block' | 'image' | 'text' | 'task' | 'group'
export type CanvasNodeToolbarAction = 'open' | 'enter-group' | 'connect' | 'resize' | 'toggle-complete' | 'pin' | 'delete'

export interface CanvasNodeRendererAdapter {
  readonly key: CanvasNodeRenderer
  readonly isDocument: boolean
  readonly showsReferenceFooter: boolean
}

export interface CanvasNodeDropResult {
  readonly ref?: string
  readonly title?: string
  readonly text?: string
}

export interface CanvasNodeGeometry {
  width: number
  height: number
  minWidth: number
  minHeight: number
}

export type CanvasConnectionSide = 'top' | 'right' | 'bottom' | 'left'

export interface CanvasConnectionAnchor {
  readonly id: CanvasConnectionSide
  readonly side: CanvasConnectionSide
  readonly point: { readonly x: number; readonly y: number }
}

export interface CanvasNodeSpec {
  readonly key: CanvasNodeSpecKey
  readonly type: ProjectCanvasNodeType
  readonly rendererAdapter: CanvasNodeRendererAdapter
  readonly kindKey: TranslationKey
  readonly canEdit: boolean
  readonly canNavigate: boolean
  readonly geometry: CanvasNodeGeometry
  readonly editorGeometry?: CanvasNodeGeometry
  readonly supportsChildren: boolean
  readonly canResize: boolean
  readonly acceptsDrop: boolean
  readonly referenceMode: 'none' | 'readonly' | 'editable'
  readonly inspectorFields: readonly ('title' | 'reference' | 'text' | 'completed' | 'edge')[]
  readonly toolbarActions: readonly CanvasNodeToolbarAction[]
  readonly connectionAnchors: (node: ProjectCanvasNode) => readonly CanvasConnectionAnchor[]
  readonly preview: (node: ProjectCanvasNode, presentation: CanvasNodePresentation) => { title: string; text?: string }
  readonly staleLabel: (node: ProjectCanvasNode) => string
  readonly clipboard: (node: ProjectCanvasNode) => ProjectCanvasNode
  readonly resolveDrop: (value: string) => CanvasNodeDropResult | null
}

const DEFAULT_GEOMETRY: CanvasNodeGeometry = { width: 260, height: 150, minWidth: 180, minHeight: 110 }

const RENDERER_ADAPTERS: Readonly<Record<CanvasNodeRenderer, CanvasNodeRendererAdapter>> = {
  overview: { key: 'overview', isDocument: true, showsReferenceFooter: true },
  document: { key: 'document', isDocument: true, showsReferenceFooter: true },
  paper_block: { key: 'paper_block', isDocument: false, showsReferenceFooter: true },
  image: { key: 'image', isDocument: false, showsReferenceFooter: true },
  text: { key: 'text', isDocument: false, showsReferenceFooter: false },
  task: { key: 'task', isDocument: false, showsReferenceFooter: false },
  group: { key: 'group', isDocument: false, showsReferenceFooter: false },
}

function defaultPreview(node: ProjectCanvasNode): { title: string; text?: string } {
  return { title: node.title ?? node.ref ?? 'Untitled node', text: node.text }
}

function copyNode(node: ProjectCanvasNode): ProjectCanvasNode {
  return { ...node }
}

function titleFromDropValue(value: string): string {
  return value.trim().replace(/\\/g, '/').split('/').filter(Boolean).at(-1) ?? value.trim()
}

function resolveCitationDrop(value: string): CanvasNodeDropResult | null {
  const trimmed = value.trim()
  return /^@block\[[^\]#]+#[^\]]+\]$/u.test(trimmed) ? { ref: trimmed } : null
}

function resolveImageDrop(value: string): CanvasNodeDropResult | null {
  const trimmed = value.trim()
  return /\.(avif|gif|jpe?g|png|svg|webp)(?:[?#].*)?$/iu.test(trimmed)
    ? { ref: trimmed, title: titleFromDropValue(trimmed) }
    : null
}

function resolveTextDrop(value: string): CanvasNodeDropResult | null {
  const trimmed = value.trim()
  return trimmed ? { text: trimmed } : null
}

function rejectDrop(): null {
  return null
}

export function cardinalConnectionAnchors(node: ProjectCanvasNode): readonly CanvasConnectionAnchor[] {
  const centerX = node.x + node.width / 2
  const centerY = node.y + node.height / 2
  return [
    { id: 'top', side: 'top', point: { x: centerX, y: node.y } },
    { id: 'right', side: 'right', point: { x: node.x + node.width, y: centerY } },
    { id: 'bottom', side: 'bottom', point: { x: centerX, y: node.y + node.height } },
    { id: 'left', side: 'left', point: { x: node.x, y: centerY } },
  ]
}

type CanvasNodeSpecDefinition = Omit<CanvasNodeSpec, 'clipboard' | 'connectionAnchors' | 'preview' | 'staleLabel'>
  & Partial<Pick<CanvasNodeSpec, 'connectionAnchors'>>

function defineSpec(definition: CanvasNodeSpecDefinition): CanvasNodeSpec {
  return {
    ...definition,
    clipboard: copyNode,
    connectionAnchors: definition.connectionAnchors ?? cardinalConnectionAnchors,
    preview: defaultPreview,
    staleLabel: node => `Stale ${node.type} reference`,
  }
}

export class CanvasNodeSpecRegistry {
  private readonly specs = new Map<CanvasNodeSpecKey, CanvasNodeSpec>()

  constructor(specs: readonly CanvasNodeSpec[] = CanvasNodeSpecRegistry.defaults()) {
    for (const spec of specs) this.register(spec)
  }

  register(spec: CanvasNodeSpec): void {
    this.specs.set(spec.key, spec)
  }

  get(type: ProjectCanvasNodeType): CanvasNodeSpec {
    return this.specs.get(type) ?? this.specs.get('text') ?? CanvasNodeSpecRegistry.defaults().find(spec => spec.type === 'text')!
  }

  getForNode(node: ProjectCanvasNode): CanvasNodeSpec {
    if (node.id === 'project_overview') return this.specs.get('overview') ?? this.get('note')
    return this.get(node.type)
  }

  has(type: ProjectCanvasNodeType): boolean {
    return this.specs.has(type)
  }

  static defaults(): CanvasNodeSpec[] {
    const documentGeometry = { width: 560, height: 420, minWidth: 560, minHeight: 420 }
    return [
      defineSpec({
        acceptsDrop: false, canEdit: true, canNavigate: true, canResize: true,
        editorGeometry: documentGeometry, geometry: { ...DEFAULT_GEOMETRY },
        inspectorFields: ['title', 'reference', 'text'], key: 'overview', kindKey: 'projectCanvas.node.note',
        referenceMode: 'readonly', rendererAdapter: RENDERER_ADAPTERS.overview, resolveDrop: rejectDrop,
        supportsChildren: false, toolbarActions: ['open', 'connect', 'resize'], type: 'note',
      }),
      defineSpec({
        acceptsDrop: false, canEdit: true, canNavigate: true, canResize: true,
        editorGeometry: documentGeometry, geometry: { ...DEFAULT_GEOMETRY },
        inspectorFields: ['title', 'reference', 'text'], key: 'note', kindKey: 'projectCanvas.node.note',
        referenceMode: 'readonly', rendererAdapter: RENDERER_ADAPTERS.document, resolveDrop: rejectDrop,
        supportsChildren: false, toolbarActions: ['open', 'connect', 'resize', 'pin', 'delete'], type: 'note',
      }),
      defineSpec({
        acceptsDrop: false, canEdit: true, canNavigate: true, canResize: true,
        editorGeometry: documentGeometry, geometry: { ...DEFAULT_GEOMETRY },
        inspectorFields: ['title', 'reference', 'text'], key: 'paper', kindKey: 'projectCanvas.node.paper',
        referenceMode: 'readonly', rendererAdapter: RENDERER_ADAPTERS.document, resolveDrop: rejectDrop,
        supportsChildren: false, toolbarActions: ['open', 'connect', 'resize', 'pin', 'delete'], type: 'paper',
      }),
      defineSpec({
        acceptsDrop: true, canEdit: false, canNavigate: false, canResize: true,
        geometry: { width: 260, height: 160, minWidth: 180, minHeight: 110 },
        inspectorFields: ['title', 'reference'], key: 'paper_block', kindKey: 'projectCanvas.node.paper_block',
        referenceMode: 'readonly', rendererAdapter: RENDERER_ADAPTERS.paper_block, resolveDrop: resolveCitationDrop,
        supportsChildren: false, toolbarActions: ['connect', 'resize', 'delete'], type: 'paper_block',
      }),
      defineSpec({
        acceptsDrop: true, canEdit: false, canNavigate: false, canResize: true,
        geometry: { width: 300, height: 210, minWidth: 220, minHeight: 150 },
        inspectorFields: ['title', 'reference'], key: 'image', kindKey: 'projectCanvas.node.image',
        referenceMode: 'editable', rendererAdapter: RENDERER_ADAPTERS.image, resolveDrop: resolveImageDrop,
        supportsChildren: false, toolbarActions: ['connect', 'resize', 'delete'], type: 'image',
      }),
      defineSpec({
        acceptsDrop: false, canEdit: true, canNavigate: false, canResize: true,
        geometry: { ...DEFAULT_GEOMETRY }, inspectorFields: ['title', 'text'], key: 'text',
        kindKey: 'projectCanvas.node.text', referenceMode: 'none', rendererAdapter: RENDERER_ADAPTERS.text,
        resolveDrop: resolveTextDrop, supportsChildren: false,
        toolbarActions: ['connect', 'resize', 'delete'], type: 'text',
      }),
      defineSpec({
        acceptsDrop: false, canEdit: true, canNavigate: false, canResize: true,
        geometry: { ...DEFAULT_GEOMETRY }, inspectorFields: ['title', 'text', 'completed'], key: 'task',
        kindKey: 'projectCanvas.node.task', referenceMode: 'none', rendererAdapter: RENDERER_ADAPTERS.task,
        resolveDrop: resolveTextDrop, supportsChildren: false,
        toolbarActions: ['connect', 'resize', 'toggle-complete', 'delete'], type: 'task',
      }),
      defineSpec({
        acceptsDrop: true, canEdit: true, canNavigate: false, canResize: true,
        geometry: { width: 320, height: 190, minWidth: 240, minHeight: 140 },
        inspectorFields: ['title'], key: 'group', kindKey: 'projectCanvas.node.group',
        referenceMode: 'none', rendererAdapter: RENDERER_ADAPTERS.group, resolveDrop: resolveTextDrop,
        supportsChildren: true, toolbarActions: ['enter-group', 'connect', 'resize', 'delete'], type: 'group',
      }),
    ]
  }
}
