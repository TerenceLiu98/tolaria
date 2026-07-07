import { filterSuggestionItems } from '@blocknote/core/extensions'
import {
  getDefaultReactSlashMenuItems,
  type DefaultReactSuggestionItem,
} from '@blocknote/react'
import { createElement, type ReactElement } from 'react'
import {
  CodeBlock,
  File,
  FlowArrow,
  ImageSquare,
  ListBullets,
  ListChecks,
  ListNumbers,
  Minus,
  Pi,
  Paragraph,
  Quotes,
  ScribbleLoop,
  Smiley,
  SpeakerHigh,
  Table,
  TextHOne,
  TextHTwo,
  TextHThree,
  TextHFour,
  TextHFive,
  TextHSix,
  Video,
  type Icon as PhosphorIcon,
} from '@phosphor-icons/react'
import { trackEvent } from '../lib/telemetry'
import type { TranslationKey } from '../lib/i18n'
import { MATH_BLOCK_TYPE } from '../utils/mathMarkdown'
import { MERMAID_BLOCK_TYPE, mermaidFenceSource } from '../utils/mermaidMarkdown'
import { TLDRAW_BLOCK_TYPE, TLDRAW_DEFAULT_HEIGHT } from '../utils/tldrawMarkdown'
import { MARKDOWN_UNSTABLE_SLASH_MENU_KEYS } from './formatting/blockCoverageModel'

type TolariaSlashMenuItem = DefaultReactSuggestionItem & { key: string }
type TolariaBlockTypeSelectItem = {
  labelKey: TranslationKey
  type: string
  props?: Record<string, boolean | number | string>
  icon: PhosphorIcon
}
type SlashInsertEditor = {
  getTextCursorPosition: () => { block: unknown }
  replaceBlocks: (blocksToReplace: unknown[], blocksToInsert: Array<Record<string, unknown>>) => void
}
type BlockSlashMenuItemConfig = {
  aliases: string[]
  eventName?: string
  group: string
  key: string
  props: Record<string, unknown>
  title: string
  type: string
}
type TolariaSlashMenuLabels = {
  mathTitle: string
  mediaGroup: string
  mermaidEditPlaceholder: string
  mermaidTitle: string
  whiteboardTitle: string
}

const DEFAULT_TOLARIA_SLASH_MENU_LABELS: TolariaSlashMenuLabels = {
  mathTitle: 'Math',
  mediaGroup: 'Media',
  mermaidEditPlaceholder: 'Switch to the raw editor to edit',
  mermaidTitle: 'Mermaid',
  whiteboardTitle: 'Whiteboard',
}

function mermaidLabelText(text: string): string {
  return text.replace(/\\/g, '\\\\').replace(/"/g, '\\"')
}

export function createMermaidSlashCommandDiagram(
  editPlaceholder: string = DEFAULT_TOLARIA_SLASH_MENU_LABELS.mermaidEditPlaceholder,
) {
  return [
    'flowchart TD',
    `    edit["${mermaidLabelText(editPlaceholder)}"]`,
  ].join('\n')
}

export const MERMAID_SLASH_COMMAND_DIAGRAM = createMermaidSlashCommandDiagram()
export const MATH_SLASH_COMMAND_LATEX = '\\sqrt{a^2 + b^2}'

const UNSUPPORTED_FORMATTING_TOOLBAR_KEYS = new Set([
  'underlineStyleButton',
  'textAlignLeftButton',
  'textAlignCenterButton',
  'textAlignRightButton',
  'colorStyleButton',
])

const TOLARIA_BLOCK_TYPE_SELECT_ITEMS: TolariaBlockTypeSelectItem[] = [
  { labelKey: 'editor.blockType.paragraph', type: 'paragraph', icon: Paragraph },
  { labelKey: 'editor.blockType.heading1', type: 'heading', props: { level: 1 }, icon: TextHOne },
  { labelKey: 'editor.blockType.heading2', type: 'heading', props: { level: 2 }, icon: TextHTwo },
  { labelKey: 'editor.blockType.heading3', type: 'heading', props: { level: 3 }, icon: TextHThree },
  { labelKey: 'editor.blockType.heading4', type: 'heading', props: { level: 4 }, icon: TextHFour },
  { labelKey: 'editor.blockType.heading5', type: 'heading', props: { level: 5 }, icon: TextHFive },
  { labelKey: 'editor.blockType.heading6', type: 'heading', props: { level: 6 }, icon: TextHSix },
  { labelKey: 'editor.blockType.quote', type: 'quote', icon: Quotes },
  { labelKey: 'editor.blockType.bulletList', type: 'bulletListItem', icon: ListBullets },
  { labelKey: 'editor.blockType.numberedList', type: 'numberedListItem', icon: ListNumbers },
  { labelKey: 'editor.blockType.checklist', type: 'checkListItem', icon: ListChecks },
  { labelKey: 'editor.blockType.codeBlock', type: 'codeBlock', icon: CodeBlock },
]

const TOLARIA_SLASH_MENU_ICONS: Partial<Record<string, PhosphorIcon>> = {
  audio: SpeakerHigh,
  bullet_list: ListBullets,
  check_list: ListChecks,
  code_block: CodeBlock,
  divider: Minus,
  emoji: Smiley,
  file: File,
  heading: TextHOne,
  heading_2: TextHTwo,
  heading_3: TextHThree,
  heading_4: TextHFour,
  image: ImageSquare,
  math: Pi,
  mermaid: FlowArrow,
  numbered_list: ListNumbers,
  paragraph: Paragraph,
  quote: Quotes,
  table: Table,
  video: Video,
  whiteboard: ScribbleLoop,
}

function createBoardId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID()
  }

  return `whiteboard-${Date.now().toString(36)}`
}

