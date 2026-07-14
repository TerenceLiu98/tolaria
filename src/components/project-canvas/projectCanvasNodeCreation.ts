import type { ProjectCanvas, ProjectCanvasEdgeKind, ProjectCanvasNode, ProjectCanvasNodeType } from '../../projectCanvas'
import type { ProjectCanvasController } from '../../projectCanvasController'

interface EmbeddedNodeCreationInput {
  readonly controller: ProjectCanvasController
  readonly current: ProjectCanvas | null
  readonly edgeKind: ProjectCanvasEdgeKind
  readonly linkFromSelected: boolean
  readonly nodeType: ProjectCanvasNodeType
  readonly onCreated: (result: EmbeddedNodeCreationResult) => void
  readonly onLinked: () => void
  readonly selectedNodeId: string | null
  readonly value: string
}

export interface EmbeddedNodeCreationResult {
  readonly canvas: ProjectCanvas
  readonly linked: boolean
  readonly node: ProjectCanvasNode
}

export function createEmbeddedCanvasNode(input: EmbeddedNodeCreationInput): void {
  if (!input.current) return
  const linked = Boolean(input.selectedNodeId && input.linkFromSelected)
  const existingIds = new Set(input.current.nodes.map(node => node.id))
  const canvas = input.controller.createNodeFromInput(input.nodeType, input.value, {
    linkFromNodeId: linked ? input.selectedNodeId : null,
    linkKind: input.edgeKind,
  })
  const node = canvas?.nodes.find(candidate => !existingIds.has(candidate.id))
  if (!canvas || !node) return
  if (linked) input.onLinked()
  input.onCreated({ canvas, linked, node })
}
