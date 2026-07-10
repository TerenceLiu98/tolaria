import type { AiAgentId } from './aiAgents'
import type { AiAgentPermissionMode } from './aiAgentPermissionMode'
import { trackEvent } from './telemetry'
import type { AllNotesFileVisibility } from '../utils/allNotesFileVisibility'
import type { DateDisplayFormat } from '../utils/dateDisplay'
import type { FilePreviewKind } from '../utils/filePreview'
import type { NoteWidthMode } from '../types'
import type { ThemeMode } from './themeMode'

type TrackedPreviewKind = FilePreviewKind | 'unsupported'
type FilePreviewAction = 'copy_deep_link' | 'copy_path' | 'open_external' | 'reveal'
type AgentBlockedReason = 'agent_unavailable' | 'missing_vault'
type AiWorkspaceMode = 'docked' | 'side' | 'window'
type AiWorkspaceTitleSource = 'generated' | 'manual'
type NotePdfExportFailureReason = 'export_unavailable' | 'export_error'
type NotePdfExportSource = 'breadcrumb' | 'app_command' | 'note_list_context_menu'
type PaperImportSource = 'command_palette'
type PaperReaderBlocksState = 'missing' | 'empty' | 'ready' | 'loading' | 'error' | 'unavailable'
type PaperReaderMode = 'markdown' | 'pdf'
type PaperParserProvider = 'none' | 'dev-fixture' | 'mineru'
type PaperCommentActionKind = 'comment'
type AnalyticsBoolean = boolean
type AiAgentResponseText = string
type AiAgentToolCount = number
type AiAgentResponseTextFlag = 'had_text' | 'had_partial_response'
type SheetFormulaFunctionName = string
type ProjectCanvasOpenState = 'ready' | 'created'
type ProjectCanvasNodeKind = 'note' | 'paper' | 'paper_block' | 'image' | 'text' | 'task' | 'group'
type ProjectCanvasEdgeKind = 'related' | 'supports' | 'contradicts' | 'depends_on' | 'needs_reading'
type ProjectCanvasAddSource = 'ai_answer' | 'block_citation' | 'note_list' | 'paper_catalog'
type ProjectCanvasAiAction = 'summarize' | 'recommend_paper' | 'cited_outline'

const ALL_NOTES_VISIBILITY_CATEGORIES: ReadonlyArray<keyof AllNotesFileVisibility> = [
  'pdfs',
  'images',
  'unsupported',
]

function trackedPreviewKind(previewKind: FilePreviewKind | null): TrackedPreviewKind {
  return previewKind ?? 'unsupported'
}

function numericFlag(value: AnalyticsBoolean): number {
  return value ? 1 : 0
}

function aiAgentResponsePayload(
  agent: AiAgentId,
  response: AiAgentResponseText,
  toolCount: AiAgentToolCount,
  textFlag: AiAgentResponseTextFlag,
) {
  return {
    agent,
    [textFlag]: numericFlag(response.trim().length > 0),
    tool_count: toolCount,
  }
}

export function trackFilePreviewOpened(previewKind: FilePreviewKind | null): void {
  trackEvent('file_preview_opened', {
    preview_kind: trackedPreviewKind(previewKind),
  })
}

export function trackFilePreviewAction(action: FilePreviewAction, previewKind: FilePreviewKind | null): void {
  trackEvent('file_preview_action', {
    action,
    preview_kind: trackedPreviewKind(previewKind),
  })
}

export function trackFilePreviewFailed(previewKind: FilePreviewKind): void {
  trackEvent('file_preview_failed', { preview_kind: previewKind })
}

export function trackNotePdfExportStarted(source: NotePdfExportSource): void {
  trackEvent('note_pdf_export_started', { source })
}

export function trackNotePdfExportFailed(
  source: NotePdfExportSource,
  reason: NotePdfExportFailureReason,
): void {
  trackEvent('note_pdf_export_failed', { reason, source })
}

