import { useEffect, useState, type RefObject } from 'react'
import type { ProjectCanvas, ProjectCanvasNode } from '../../projectCanvas'

export interface ProjectCanvasViewportSize {
  width: number
  height: number
  left?: number
  top?: number
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
  return { width: rect.width, height: rect.height, left: rect.left, top: rect.top }
}

export function useProjectCanvasViewportSize(
  viewportRef: RefObject<HTMLDivElement | null>,
  active = true,
): ProjectCanvasViewportSize {
  const [size, setSize] = useState(UNMEASURED_VIEWPORT)

  useEffect(() => {
    if (!active) return
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
      if (entry) setSize(elementSize(element))
    })
    observer.observe(element)
    return () => observer.disconnect()
  }, [active, viewportRef])

  return size
}
