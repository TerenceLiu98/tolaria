import { describe, expect, it, vi } from 'vitest'
import {
  captureEditorScrollForControl,
  editorElementFromControl,
  scheduleEditorScrollRestore,
} from './editorScrollPreservation'

function makeVisible(element: HTMLElement) {
  element.getBoundingClientRect = () => ({
    bottom: 100,
    height: 100,
    left: 0,
    right: 100,
    top: 0,
    width: 100,
    x: 0,
    y: 0,
    toJSON: () => ({}),
  })
}

describe('editorScrollPreservation', () => {
  it('captures the editor scroll area from a side-menu control', () => {
    const scrollArea = document.createElement('div')
    scrollArea.className = 'editor-scroll-area'
    scrollArea.scrollTop = 220
    scrollArea.scrollLeft = 12
    const container = document.createElement('div')
    container.className = 'editor__blocknote-container'
    const editor = document.createElement('div')
    editor.className = 'bn-editor'
    const control = document.createElement('button')
    makeVisible(scrollArea)
    makeVisible(editor)

    container.appendChild(editor)
    scrollArea.appendChild(container)
    editor.appendChild(control)
    document.body.appendChild(scrollArea)

    try {
      expect(editorElementFromControl(control)).toBe(editor)
      expect(captureEditorScrollForControl(control)).toEqual({
        scrollArea,
        scrollLeft: 12,
        scrollTop: 220,
      })
    } finally {
      scrollArea.remove()
    }
  })

  it('restores captured scroll across synchronous, microtask, timeout, and animation frame churn', async () => {
    vi.useFakeTimers()
    const scrollArea = document.createElement('div')
    scrollArea.className = 'editor-scroll-area'
    scrollArea.scrollTop = 480
    scrollArea.scrollLeft = 20
    document.body.appendChild(scrollArea)

    try {
      scheduleEditorScrollRestore({
        scrollArea,
        scrollLeft: 20,
        scrollTop: 480,
      })
      scrollArea.scrollTop = 100
      scrollArea.scrollLeft = 4
      await Promise.resolve()
      expect(scrollArea.scrollTop).toBe(480)
      expect(scrollArea.scrollLeft).toBe(20)

      scrollArea.scrollTop = 140
      scrollArea.scrollLeft = 8
      await vi.runAllTimersAsync()
      expect(scrollArea.scrollTop).toBe(480)
      expect(scrollArea.scrollLeft).toBe(20)
    } finally {
      scrollArea.remove()
      vi.useRealTimers()
    }
  })
})
