import { Fragment, type ReactNode } from 'react'
import type { ProjectCanvasNode } from '../../projectCanvas'

interface CanvasDocumentLayerProps {
  nodes: readonly ProjectCanvasNode[]
  renderNode: (node: ProjectCanvasNode) => ReactNode
}

/** DOM document layer. Heavy document content is retained only for visible/active nodes. */
export function CanvasDocumentLayer({ nodes, renderNode }: CanvasDocumentLayerProps) {
  return <>{nodes.map(node => <Fragment key={node.id}>{renderNode(node)}</Fragment>)}</>
}
