import type { ProjectCanvasNode } from '../../projectCanvas'
import { visibleProjectCanvasNodes } from './projectCanvasViewport'

function node(id: string, x: number, y: number): ProjectCanvasNode {
  return {
    id,
    type: 'note',
    x,
    y,
    width: 240,
    height: 160,
    title: id,
  }
}

describe('Project Canvas viewport culling', () => {
  const viewport = { x: 20, y: 30, zoom: 1 }

  it('keeps visible and overscan nodes while culling distant nodes', () => {
    const near = node('near', 40, 50)
    const overscan = node('overscan', 820, 100)
    const far = node('far', 2400, 1800)

    expect(visibleProjectCanvasNodes(
      [near, overscan, far],
      viewport,
      { width: 800, height: 600 },
    ).map(item => item.id)).toEqual(['near', 'overscan'])
  })

  it('always keeps active nodes and disables culling before the viewport is measured', () => {
    const near = node('near', 40, 50)
    const far = node('far', 2400, 1800)

    expect(visibleProjectCanvasNodes(
      [near, far],
      viewport,
      { width: 800, height: 600 },
      new Set(['far']),
    ).map(item => item.id)).toEqual(['near', 'far'])
    expect(visibleProjectCanvasNodes(
      [near, far],
      viewport,
      { width: 0, height: 0 },
    )).toEqual([near, far])
  })
})
