import { useEffect, useState, type RefObject } from 'react'
import type { ProjectCanvas, ProjectCanvasNode } from '../../projectCanvas'

export interface ProjectCanvasViewportSize {
  width: number
  height: number
}

const VIEWPORT_OVERSCAN_PX = 240
const UNMEASURED_VIEWPORT: ProjectCanvasViewportSize = { width: 0, height: 0 }

function nodeIntersectsViewport(
  node: ProjectCanvasNode,
  viewport: ProjectCanvas['viewport'],
  size: ProjectCanvasViewportSize,
): boolean {
  const left = viewport.x + node.x * viewport.zoom
  const top = viewport.y + node.y * viewport.zoom
  const right = left + node.width * viewport.zoom
  const bottom = top + node.height * viewport.zoom
  return right >= -VIEWPORT_OVERSCAN_PX
    && bottom >= -VIEWPORT_OVERSCAN_PX
    && left <= size.width + VIEWPORT_OVERSCAN_PX
    && top <= size.height + VIEWPORT_OVERSCAN_PX
}

export function visibleProjectCanvasNodes(
  nodes: ProjectCanvasNode[],
  viewport: ProjectCanvas['viewport'],
  size: ProjectCanvasViewportSize,
  retainedNodeIds: ReadonlySet<string> = new Set(),
): ProjectCanvasNode[] {
  if (size.width <= 0 || size.height <= 0) return nodes
  return nodes.filter(node => (
    retainedNodeIds.has(node.id) || nodeIntersectsViewport(node, viewport, size)
  ))
}

function elementSize(element: HTMLElement): ProjectCanvasViewportSize {
  const rect = element.getBoundingClientRect()
  return { width: rect.width, height: rect.height }
}

export function useProjectCanvasViewportSize(
  viewportRef: RefObject<HTMLDivElement | null>,
): ProjectCanvasViewportSize {
  const [size, setSize] = useState(UNMEASURED_VIEWPORT)

  useEffect(() => {
    const element = viewportRef.current
    if (!element) return
    const update = () => setSize(elementSize(element))
    update()
    if (typeof ResizeObserver === 'undefined') {
      window.addEventListener('resize', update)
      return () => window.removeEventListener('resize', update)
    }
    const observer = new ResizeObserver(entries => {
      const entry = entries[0]
      if (entry) setSize({ width: entry.contentRect.width, height: entry.contentRect.height })
    })
    observer.observe(element)
    return () => observer.disconnect()
  }, [viewportRef])

  return size
}