export function trackPaperImported(params: {
  deduplicated: AnalyticsBoolean
  source: PaperImportSource
}): void {
  trackEvent('paper_imported', {
    deduplicated: numericFlag(params.deduplicated),
    source: params.source,
  })
}

export function trackPaperReaderOpened(blocksState: PaperReaderBlocksState): void {
  trackEvent('paper_reader_opened', { blocks_state: blocksState })
}

export function trackPaperReaderModeChanged(mode: PaperReaderMode): void {
  trackEvent('paper_reader_mode_changed', { mode })
}

export function trackPaperParseRequested(provider: PaperParserProvider): void {
  trackEvent('paper_parse_requested', { provider })
}

export function trackPaperParseCompleted(provider: PaperParserProvider, blockCount: number): void {
  trackEvent('paper_parse_completed', {
    block_count: blockCount,
    provider,
  })
}

export function trackPaperParseFailed(provider: PaperParserProvider, reason: string): void {
  trackEvent('paper_parse_failed', {
    provider,
    reason,
  })
}

export function trackPaperBlockCitationCopied(): void {
  trackEvent('paper_block_citation_copied')
}

export function trackPaperCommentSaved(params: {
  kind: PaperCommentActionKind
}): void {
  trackEvent('paper_comment_saved', {
    kind: params.kind,
  })
}

export function trackPaperCommentDeleted(): void {
  trackEvent('paper_comment_deleted')
}

export function trackPaperCommentSidecarReset(): void {
  trackEvent('paper_comment_sidecar_reset')
}

export function trackProjectCanvasOpened(params: { state: ProjectCanvasOpenState }): void {
  trackEvent('project_canvas_opened', { state: params.state })
}

export function trackProjectCanvasCreated(): void {
  trackEvent('project_canvas_created')
}

export function trackProjectCanvasLayoutSaved(): void {
  trackEvent('project_canvas_layout_saved')
}

export function trackProjectCanvasFocusModeChanged(params: {
  enabled: boolean
  nodeType: ProjectCanvasNodeKind
}): void {
  trackEvent('project_canvas_focus_mode_changed', {
    enabled: numericFlag(params.enabled),
    node_type: params.nodeType,
  })
}

export function trackProjectCanvasNodeAdded(params: { linked: boolean; nodeType: ProjectCanvasNodeKind }): void {
  trackEvent('project_canvas_node_added', {
    linked: numericFlag(params.linked),
    node_type: params.nodeType,
  })
}

export function trackProjectCanvasEdgeCreated(params: { kind: ProjectCanvasEdgeKind }): void {
  trackEvent('project_canvas_edge_created', { kind: params.kind })
}

export function trackProjectCanvasExternalNodeAdded(params: {
  createdCanvas: AnalyticsBoolean
  duplicate: AnalyticsBoolean
  nodeType: ProjectCanvasNodeKind
  source: ProjectCanvasAddSource
}): void {
  trackEvent('project_canvas_external_node_added', {
    created_canvas: numericFlag(params.createdCanvas),
    duplicate: numericFlag(params.duplicate),
    node_type: params.nodeType,
    source: params.source,
  })
}

export function trackProjectCanvasAiAction(action: ProjectCanvasAiAction): void {
  trackEvent('project_canvas_ai_action_started', { action })
}

export function trackAllNotesVisibilityChanged(
  previous: AllNotesFileVisibility,
  next: AllNotesFileVisibility,
): void {
  for (const category of ALL_NOTES_VISIBILITY_CATEGORIES) {
    const previousValue = Reflect.get(previous, category) as boolean
    const nextValue = Reflect.get(next, category) as boolean
    if (previousValue === nextValue) continue
    trackEvent('all_notes_visibility_changed', {
      category,
      enabled: numericFlag(nextValue),
    })
  }
}

export function trackAiFeaturesEnabledChanged(enabled: AnalyticsBoolean): void {
  trackEvent('ai_features_visibility_changed', {
    enabled: numericFlag(enabled),
  })
}

