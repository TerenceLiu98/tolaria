import { describe, expect, it } from 'vitest'
import {
  selectedImageContextFromBlock,
  selectedTextContextFromText,
  selectedTextContextFromSelection,
} from './editorSelectedContext'
import type { VaultEntry } from '../types'

const sourceEntry = {
  path: '/vault/note.md',
  title: 'Image Note',
} as VaultEntry

describe('editor selected context', () => {
  it('creates selected image context from a vault image block', () => {
    const context = selectedImageContextFromBlock({
      block: {
        type: 'image',
        props: {
          url: 'asset://localhost/vault/attachments/diagram.png',
        },
      },
      sourceEntry,
      vaultPath: '/vault',
    })

    expect(context).toEqual({
      kind: 'image',
      entryPath: '/vault/note.md',
      entryTitle: 'Image Note',
      path: 'attachments/diagram.png',
      sourceUrl: 'asset://localhost/vault/attachments/diagram.png',
    })
  })

  it('ignores non-image blocks', () => {
    expect(selectedImageContextFromBlock({
      block: {
        type: 'paragraph',
        props: {
          url: 'asset://localhost/vault/attachments/diagram.png',
        },
      },
      sourceEntry,
      vaultPath: '/vault',
    })).toBeNull()
  })

  it('creates selected text context from trimmed text', () => {
    expect(selectedTextContextFromText({
      sourceEntry,
      text: '  Evidence sentence.  ',
    })).toEqual({
      kind: 'text',
      entryPath: '/vault/note.md',
      entryTitle: 'Image Note',
      text: 'Evidence sentence.',
    })
  })

  it('creates selected text context only when the selection is inside the editor container', () => {
    const container = document.createElement('div')
    const paragraph = document.createElement('p')
    paragraph.textContent = 'Inside selected text'
    container.append(paragraph)
    document.body.append(container)
    const outside = document.createElement('p')
    outside.textContent = 'Outside selected text'
    document.body.append(outside)

    const selection = window.getSelection()
    selection?.removeAllRanges()
    const insideRange = document.createRange()
    insideRange.selectNodeContents(paragraph)
    selection?.addRange(insideRange)

    expect(selectedTextContextFromSelection({
      container,
      selection,
      sourceEntry,
    })).toEqual({
      kind: 'text',
      entryPath: '/vault/note.md',
      entryTitle: 'Image Note',
      text: 'Inside selected text',
    })

    selection?.removeAllRanges()
    const outsideRange = document.createRange()
    outsideRange.selectNodeContents(outside)
    selection?.addRange(outsideRange)
    expect(selectedTextContextFromSelection({
      container,
      selection,
      sourceEntry,
    })).toBeNull()

    selection?.removeAllRanges()
    container.remove()
    outside.remove()
  })
})
