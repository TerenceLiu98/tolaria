#!/usr/bin/env node
/**
 * Sapientia MCP Server — lightweight vault tools for AI agents.
 *
 * These MCP tools provide Sapientia-specific capabilities alongside each
 * app-managed agent's own Safe / Power User permission profile:
 *
 *   - search_notes: full-text search across vault notes
 *   - get_vault_context: vault structure overview (types, note count, folders)
 *   - get_note: parsed frontmatter + content (convenience over raw cat)
 *   - create_note: create a new markdown note without overwriting existing files
 *   - search_papers / read_paper_blocks: citation-safe Paper library tools
 *   - open_note: signal Sapientia UI to open a note as a tab
 *   - highlight_editor: visually highlight a UI element (editor, tab, etc.)
 *   - refresh_vault: trigger vault rescan so new/modified files appear
 */
import { Server } from '@modelcontextprotocol/sdk/server/index.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js'
import WebSocket from 'ws'
import { createMcpToolService } from './tool-service.js'

const WS_UI_PORT = parseInt(process.env.WS_UI_PORT || '9711', 10)
const WS_UI_URL = `ws://localhost:${WS_UI_PORT}`
const LOCAL_READ_ONLY_TOOL_ANNOTATIONS = Object.freeze({
  readOnlyHint: true,
  destructiveHint: false,
  idempotentHint: true,
  openWorldHint: false,
})
const LOCAL_CREATE_TOOL_ANNOTATIONS = Object.freeze({
  readOnlyHint: false,
  destructiveHint: false,
  idempotentHint: false,
  openWorldHint: false,
})

// Connect as a WebSocket CLIENT to the UI bridge (run by ws-bridge.js).
// The bridge relays messages to all other clients (the React frontend).
let uiSocket = null
let reconnectTimer = null
let shutdownStarted = false
const RECONNECT_INTERVAL_MS = 3000

function connectUiBridge() {
  if (shutdownStarted) return

  try {
    const ws = new WebSocket(WS_UI_URL)
    uiSocket = ws
    ws.on('open', () => {
      if (shutdownStarted) {
        closeUiSocket()
        return
      }
      console.error(`[mcp] Connected to UI bridge at ${WS_UI_URL}`)
    })
    ws.on('close', () => {
      if (uiSocket === ws) uiSocket = null
      scheduleUiReconnect()
    })
    ws.on('error', () => {
      // Silent — bridge may not be running yet, will retry
    })
  } catch {
    scheduleUiReconnect()
  }
}

function scheduleUiReconnect() {
  if (shutdownStarted) return

  clearUiReconnectTimer()
  reconnectTimer = setTimeout(connectUiBridge, RECONNECT_INTERVAL_MS)
  reconnectTimer.unref?.()
}

function clearUiReconnectTimer() {
  if (!reconnectTimer) return

  clearTimeout(reconnectTimer)
  reconnectTimer = null
}

function closeUiSocket() {
  const socket = uiSocket
  uiSocket = null
  if (!socket) return

  socket.removeAllListeners()
  socket.on('error', () => {})
  if (socket.readyState === WebSocket.CONNECTING) {
    socket.terminate?.()
    return
  }

  try {
    socket.close()
  } catch {
    // Ignore close races during process teardown.
  }
  socket.terminate?.()
}

function broadcastUiAction(action, payload) {
  if (!uiSocket || uiSocket.readyState !== WebSocket.OPEN) return
  uiSocket.send(JSON.stringify({ type: 'ui_action', action, ...payload }))
}

const toolService = createMcpToolService({ emitUiAction: broadcastUiAction })

