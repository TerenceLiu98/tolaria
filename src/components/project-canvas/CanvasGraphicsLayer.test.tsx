import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import type { CanvasGraphicsCommandBatch } from '../../canvasGraphicsCommands'
import { CanvasGraphicsLayer } from './CanvasGraphicsLayer'

describe('CanvasGraphicsLayer', () => {
  it('batches visual connectors while retaining zoom-independent hit regions', () => {
    const onSelectEdge = vi.fn()
    const commands: CanvasGraphicsCommandBatch = {
      connectors: [
        { edgeId: 'edge-a', from: { x: 10, y: 20 }, fromAnchorId: 'right', to: { x: 110, y: 120 }, toAnchorId: 'left', selected: false },
        { edgeId: 'edge-b', from: { x: 30, y: 40 }, fromAnchorId: 'right', to: { x: 130, y: 140 }, toAnchorId: 'left', selected: true },
      ],
      preview: { from: { x: 50, y: 60 }, to: { x: 150, y: 160 } },
    }

    const { container } = render(
      <CanvasGraphicsLayer
        bounds={{ minX: 10, minY: 20, width: 500, height: 400 }}
        commands={commands}
        onSelectEdge={onSelectEdge}
      />,
    )

    expect(container.querySelectorAll('path.project-canvas-edge')).toHaveLength(2)
    expect(container.querySelector('.project-canvas-edge:not(.project-canvas-edge--selected)')?.getAttribute('d'))
      .toBe('M 0 0 L 100 100')
    expect(screen.getAllByTestId('project-canvas-edge')).toHaveLength(2)
    expect(container.querySelector('.project-canvas-edge--preview')).not.toBeNull()

    fireEvent.pointerDown(screen.getAllByTestId('project-canvas-edge')[1])
    expect(onSelectEdge).toHaveBeenCalledWith('edge-b')
  })
})