export function trackGitFeaturesEnabledChanged(enabled: AnalyticsBoolean): void {
  trackEvent('git_features_visibility_changed', {
    enabled: numericFlag(enabled),
  })
}

export function trackDefaultNoteWidthChanged(mode: NoteWidthMode): void {
  trackEvent('note_width_default_changed', { mode })
}

export function trackDateDisplayFormatChanged(format: DateDisplayFormat): void {
  trackEvent('date_display_format_changed', { format })
}

export function trackSidebarTypePluralizationChanged(enabled: AnalyticsBoolean): void {
  trackEvent('sidebar_type_pluralization_changed', {
    enabled: numericFlag(enabled),
  })
}

export function trackThemeModeChanged(mode: ThemeMode): void {
  trackEvent('theme_mode_changed', { mode })
}

export function trackInlineImageLightboxOpened(): void {
  trackEvent('inline_image_lightbox_opened')
}

export function trackDatePropertyDirectEntrySaved(): void {
  trackEvent('date_property_direct_entry_saved', { source: 'properties_panel' })
}

export function trackSheetEditorOpened(params: {
  columnCount: number
  hasMetadata: boolean
  rowCount: number
}): void {
  trackEvent('sheet_editor_opened', {
    column_count: params.columnCount,
    has_metadata: numericFlag(params.hasMetadata),
    row_count: params.rowCount,
  })
}

export function trackSheetFormulaAutocompleteUsed(functionName: SheetFormulaFunctionName): void {
  trackEvent('sheet_formula_autocomplete_used', { function_name: functionName })
}

export function trackAiAgentMessageBlocked(agent: AiAgentId, reason: AgentBlockedReason): void {
  trackEvent('ai_agent_message_blocked', { agent, reason })
}

export function trackAiAgentMessageSent(params: {
  agent: AiAgentId
  permissionMode: AiAgentPermissionMode
  hasContext: boolean
  referenceCount: number
  historyMessageCount: number
}): void {
  trackEvent('ai_agent_message_sent', {
    agent: params.agent,
    permission_mode: params.permissionMode,
    has_context: numericFlag(params.hasContext),
    reference_count: params.referenceCount,
    history_message_count: params.historyMessageCount,
  })
}

export function trackAiAgentResponseCompleted(
  agent: AiAgentId,
  response: AiAgentResponseText,
  toolCount: AiAgentToolCount,
  skipped: AnalyticsBoolean,
): void {
  if (skipped) return
  trackEvent('ai_agent_response_completed', aiAgentResponsePayload(agent, response, toolCount, 'had_text'))
}

export function trackAiAgentResponseFailed(
  agent: AiAgentId,
  response: AiAgentResponseText,
  toolCount: AiAgentToolCount,
): void {
  trackEvent('ai_agent_response_failed', {
    ...aiAgentResponsePayload(agent, response, toolCount, 'had_partial_response'),
    error_kind: 'stream_error',
  })
}

export function trackAiAgentResponseStopped(
  agent: AiAgentId,
  response: AiAgentResponseText,
  toolCount: AiAgentToolCount,
): void {
  trackEvent('ai_agent_response_stopped', aiAgentResponsePayload(agent, response, toolCount, 'had_partial_response'))
}

export function trackAiAgentPermissionModeChanged(agent: AiAgentId, permissionMode: AiAgentPermissionMode): void {
  trackEvent('ai_agent_permission_mode_changed', {
    agent,
    permission_mode: permissionMode,
  })
}

export function trackAiWorkspaceSidebarToggled(collapsed: AnalyticsBoolean, mode: AiWorkspaceMode): void {
  trackEvent('ai_workspace_sidebar_toggled', {
    collapsed: numericFlag(collapsed),
    mode,
  })
}

export function trackAiWorkspaceChatTitled(source: AiWorkspaceTitleSource): void {
  trackEvent('ai_workspace_chat_titled', { source })
}