const TOOLS = [
  {
    name: 'search_notes',
    description: 'Full-text search across vault notes by title or content. Returns matching paths, titles, and snippets.',
    annotations: LOCAL_READ_ONLY_TOOL_ANNOTATIONS,
    inputSchema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Search query string' },
        limit: { type: 'number', description: 'Maximum number of results (default: 10)' },
      },
      required: ['query'],
    },
  },
  {
    name: 'get_vault_context',
    description: 'Get vault orientation for the active Sapientia vaults: entity types, AGENTS.md instructions, note count, folders, and recent notes.',
    annotations: LOCAL_READ_ONLY_TOOL_ANNOTATIONS,
    inputSchema: {
      type: 'object',
      properties: {
        vaultPath: { type: 'string', description: 'Optional target vault root. Omit to inspect all active vaults.' },
      },
    },
  },
  {
    name: 'list_vaults',
    description: 'List the current active Sapientia vaults available to MCP tools, including whether each vault has AGENTS.md instructions.',
    annotations: LOCAL_READ_ONLY_TOOL_ANNOTATIONS,
    inputSchema: {
      type: 'object',
      properties: {},
    },
  },
  {
    name: 'get_note',
    description: 'Read a note with parsed YAML frontmatter and markdown content. Returns {path, frontmatter, content}.',
    annotations: LOCAL_READ_ONLY_TOOL_ANNOTATIONS,
    inputSchema: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'Relative path to the note (e.g. "project/my-project.md")' },
        vaultPath: { type: 'string', description: 'Optional target vault root when multiple vaults are active.' },
      },
      required: ['path'],
    },
  },
  {
    name: 'list_papers',
    description: 'Use for a compact overview of available Paper notes before choosing a target. Lists active Sapientia vault Papers with bibliographic metadata, vault provenance, and wikilinks. Does not return full paper text. Read-only.',
    annotations: LOCAL_READ_ONLY_TOOL_ANNOTATIONS,
    inputSchema: {
      type: 'object',
      properties: {
        vaultPath: { type: 'string', description: 'Optional target vault root. Omit to inspect all active vaults.' },
      },
    },
  },
  {
    name: 'search_papers',
    description: 'Use for paper discovery by title, authors, venue, year, DOI, arXiv, OpenAlex, or Semantic Scholar identifiers. Returns compact ranked metadata with vault provenance and wikilinks, not full paper content. Read-only.',
    annotations: LOCAL_READ_ONLY_TOOL_ANNOTATIONS,
    inputSchema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Metadata search query.' },
        limit: { type: 'number', description: 'Maximum number of results (default: 10, max: 20).' },
        filters: {
          type: 'object',
          properties: {
            author: { type: 'string' },
            year: { type: 'number' },
            venueType: { type: 'string' },
            parseStatus: { type: 'string' },
            metadataStatus: { type: 'string' },
          },
        },
        vaultPath: { type: 'string', description: 'Optional target vault root when multiple vaults are active.' },
      },
      required: ['query'],
    },
  },
  {
    name: 'read_paper_metadata',
    description: 'Use before making bibliographic claims about one Paper. Reads frontmatter plus metadata.json provenance/candidates/errors for paperId and optional vaultPath. Read-only.',
    annotations: LOCAL_READ_ONLY_TOOL_ANNOTATIONS,
    inputSchema: {
      type: 'object',
      properties: {
        paperId: { type: 'string', description: 'Paper id, Paper note path, or exact Paper title.' },
        vaultPath: { type: 'string', description: 'Optional target vault root when multiple vaults are active.' },
      },
      required: ['paperId'],
    },
  },
  {
    name: 'read_paper_outline',
    description: 'Use to orient within one parsed Paper before reading evidence. Returns title/heading SourceBlocks from blocks.jsonl with page provenance and @block citations. Read-only.',
    annotations: LOCAL_READ_ONLY_TOOL_ANNOTATIONS,
    inputSchema: {
      type: 'object',
      properties: {
        paperId: { type: 'string', description: 'Paper id, Paper note path, or exact Paper title.' },
        vaultPath: { type: 'string', description: 'Optional target vault root when multiple vaults are active.' },
      },
      required: ['paperId'],
    },
  },
  {
    name: 'search_paper_blocks',
    description: 'Use to find evidence inside Papers by text, caption, or section. Returns compact snippets with paper title, vault provenance, page number, and canonical @block citations. Does not dump full papers. Read-only.',
    annotations: LOCAL_READ_ONLY_TOOL_ANNOTATIONS,
    inputSchema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Block text search query.' },
        paperId: { type: 'string', description: 'Optional Paper id. Omit to search all Papers in active vaults.' },
        limit: { type: 'number', description: 'Maximum number of results (default: 10, max: 20).' },
        vaultPath: { type: 'string', description: 'Optional target vault root when multiple vaults are active.' },
      },
      required: ['query'],
    },
  },
  {
    name: 'read_paper_blocks',
    description: 'Use after search_paper_blocks or read_paper_outline to read exact evidence. Requires paperId and blockIds or a range; returns compact SourceBlocks with citation/page provenance and structured truncation if too large. Read-only.',
    annotations: LOCAL_READ_ONLY_TOOL_ANNOTATIONS,
    inputSchema: {
      type: 'object',
      properties: {
        paperId: { type: 'string', description: 'Paper id, Paper note path, or exact Paper title.' },
        blockIds: { type: 'array', items: { type: 'string' }, description: 'Specific block ids to read.' },
        range: {
          type: 'object',
          properties: {
            start: { type: 'number', description: 'Zero-based start index.' },
            count: { type: 'number', description: 'Number of blocks to read.' },
          },
        },
        vaultPath: { type: 'string', description: 'Optional target vault root when multiple vaults are active.' },
      },
      required: ['paperId'],
    },
  },
  {
    name: 'get_paper_citation',
    description: 'Use when the user needs a bibliographic citation for one Paper. Returns a compact citation, paper id, vault provenance, and Sapientia wikilink. Read-only.',
    annotations: LOCAL_READ_ONLY_TOOL_ANNOTATIONS,
    inputSchema: {
      type: 'object',
      properties: {
        paperId: { type: 'string', description: 'Paper id, Paper note path, or exact Paper title.' },
        vaultPath: { type: 'string', description: 'Optional target vault root when multiple vaults are active.' },
      },
      required: ['paperId'],
    },
  },
  {
    name: 'get_block_citation',
    description: 'Use when citing an exact claim or resolving an @block target. Returns canonical @block[paper_id#block_id] syntax plus paper title, vault provenance, page number, and wikilink. Read-only.',
    annotations: LOCAL_READ_ONLY_TOOL_ANNOTATIONS,
    inputSchema: {
      type: 'object',
      properties: {
        paperId: { type: 'string', description: 'Paper id, Paper note path, or exact Paper title.' },
        blockId: { type: 'string', description: 'SourceBlock id.' },
        vaultPath: { type: 'string', description: 'Optional target vault root when multiple vaults are active.' },
      },
      required: ['paperId', 'blockId'],
    },
  },
  {
    name: 'create_note',
    description: 'Create a new markdown note inside an active Sapientia vault. Does not overwrite existing files. Use content for the full markdown including YAML frontmatter and H1.',
    annotations: LOCAL_CREATE_TOOL_ANNOTATIONS,
    inputSchema: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'Relative path inside the vault, or an absolute path inside an active vault. Must end in .md.' },
        content: { type: 'string', description: 'Full markdown note content, including YAML frontmatter when needed.' },
        title: { type: 'string', description: 'Optional title used only when content is omitted.' },
        type: { type: 'string', description: 'Optional note type used only when content is omitted.' },
        is_a: { type: 'string', description: 'Legacy alias for type, used only when content is omitted.' },
        vaultPath: { type: 'string', description: 'Optional target vault root when multiple vaults are active.' },
      },
      required: ['path'],
    },
  },
  {
    name: 'open_note',
    description: 'Open a note in the Sapientia UI as a new tab. Use after creating or editing a note so the user can see it.',
    annotations: LOCAL_READ_ONLY_TOOL_ANNOTATIONS,
    inputSchema: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'Relative path to the note' },
        vaultPath: { type: 'string', description: 'Optional target vault root when opening a note outside the default vault.' },
      },
      required: ['path'],
    },
  },
  {
    name: 'highlight_editor',
    description: 'Visually highlight a UI element in Sapientia (editor, tab, properties panel, or note list). The highlight auto-clears after a short delay.',
    annotations: LOCAL_READ_ONLY_TOOL_ANNOTATIONS,
    inputSchema: {
      type: 'object',
      properties: {
        element: { type: 'string', enum: ['editor', 'tab', 'properties', 'notelist'], description: 'Which UI element to highlight' },
        path: { type: 'string', description: 'Optional note path to associate with the highlight' },
      },
      required: ['element'],
    },
  },
  {
    name: 'refresh_vault',
    description: 'Trigger a vault rescan so new or modified files appear immediately in the Sapientia note list.',
    annotations: LOCAL_READ_ONLY_TOOL_ANNOTATIONS,
    inputSchema: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'Optional specific note path that changed' },
        vaultPath: { type: 'string', description: 'Optional target vault root when refreshing a note outside the default vault.' },
      },
    },
  },
]

