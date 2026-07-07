export type BlockNoteBuiltinCoverageStatus =
  | 'filtered'
  | 'supported'
  | 'supported-custom'
  | 'supported-style'

export interface BlockNoteBuiltinCoverage {
  feature: string
  filteredSlashKeys?: string[]
  markdownDurability: string
  slashKeys: string[]
  status: BlockNoteBuiltinCoverageStatus
  toolbarTypes: string[]
}

export const BLOCKNOTE_BUILTIN_COVERAGE: BlockNoteBuiltinCoverage[] = [
  {
    feature: 'paragraph',
    markdownDurability: 'plain Markdown paragraph',
    slashKeys: ['paragraph'],
    status: 'supported',
    toolbarTypes: ['paragraph'],
  },
  {
    feature: 'heading',
    filteredSlashKeys: ['heading_5', 'heading_6'],
    markdownDurability: 'Markdown headings; levels 1-6 available in the toolbar, slash menu keeps levels proven by BlockNote defaults',
    slashKeys: ['heading', 'heading_2', 'heading_3', 'heading_4'],
    status: 'supported',
    toolbarTypes: ['heading'],
  },
  {
    feature: 'toggle heading',
    filteredSlashKeys: ['toggle_heading', 'toggle_heading_2', 'toggle_heading_3'],
    markdownDurability: 'filtered until persisted parse/serialize/reopen behavior is proven',
    slashKeys: [],
    status: 'filtered',
    toolbarTypes: [],
  },
  {
    feature: 'quote',
    markdownDurability: 'Markdown blockquote',
    slashKeys: ['quote'],
    status: 'supported',
    toolbarTypes: ['quote'],
  },
  {
    feature: 'bullet list',
    markdownDurability: 'Markdown unordered list item',
    slashKeys: ['bullet_list'],
    status: 'supported',
    toolbarTypes: ['bulletListItem'],
  },
  {
    feature: 'numbered list',
    markdownDurability: 'Markdown ordered list item',
    slashKeys: ['numbered_list'],
    status: 'supported',
    toolbarTypes: ['numberedListItem'],
  },
  {
    feature: 'checklist',
    markdownDurability: 'Markdown task list item',
    slashKeys: ['check_list'],
    status: 'supported',
    toolbarTypes: ['checkListItem'],
  },
  {
    feature: 'toggle list item',
    filteredSlashKeys: ['toggle_list'],
    markdownDurability: 'filtered until persisted parse/serialize/reopen behavior is proven',
    slashKeys: [],
    status: 'filtered',
    toolbarTypes: [],
  },
  {
    feature: 'code block',
    markdownDurability: 'Markdown fenced code block',
    slashKeys: ['code_block'],
    status: 'supported',
    toolbarTypes: ['codeBlock'],
  },
  {
    feature: 'table',
    markdownDurability: 'BlockNote table with Markdown round-trip support guarded separately',
    slashKeys: ['table'],
    status: 'supported',
    toolbarTypes: [],
  },
  {
    feature: 'file',
    markdownDurability: 'vault file attachment block',
    slashKeys: ['file'],
    status: 'supported',
    toolbarTypes: [],
  },
  {
    feature: 'image',
    markdownDurability: 'Markdown image/file block with vault asset path support',
    slashKeys: ['image'],
    status: 'supported',
    toolbarTypes: [],
  },
  {
    feature: 'video',
    markdownDurability: 'vault media file block',
    slashKeys: ['video'],
    status: 'supported',
    toolbarTypes: [],
  },
  {
    feature: 'audio',
    markdownDurability: 'vault media file block',
    slashKeys: ['audio'],
    status: 'supported',
    toolbarTypes: [],
  },
  {
    feature: 'styled text',
    markdownDurability: 'Markdown-compatible bold, italic, strike, link, inline code, highlight, and math styling',
    slashKeys: [],
    status: 'supported-style',
    toolbarTypes: [],
  },
  {
    feature: 'link',
    markdownDurability: 'Markdown link and wikilink UI integration',
    slashKeys: [],
    status: 'supported-style',
    toolbarTypes: [],
  },
  {
    feature: 'math',
    markdownDurability: 'Sapientia custom math block and inline math Markdown transforms',
    slashKeys: ['math'],
    status: 'supported-custom',
    toolbarTypes: [],
  },
  {
    feature: 'mermaid',
    markdownDurability: 'Sapientia custom fenced Mermaid diagram block',
    slashKeys: ['mermaid'],
    status: 'supported-custom',
    toolbarTypes: [],
  },
  {
    feature: 'whiteboard',
    markdownDurability: 'Sapientia custom tldraw-backed whiteboard block',
    slashKeys: ['whiteboard'],
    status: 'supported-custom',
    toolbarTypes: [],
  },
]

export const MARKDOWN_UNSTABLE_SLASH_MENU_KEYS = new Set(
  BLOCKNOTE_BUILTIN_COVERAGE.flatMap((entry) => entry.filteredSlashKeys ?? []),
)
