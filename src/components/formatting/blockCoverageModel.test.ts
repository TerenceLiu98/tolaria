import { describe, expect, it } from 'vitest'
import {
  BLOCKNOTE_BUILTIN_COVERAGE,
  MARKDOWN_UNSTABLE_SLASH_MENU_KEYS,
} from './blockCoverageModel'
import { FORMATTING_TOOLBAR_FILE_BLOCK_TYPES } from './mediaToolbarModel'
import {
  filterTolariaSlashMenuItems,
  getTolariaBlockTypeSelectItems,
} from '../tolariaEditorFormattingConfig'

describe('blockCoverageModel', () => {
  it('documents every audited BlockNote built-in plus Sapientia custom blocks', () => {
    expect(BLOCKNOTE_BUILTIN_COVERAGE.map((entry) => entry.feature)).toEqual([
      'paragraph',
      'heading',
      'toggle heading',
      'quote',
      'bullet list',
      'numbered list',
      'checklist',
      'toggle list item',
      'code block',
      'table',
      'file',
      'image',
      'video',
      'audio',
      'styled text',
      'link',
      'math',
      'mermaid',
      'whiteboard',
    ])
  })

  it('keeps toolbar block types aligned with the audited supported block coverage', () => {
    const coveredToolbarTypes = new Set(
      BLOCKNOTE_BUILTIN_COVERAGE.flatMap((entry) => entry.toolbarTypes),
    )
    const toolbarTypes = new Set(getTolariaBlockTypeSelectItems().map((item) => item.type))

    expect(toolbarTypes).toEqual(coveredToolbarTypes)
  })

  it('keeps filtered slash-menu keys aligned with explicitly unsupported toggle coverage', () => {
    const filteredKeys = BLOCKNOTE_BUILTIN_COVERAGE
      .flatMap((entry) => entry.filteredSlashKeys ?? [])

    expect(new Set(filteredKeys)).toEqual(MARKDOWN_UNSTABLE_SLASH_MENU_KEYS)

    const filteredItems = filterTolariaSlashMenuItems(
      filteredKeys.map((key) => ({
        key,
        onItemClick: () => undefined,
        title: key,
      })),
    )
    expect(filteredItems).toEqual([])
  })

  it('keeps media slash commands aligned with selected file block handling', () => {
    const mediaCoverage = BLOCKNOTE_BUILTIN_COVERAGE.filter((entry) => (
      ['audio', 'file', 'image', 'video'].includes(entry.feature)
    ))

    expect(new Set(mediaCoverage.map((entry) => entry.slashKeys[0]))).toEqual(new Set([
      'audio',
      'file',
      'image',
      'video',
    ]))
    expect(FORMATTING_TOOLBAR_FILE_BLOCK_TYPES).toEqual(new Set([
      'audio',
      'file',
      'image',
      'video',
    ]))
  })
})