async function handleSearchNotes(args) {
  const results = await toolService.searchNotes(args)
  const text = results.length === 0
    ? 'No matching notes found.'
    : results.map(r => `**${r.title}** (${r.vaultLabel} / ${r.path})\n${r.snippet}`).join('\n\n')
  return { content: [{ type: 'text', text }] }
}

async function handleVaultContext(args = {}) {
  const ctx = await toolService.vaultContext(args)
  return { content: [{ type: 'text', text: JSON.stringify(ctx, null, 2) }] }
}

async function handleListVaults() {
  return { content: [{ type: 'text', text: JSON.stringify(await toolService.listVaults(), null, 2) }] }
}

async function handleGetNote(args) {
  const note = await toolService.readNote(args)
  return { content: [{ type: 'text', text: JSON.stringify(note, null, 2) }] }
}

async function handleListPapers(args) {
  return { content: [{ type: 'text', text: JSON.stringify(await toolService.listPapers(args), null, 2) }] }
}

async function handleSearchPapers(args) {
  return { content: [{ type: 'text', text: JSON.stringify(await toolService.searchPapers(args), null, 2) }] }
}

async function handleReadPaperMetadata(args) {
  return { content: [{ type: 'text', text: JSON.stringify(await toolService.readPaperMetadata(args), null, 2) }] }
}

