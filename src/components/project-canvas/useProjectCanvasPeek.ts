import { useCallback, useState } from 'react'
import type { ProjectCanvasNode } from '../../projectCanvas'

export function useProjectCanvasPeek() {
  const [peekNode, setPeekNode] = useState<ProjectCanvasNode | null>(null)

  const openPeek = useCallback((node: ProjectCanvasNode) => {
    setPeekNode(node)
  }, [])

  const closePeek = useCallback(() => {
    setPeekNode(null)
  }, [])

  return { closePeek, openPeek, peekNode, setPeekNode }
}
