import { Children, isValidElement, type ReactElement } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { getFormattingToolbarItems } from '@blocknote/react'

vi.mock('../lib/telemetry', () => ({
  trackEvent: vi.fn(),
}))

import {
  addItemsToMediaGroup,
  createHtmlBlockSlashMenuItem,
  createMermaidSlashCommandDiagram,
  createMathSlashMenuItem,
  filterTolariaFormattingToolbarItems,
  filterTolariaSlashMenuItems,
  getTolariaBlockTypeSelectItems,
  MATH_SLASH_COMMAND_LATEX,
  MERMAID_SLASH_COMMAND_DIAGRAM,
} from './tolariaEditorFormattingConfig'
import { trackEvent } from '../lib/telemetry'
import { HTML_BLOCK_DEFAULT_HEIGHT, HTML_BLOCK_TYPE } from '../utils/htmlBlockMarkdown'
import { MATH_BLOCK_TYPE } from '../utils/mathMarkdown'
import { mermaidFenceSource } from '../utils/mermaidMarkdown'

describe('tolariaEditorFormatting', () => {
  it('keeps the markdown-safe toolbar controls and block type select', () => {
    const itemKeys = filterTolariaFormattingToolbarItems(
      getFormattingToolbarItems(getTolariaBlockTypeSelectItems()),
    ).map((item) => String(item.key))

    expect(itemKeys).toContain('blockTypeSelect')
    expect(itemKeys).toContain('boldStyleButton')
    expect(itemKeys).toContain('italicStyleButton')
    expect(itemKeys).toContain('strikeStyleButton')
    expect(itemKeys).toContain('createLinkButton')
    expect(itemKeys).toContain('nestBlockButton')
    expect(itemKeys).toContain('unnestBlockButton')

    expect(itemKeys).not.toContain('underlineStyleButton')
    expect(itemKeys).not.toContain('colorStyleButton')
    expect(itemKeys).not.toContain('textAlignLeftButton')
    expect(itemKeys).not.toContain('textAlignCenterButton')
    expect(itemKeys).not.toContain('textAlignRightButton')
  })

  it('returns the audited markdown-safe block types for the toolbar select', () => {
    expect(getTolariaBlockTypeSelectItems()).toEqual([
      expect.objectContaining({ labelKey: 'editor.blockType.paragraph', type: 'paragraph' }),
      expect.objectContaining({ labelKey: 'editor.blockType.heading1', type: 'heading', props: { level: 1 } }),
      expect.objectContaining({ labelKey: 'editor.blockType.heading2', type: 'heading', props: { level: 2 } }),
      expect.objectContaining({ labelKey: 'editor.blockType.heading3', type: 'heading', props: { level: 3 } }),
      expect.objectContaining({ labelKey: 'editor.blockType.heading4', type: 'heading', props: { level: 4 } }),
      expect.objectContaining({ labelKey: 'editor.blockType.heading5', type: 'heading', props: { level: 5 } }),
      expect.objectContaining({ labelKey: 'editor.blockType.heading6', type: 'heading', props: { level: 6 } }),
      expect.objectContaining({ labelKey: 'editor.blockType.quote', type: 'quote' }),
      expect.objectContaining({ labelKey: 'editor.blockType.bulletList', type: 'bulletListItem' }),
      expect.objectContaining({ labelKey: 'editor.blockType.numberedList', type: 'numberedListItem' }),
      expect.objectContaining({ labelKey: 'editor.blockType.checklist', type: 'checkListItem' }),
      expect.objectContaining({ labelKey: 'editor.blockType.codeBlock', type: 'codeBlock' }),
    ])
  })

  it('filters markdown-unstable slash-menu variants and removes command descriptions', () => {
    type TolariaSlashMenuTestItem = {
      key: string
      title: string
      onItemClick: () => void
      subtext?: string
      icon?: ReactElement
    }

    const items = filterTolariaSlashMenuItems([
      { key: 'toggle_heading', title: 'Toggle heading', onItemClick: () => {} },
      { key: 'toggle_list', title: 'Toggle list', onItemClick: () => {} },
      { key: 'heading', title: 'Heading', subtext: 'Default heading copy', onItemClick: () => {} },
      { key: 'heading_4', title: 'Heading 4', onItemClick: () => {} },
      { key: 'bullet_list', title: 'Bullet List', subtext: 'Default list copy', onItemClick: () => {} },
      { key: 'code_block', title: 'Code Block', subtext: 'Default code copy', onItemClick: () => {} },
      { key: 'heading_5', title: 'Heading 5', onItemClick: () => {} },
      { key: 'heading_6', title: 'Heading 6', onItemClick: () => {} },
    ] satisfies TolariaSlashMenuTestItem[])

    expect(items.map((item) => item.key)).toEqual([
      'heading',
      'heading_4',
      'bullet_list',
      'code_block',
    ])
    expect(items.map((item) => item.subtext)).toEqual([
      undefined,
      undefined,
      undefined,
      undefined,
    ])
  })

  it('wraps slash-menu icons so hover can swap Phosphor weights', () => {
    type TolariaSlashMenuTestItem = {
      key: string
      title: string
      onItemClick: () => void
      icon?: ReactElement
    }

    const items = filterTolariaSlashMenuItems([
      { key: 'heading', title: 'Heading', onItemClick: () => {} },
    ] satisfies TolariaSlashMenuTestItem[])
    const icon = items[0]?.icon

    expect(isValidElement(icon)).toBe(true)
    if (!isValidElement<{ className?: string; children?: ReactElement[] }>(icon)) return

    const iconChildren = Children.toArray(icon.props.children) as Array<
      ReactElement<{ className?: string; weight?: string }>
    >
    expect(icon.props.className).toBe('tolaria-slash-menu-icon')
    expect(iconChildren.map((child) => child.props.className)).toEqual([
      'tolaria-slash-menu-icon__regular',
      'tolaria-slash-menu-icon__fill',
    ])
    expect(iconChildren.map((child) => child.props.weight)).toEqual([
      'regular',
      'fill',
    ])
  })

  it('keeps custom media slash-menu commands searchable', () => {
    type TolariaSlashMenuTestItem = {
      key: string
      title: string
      aliases?: string[]
      onItemClick: () => void
    }

    const items = filterTolariaSlashMenuItems([
      {
        key: 'html',
        title: 'HTML',
        aliases: ['html', 'iframe', 'embed', 'sandbox'],
        onItemClick: () => {},
      },
      {
        key: 'mermaid',
        title: 'Mermaid',
        aliases: ['diagram', 'flowchart', 'graph', 'chart'],
        onItemClick: () => {},
      },
      {
        key: 'math',
        title: 'Math',
        aliases: ['equation', 'latex', 'formula', 'sqrt'],
        onItemClick: () => {},
      },
      {
        key: 'whiteboard',
        title: 'Whiteboard',
        aliases: ['tldraw', 'drawing', 'canvas', 'sketch'],
        onItemClick: () => {},
      },
    ] satisfies TolariaSlashMenuTestItem[])

    expect(items[0]).toEqual(expect.objectContaining({
      key: 'html',
      title: 'HTML',
      aliases: ['html', 'iframe', 'embed', 'sandbox'],
    }))
    expect(items[1]).toEqual(expect.objectContaining({
      key: 'mermaid',
      title: 'Mermaid',
      aliases: ['diagram', 'flowchart', 'graph', 'chart'],
    }))
    expect(items[2]).toEqual(expect.objectContaining({
      key: 'math',
      title: 'Math',
      aliases: ['equation', 'latex', 'formula', 'sqrt'],
    }))
    expect(items[3]).toEqual(expect.objectContaining({
      key: 'whiteboard',
      title: 'Whiteboard',
      aliases: ['tldraw', 'drawing', 'canvas', 'sketch'],
    }))
    expect(items.map((item) => isValidElement(item.icon))).toEqual([true, true, true, true])
  })

  it('uses a valid placeholder diagram for new Mermaid blocks', () => {
    expect(MERMAID_SLASH_COMMAND_DIAGRAM).toBe([
      'flowchart TD',
      '    edit["Switch to the raw editor to edit"]',
    ].join('\n'))
    expect(mermaidFenceSource({ diagram: MERMAID_SLASH_COMMAND_DIAGRAM })).toBe([
      '```mermaid',
      'flowchart TD',
      '    edit["Switch to the raw editor to edit"]',
      '```',
    ].join('\n'))
  })

  it('escapes localized Mermaid placeholder labels', () => {
    expect(createMermaidSlashCommandDiagram('Edit "raw" \\ source')).toBe([
      'flowchart TD',
      '    edit["Edit \\"raw\\" \\\\ source"]',
    ].join('\n'))
  })

  it('places custom media commands before the existing non-media slash-menu group', () => {
    type TolariaSlashMenuTestItem = {
      key: string
      title: string
      group: string
      onItemClick: () => void
    }

    const items = addItemsToMediaGroup([
      { key: 'image', title: 'Image', group: 'Media', onItemClick: () => {} },
      { key: 'file', title: 'File', group: 'Media', onItemClick: () => {} },
      { key: 'emoji', title: 'Emoji', group: 'Others', onItemClick: () => {} },
    ] satisfies TolariaSlashMenuTestItem[], [
      {
        key: 'html',
        title: 'HTML',
        group: 'Media',
        onItemClick: () => {},
      },
      {
        key: 'mermaid',
        title: 'Mermaid',
        group: 'Media',
        onItemClick: () => {},
      },
      {
        key: 'math',
        title: 'Math',
        group: 'Media',
        onItemClick: () => {},
      },
      {
        key: 'whiteboard',
        title: 'Whiteboard',
        group: 'Media',
        onItemClick: () => {},
      },
    ])

    expect(items.map(item => item.key)).toEqual([
      'image',
      'file',
      'html',
      'mermaid',
      'math',
      'whiteboard',
      'emoji',
    ])
  })

  it('creates an HTML slash command with a sandboxed block placeholder', () => {
    const block = { id: 'active-block' }
    const editor = {
      getTextCursorPosition: () => ({ block }),
      replaceBlocks: () => {},
    }
    const replaceBlocks = vi.spyOn(editor, 'replaceBlocks')

    const htmlItem = createHtmlBlockSlashMenuItem(editor as never)

    expect(htmlItem).toEqual(expect.objectContaining({
      key: 'html',
      title: 'HTML',
      aliases: ['html', 'iframe', 'embed', 'sandbox'],
    }))

    htmlItem?.onItemClick()

    expect(replaceBlocks).toHaveBeenCalledWith([block], [{
      type: HTML_BLOCK_TYPE,
      props: {
        height: HTML_BLOCK_DEFAULT_HEIGHT,
        html: '<div></div>',
      },
    }])
    expect(trackEvent).toHaveBeenCalledWith('editor_html_block_slash_command_used')
  })

  it('creates a math slash command with a default display equation', () => {
    const block = { id: 'active-block' }
    const editor = {
      getTextCursorPosition: () => ({ block }),
      replaceBlocks: () => {},
      updateBlock: () => {},
    }
    const replaceBlocks = vi.spyOn(editor, 'replaceBlocks')
    const updateBlock = vi.spyOn(editor, 'updateBlock')

    const mathItem = createMathSlashMenuItem(editor as never)

    expect(mathItem).toEqual(expect.objectContaining({
      key: 'math',
      title: 'Math',
      aliases: ['equation', 'latex', 'formula', 'sqrt'],
    }))

    mathItem?.onItemClick()

    expect(replaceBlocks).toHaveBeenCalledWith([block], [{
      type: MATH_BLOCK_TYPE,
      props: { latex: MATH_SLASH_COMMAND_LATEX },
    }])
    expect(updateBlock).not.toHaveBeenCalled()
    expect(trackEvent).toHaveBeenCalledWith('editor_math_slash_command_used')
  })

  it('localizes custom slash-menu command labels and groups', () => {
    const editor = {
      getTextCursorPosition: () => ({ block: { id: 'active-block' } }),
      replaceBlocks: () => {},
    }

    const mathItem = createMathSlashMenuItem(editor as never, {
      mathTitle: 'Equation',
      mediaGroup: 'Insert',
      mermaidEditPlaceholder: 'Edit source',
      mermaidTitle: 'Diagram',
      whiteboardTitle: 'Canvas',
    })

    expect(mathItem).toEqual(expect.objectContaining({
      group: 'Insert',
      key: 'math',
      title: 'Equation',
    }))
  })
})
