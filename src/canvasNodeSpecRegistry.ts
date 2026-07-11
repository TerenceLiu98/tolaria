import type { ProjectCanvasNode, ProjectCanvasNodeType } from './projectCanvas'
import type { TranslationKey } from './lib/i18n'

export type CanvasNodePresentation = 'overview' | 'preview' | 'card' | 'edit'
export type CanvasNodeSpecKey = ProjectCanvasNodeType | 'overview'
export type CanvasNodeRenderer = 'overview' | 'document' | 'paper_block' | 'image' | 'text' | 'task' | 'group'
export type CanvasNodeToolbarAction = 'open' | 'connect' | 'resize' | 'toggle-complete' | 'pin' | 'delete'

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

export interface CanvasNodeSpec {
  readonly key: CanvasNodeSpecKey
  readonly type: ProjectCanvasNodeType
  readonly renderer: CanvasNodeRenderer
  readonly kindKey: TranslationKey
  readonly canEdit: boolean
  readonly canNavigate: boolean
  readonly geometry: CanvasNodeGeometry
  readonly editorGeometry?: CanvasNodeGeometry
  readonly supportsChildren: boolean
  readonly canResize: boolean
  readonly acceptsDrop: boolean
  readonly inspectorFields: readonly ('title' | 'reference' | 'text' | 'completed' | 'edge')[]
  readonly toolbarActions: readonly CanvasNodeToolbarAction[]
  readonly preview: (node: ProjectCanvasNode, presentation: CanvasNodePresentation) => { title: string; text?: string }
  readonly staleLabel: (node: ProjectCanvasNode) => string
  readonly clipboard: (node: ProjectCanvasNode) => ProjectCanvasNode
  readonly resolveDrop: (value: string) => CanvasNodeDropResult | null
}

const DEFAULT_GEOMETRY: CanvasNodeGeometry = { width: 260, height: 150, minWidth: 180, minHeight: 110 }

function defaultPreview(node: ProjectCanvasNode): { title: string; text?: string } {
  return { title: node.title ?? node.ref ?? 'Untitled node', text: node.text }
}

function copyNode(node: ProjectCanvasNode): ProjectCanvasNode {
  return { ...node }
}

function titleFromDropValue(value: string): string {
  return value.trim().replace(/\\/g, '/').split('/').filter(Boolean).at(-1) ?? value.trim()
}

function resolveDropFor(type: ProjectCanvasNodeType, value: string): CanvasNodeDropResult | null {
  const trimmed = value.trim()
  if (!trimmed) return null
  if (type === 'paper_block') return /^@block\[[^\]#]+#[^\]]+\]$/u.test(trimmed) ? { ref: trimmed } : null
  if (type === 'image') return /\.(avif|gif|jpe?g|png|svg|webp)(?:[?#].*)?$/iu.test(trimmed)
    ? { ref: trimmed, title: titleFromDropValue(trimmed) }
    : null
  if (type === 'text' || type === 'task' || type === 'group') return { text: trimmed }
  return null
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
    const types: ProjectCanvasNodeType[] = ['note', 'paper', 'paper_block', 'image', 'text', 'task', 'group']
    const makeSpec = (type: ProjectCanvasNodeType, key: CanvasNodeSpecKey = type): CanvasNodeSpec => ({
      key,
      type,
      renderer: type === 'note' || type === 'paper'
          ? 'document'
          : type,
      kindKey: `projectCanvas.node.${type}` as TranslationKey,
      canEdit: type === 'note' || type === 'paper' || type === 'text' || type === 'task' || type === 'group',
      canNavigate: type === 'note' || type === 'paper',
      geometry: type === 'group'
        ? { width: 320, height: 190, minWidth: 240, minHeight: 140 }
        : type === 'image'
          ? { width: 300, height: 210, minWidth: 220, minHeight: 150 }
          : type === 'paper_block'
            ? { width: 260, height: 160, minWidth: 180, minHeight: 110 }
            : { ...DEFAULT_GEOMETRY },
      editorGeometry: type === 'note' || type === 'paper'
        ? { width: 560, height: 420, minWidth: 560, minHeight: 420 }
        : undefined,
      supportsChildren: type === 'group',
      canResize: true,
      acceptsDrop: type === 'group' || type === 'image' || type === 'paper_block',
      inspectorFields: type === 'image' || type === 'paper_block'
        ? ['title', 'reference']
        : type === 'task'
          ? ['title', 'text', 'completed']
          : type === 'group'
            ? ['title']
            : ['title', 'reference', 'text'],
      preview: defaultPreview,
      staleLabel: node => `Stale ${node.type} reference`,
      clipboard: copyNode,
      toolbarActions: type === 'task'
        ? ['connect', 'resize', 'toggle-complete', 'delete']
        : type === 'note' || type === 'paper'
          ? ['open', 'connect', 'resize', 'pin', 'delete']
          : ['connect', 'resize', 'delete'],
      resolveDrop: value => resolveDropFor(type, value),
    })
    return [makeSpec('note', 'overview'), ...types.filter(type => type !== 'note').map(type => makeSpec(type)), makeSpec('note')]
  }
}
