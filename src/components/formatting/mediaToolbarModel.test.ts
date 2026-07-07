import { describe, expect, it } from 'vitest'
import {
  mediaCaptionPatch,
  mediaReplacementPatch,
  mediaReplacementRequest,
  selectedFileBlockFromBlocks,
} from './mediaToolbarModel'

describe('mediaToolbarModel', () => {
  it('resolves the selected file block and portable display path', () => {
    expect(selectedFileBlockFromBlocks([], '/vault')).toBeNull()
    expect(selectedFileBlockFromBlocks([
      { id: 'one', props: { url: 'a.png' }, type: 'image' },
      { id: 'two', props: { url: 'b.png' }, type: 'image' },
    ], '/vault')).toBeNull()
    expect(selectedFileBlockFromBlocks([
      { id: 'paragraph', props: { url: 'a.png' }, type: 'paragraph' },
    ], '/vault')).toBeNull()
    expect(selectedFileBlockFromBlocks([
      { id: 'empty-url', props: { url: '   ' }, type: 'image' },
    ], '/vault')).toBeNull()

    expect(selectedFileBlockFromBlocks([
      {
        id: 'image-block',
        props: {
          caption: 'Architecture',
          url: 'asset://localhost/%2Fvault%2Fattachments%2Fdiagram.png',
        },
        type: 'image',
      },
    ], '/vault')).toEqual({
      caption: 'Architecture',
      displayPath: 'attachments/diagram.png',
      id: 'image-block',
      type: 'image',
      url: 'asset://localhost/%2Fvault%2Fattachments%2Fdiagram.png',
    })
  })

  it('builds durable media caption and replacement operations', () => {
    const selectedFileBlock = {
      caption: 'Old caption',
      displayPath: 'attachments/old.png',
      id: 'image-block',
      type: 'image',
      url: 'asset://localhost/old.png',
    }

    expect(mediaCaptionPatch('  New caption  ')).toEqual({
      props: { caption: 'New caption' },
    })
    expect(mediaReplacementRequest(selectedFileBlock)).toEqual({
      blockId: 'image-block',
      caption: 'Old caption',
      displayPath: 'attachments/old.png',
      type: 'image',
      url: 'asset://localhost/old.png',
    })
    expect(mediaReplacementPatch({
      name: 'new.png',
      url: 'asset://localhost/new.png',
    })).toEqual({
      props: {
        name: 'new.png',
        url: 'asset://localhost/new.png',
      },
    })
    expect(mediaReplacementPatch({ url: 'asset://localhost/new.png' })).toEqual({
      props: { url: 'asset://localhost/new.png' },
    })
  })
})