async function handleReadPaperOutline(args) {
  return { content: [{ type: 'text', text: JSON.stringify(await toolService.readPaperOutline(args), null, 2) }] }
}

async function handleSearchPaperBlocks(args) {
  return { content: [{ type: 'text', text: JSON.stringify(await toolService.searchPaperBlocks(args), null, 2) }] }
}

async function handleReadPaperBlocks(args) {
  return { content: [{ type: 'text', text: JSON.stringify(await toolService.readPaperBlocks(args), null, 2) }] }
}

async function handleGetPaperCitation(args) {
  return { content: [{ type: 'text', text: JSON.stringify(await toolService.getPaperCitation(args), null, 2) }] }
}

async function handleGetBlockCitation(args) {
  return { content: [{ type: 'text', text: JSON.stringify(await toolService.getBlockCitation(args), null, 2) }] }
}

async function handleCreateNote(args = {}) {
  const note = await toolService.createNote(args)
  return {
    content: [{
      type: 'text',
      text: JSON.stringify(note, null, 2),
    }],
  }
}

function handleOpenNote(args) {
  // Refresh vault first so the new/modified note appears in the note list,
  // then signal the UI to open it in a tab.
  const { targetPath } = toolService.openNoteAsTab(args)
  return { content: [{ type: 'text', text: `Opening ${targetPath} in Sapientia` }] }
}

function handleHighlightEditor(args) {
  toolService.highlightEditor(args)
  return { content: [{ type: 'text', text: `Highlighting ${args.element}` }] }
}

function handleRefreshVault(args) {
  toolService.refreshVault(args)
  return { content: [{ type: 'text', text: 'Vault refresh triggered' }] }
}

const TOOL_HANDLERS = new Map([
  ['search_notes', handleSearchNotes],
  ['get_vault_context', handleVaultContext],
  ['list_vaults', handleListVaults],
  ['get_note', handleGetNote],
  ['list_papers', handleListPapers],
  ['search_papers', handleSearchPapers],
  ['read_paper_metadata', handleReadPaperMetadata],
  ['read_paper_outline', handleReadPaperOutline],
  ['search_paper_blocks', handleSearchPaperBlocks],
  ['read_paper_blocks', handleReadPaperBlocks],
  ['get_paper_citation', handleGetPaperCitation],
  ['get_block_citation', handleGetBlockCitation],
  ['create_note', handleCreateNote],
  ['open_note', handleOpenNote],
  ['highlight_editor', handleHighlightEditor],
  ['refresh_vault', handleRefreshVault],
])

function callToolHandler(name, args) {
  const handler = TOOL_HANDLERS.get(name)
  if (!handler) throw new Error(`Unknown tool: ${name}`)
  return handler(args)
}

// --- Server setup ---

const server = new Server(
  { name: 'tolaria-mcp-server', version: '0.3.0' },
  { capabilities: { tools: {} } },
)

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: TOOLS,
}))

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params
  try {
    return await callToolHandler(name, args)
  } catch (error) {
    return {
      content: [{ type: 'text', text: `Error: ${error.message}` }],
      isError: true,
    }
  }
})

async function shutdown(exitCode = 0) {
  if (shutdownStarted) return

  shutdownStarted = true
  clearUiReconnectTimer()
  closeUiSocket()

  try {
    await server.close()
  } catch (error) {
    console.error(`[mcp] Error while closing server: ${error.message}`)
  }

  process.exitCode = exitCode
  setImmediate(() => process.exit(exitCode))
}

async function main() {
  const transport = new StdioServerTransport()
  server.onclose = () => {
    void shutdown(0)
  }
  process.stdin.once('end', () => {
    void shutdown(0)
  })
  process.stdin.once('close', () => {
    void shutdown(0)
  })
  process.once('SIGINT', () => {
    void shutdown(0)
  })
  process.once('SIGTERM', () => {
    void shutdown(0)
  })

  connectUiBridge()
  await server.connect(transport)
  console.error('Sapientia MCP server running (vaults resolved per call)')
}

main().catch((error) => {
  console.error(error)
  void shutdown(1)
})