function createWhiteboardSlashMenuItem(
  editor: Parameters<typeof getDefaultReactSlashMenuItems>[0],
  labels: TolariaSlashMenuLabels = DEFAULT_TOLARIA_SLASH_MENU_LABELS,
): TolariaSlashMenuItem {
  return createBlockSlashMenuItem(editor, {
    key: 'whiteboard',
    title: labels.whiteboardTitle,
    aliases: ['tldraw', 'drawing', 'canvas', 'sketch'],
    group: labels.mediaGroup,
    type: TLDRAW_BLOCK_TYPE,
    props: {
      boardId: createBoardId(),
      height: TLDRAW_DEFAULT_HEIGHT,
      snapshot: '{}',
      width: '',
    },
  })
}

function createMermaidSlashMenuItem(
  editor: Parameters<typeof getDefaultReactSlashMenuItems>[0],
  labels: TolariaSlashMenuLabels = DEFAULT_TOLARIA_SLASH_MENU_LABELS,
): TolariaSlashMenuItem {
  const diagram = createMermaidSlashCommandDiagram(labels.mermaidEditPlaceholder)

  return createBlockSlashMenuItem(editor, {
    key: 'mermaid',
    title: labels.mermaidTitle,
    aliases: ['diagram', 'flowchart', 'graph', 'chart'],
    group: labels.mediaGroup,
    type: MERMAID_BLOCK_TYPE,
    props: {
      diagram,
      source: mermaidFenceSource({ diagram }),
    },
  })
}

export function createMathSlashMenuItem(
  editor: Parameters<typeof getDefaultReactSlashMenuItems>[0],
  labels: TolariaSlashMenuLabels = DEFAULT_TOLARIA_SLASH_MENU_LABELS,
): TolariaSlashMenuItem {
  return createBlockSlashMenuItem(editor, {
    key: 'math',
    title: labels.mathTitle,
    aliases: ['equation', 'latex', 'formula', 'sqrt'],
    eventName: 'editor_math_slash_command_used',
    group: labels.mediaGroup,
    type: MATH_BLOCK_TYPE,
    props: {
      latex: MATH_SLASH_COMMAND_LATEX,
    },
  })
}

function createBlockSlashMenuItem(
  editor: Parameters<typeof getDefaultReactSlashMenuItems>[0],
  config: BlockSlashMenuItemConfig,
): TolariaSlashMenuItem {
  const blockEditor = editor as unknown as SlashInsertEditor

  return {
    key: config.key,
    title: config.title,
    aliases: config.aliases,
    group: config.group,
    onItemClick: () => {
      const block = blockEditor.getTextCursorPosition().block
      blockEditor.replaceBlocks([block], [{
        type: config.type,
        props: config.props,
      }])
      if (config.eventName) trackEvent(config.eventName)
    },
  } as TolariaSlashMenuItem
}

export function addItemsToMediaGroup(
  items: TolariaSlashMenuItem[],
  mediaItems: TolariaSlashMenuItem[],
): TolariaSlashMenuItem[] {
  const nextItems = [...items]
  const insertIndex = nextItems.findIndex((item) => item.key === 'emoji')

  if (insertIndex === -1) {
    nextItems.push(...mediaItems)
    return nextItems
  }

  nextItems.splice(insertIndex, 0, ...mediaItems)
  return nextItems
}

function createTolariaSlashMenuIcon(Icon: PhosphorIcon) {
  return createElement(
    'span',
    { className: 'tolaria-slash-menu-icon' },
    createElement(Icon, {
      'aria-hidden': true,
      className: 'tolaria-slash-menu-icon__regular',
      size: 18,
      weight: 'regular',
    }),
    createElement(Icon, {
      'aria-hidden': true,
      className: 'tolaria-slash-menu-icon__fill',
      size: 18,
      weight: 'fill',
    }),
  )
}

export function getTolariaBlockTypeSelectItems() {
  return TOLARIA_BLOCK_TYPE_SELECT_ITEMS
}

export function filterTolariaFormattingToolbarItems<T extends ReactElement>(
  items: T[],
): T[] {
  return items.filter(
    (item) => !UNSUPPORTED_FORMATTING_TOOLBAR_KEYS.has(String(item.key)),
  )
}

export function filterTolariaSlashMenuItems<T extends TolariaSlashMenuItem>(
  items: T[],
): T[] {
  return items
    .filter((item) => !MARKDOWN_UNSTABLE_SLASH_MENU_KEYS.has(item.key))
    .map((item) => {
      const TolariaIcon = TOLARIA_SLASH_MENU_ICONS[item.key]

      return {
        ...item,
        icon: TolariaIcon ? createTolariaSlashMenuIcon(TolariaIcon) : item.icon,
        subtext: undefined,
      }
    }) as T[]
}

export function getTolariaSlashMenuItems(
  editor: Parameters<typeof getDefaultReactSlashMenuItems>[0],
  query: string,
  labels: TolariaSlashMenuLabels = DEFAULT_TOLARIA_SLASH_MENU_LABELS,
) {
  const items = addItemsToMediaGroup(
    getDefaultReactSlashMenuItems(editor) as TolariaSlashMenuItem[],
    [
      createMermaidSlashMenuItem(editor, labels),
      createMathSlashMenuItem(editor, labels),
      createWhiteboardSlashMenuItem(editor, labels),
    ],
  )

  return filterSuggestionItems(
    filterTolariaSlashMenuItems(
      items,
    ),
    query,
  )
}
