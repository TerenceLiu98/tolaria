import { describe, expect, it } from 'vitest'
import { selectedImageContextFromBlock } from './editorSelectedContext'
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
})
