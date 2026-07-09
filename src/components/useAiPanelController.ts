import { useCallback, useMemo, useState, useSyncExternalStore } from 'react'
import type { AiAgentId, AiAgentReadiness } from '../lib/aiAgents'
import type { AiTarget } from '../lib/aiTargets'
import type { AppLocale } from '../lib/i18n'
import { trackAiAgentPermissionModeChanged } from '../lib/productAnalytics'
import {
  aiAgentPermissionModeMarker,
  normalizeAiAgentPermissionMode,
  type AiAgentPermissionMode,
} from '../lib/aiAgentPermissionMode'
import { useCliAiAgent, type AgentFileCallbacks } from '../hooks/useCliAiAgent'
import type { VaultEntry } from '../types'
import {
  getVaultConfig,
  subscribeVaultConfig,
  updateVaultConfigField,
} from '../utils/vaultConfigStore'
import {
  type NoteListItem,
  type NoteReference,
  type PaperAiContextSummary,
  type AiSelectedTextContext,
} from '../utils/ai-context'
import { useAiPanelContextSnapshot } from './useAiPanelContextSnapshot'
import type { ProjectCanvasAiContext } from '../projectCanvasAiContext'

interface UseAiPanelControllerArgs {
  vaultPath: string
  vaultPaths?: string[]
  defaultAiAgent: AiAgentId
  defaultAiTarget?: AiTarget
  defaultAiAgentReady: boolean
  defaultAiAgentReadiness?: AiAgentReadiness
  activeEntry?: VaultEntry | null
  activeNoteContent?: string | null
  entries?: VaultEntry[]
  openTabs?: VaultEntry[]
  noteList?: NoteListItem[]
  noteListFilter?: { type: string | null; query: string }
  selectedTextContext?: AiSelectedTextContext | null
  locale?: AppLocale
  onOpenNote?: (path: string) => void
  onFileCreated?: (relativePath: string) => void
  onFileModified?: (relativePath: string) => void
  onVaultChanged?: () => void
  sessionId?: string
}

export interface AiPanelController {
  agent: ReturnType<typeof useCliAiAgent>
  input: string
  setInput: React.Dispatch<React.SetStateAction<string>>
  linkedEntries: ReturnType<typeof useAiPanelContextSnapshot>['linkedEntries']
  paperContext: PaperAiContextSummary | null
  projectContext: ProjectCanvasAiContext | null
  selectedTextContext: AiSelectedTextContext | null
  selectedTextIncluded: boolean
  hasContext: boolean
  isActive: boolean
  permissionMode: AiAgentPermissionMode
  handleSend: (text: string, references: NoteReference[]) => void
  handleStop: () => void
  handleNavigateWikilink: (target: string) => void
  handlePermissionModeChange: (mode: AiAgentPermissionMode) => void
  handleNewChat: () => void
  handleToggleSelectedTextContext: () => void
}

function resolveAgentReady(
  readiness: AiAgentReadiness | undefined,
  ready: boolean,
): boolean {
  return (readiness ?? (ready ? 'ready' : 'missing')) === 'ready'
}

function useVaultAiAgentPermissionMode(): AiAgentPermissionMode {
  const vaultConfig = useSyncExternalStore(subscribeVaultConfig, getVaultConfig)
  return normalizeAiAgentPermissionMode(vaultConfig.ai_agent_permission_mode)
}

function selectedTextContextKey(context: AiSelectedTextContext | null | undefined): string | null {
  if (!context) return null
  const selectedValue = context.kind === 'image' ? context.path.trim() : context.text.trim()
  if (!selectedValue) return null
  return [
    context.kind,
    context.entryPath,
    context.kind === 'image' ? '' : context.anchorId ?? '',
    selectedValue,
  ].join('\u0000')
}

function useAgentFileCallbacks({
  onFileCreated,
  onFileModified,
  onVaultChanged,
}: Pick<
  UseAiPanelControllerArgs,
  'onFileCreated' | 'onFileModified' | 'onVaultChanged'
>): AgentFileCallbacks {
  return useMemo<AgentFileCallbacks>(() => ({
    onFileCreated,
    onFileModified,
    onVaultChanged,
  }), [onFileCreated, onFileModified, onVaultChanged])
}

function useAiPermissionModeHandler({
  agent,
  defaultAiAgent,
  isActive,
  locale,
  permissionMode,
}: {
  agent: ReturnType<typeof useCliAiAgent>
  defaultAiAgent: AiAgentId
  isActive: boolean
  locale: AppLocale
  permissionMode: AiAgentPermissionMode
}) {
  return useCallback((mode: AiAgentPermissionMode) => {
    const nextMode = normalizeAiAgentPermissionMode(mode)
    if (isActive || nextMode === permissionMode) return

    updateVaultConfigField('ai_agent_permission_mode', nextMode)
    trackAiAgentPermissionModeChanged(defaultAiAgent, nextMode)
    agent.addLocalMarker(aiAgentPermissionModeMarker(nextMode, locale))
  }, [agent, defaultAiAgent, isActive, locale, permissionMode])
}

function usePanelAgent({
  vaultPath,
  vaultPaths,
  contextPrompt,
  defaultAiAgent,
  defaultAiTarget,
  defaultAiAgentReady,
  defaultAiAgentReadiness,
  locale,
  onFileCreated,
  onFileModified,
  onVaultChanged,
  sessionId,
}: Pick<
  UseAiPanelControllerArgs,
  | 'vaultPath'
  | 'vaultPaths'
  | 'defaultAiAgent'
  | 'defaultAiTarget'
  | 'defaultAiAgentReady'
  | 'defaultAiAgentReadiness'
  | 'locale'
  | 'onFileCreated'
  | 'onFileModified'
  | 'onVaultChanged'
  | 'sessionId'
> & { contextPrompt?: string }) {
  const fileCallbacks = useAgentFileCallbacks({ onFileCreated, onFileModified, onVaultChanged })
  const permissionMode = useVaultAiAgentPermissionMode()
  const agent = useCliAiAgent(vaultPath, vaultPaths, contextPrompt, fileCallbacks, {
    agent: defaultAiAgent,
    target: defaultAiTarget,
    locale,
    agentReady: resolveAgentReady(defaultAiAgentReadiness, defaultAiAgentReady),
    permissionMode,
    sessionId,
  })
  return { agent, permissionMode }
}

export function useAiPanelController({
  vaultPath,
  vaultPaths,
  defaultAiAgent,
  defaultAiTarget,
  defaultAiAgentReady,
  defaultAiAgentReadiness,
  activeEntry,
  activeNoteContent,
  entries,
  openTabs,
  noteList,
  noteListFilter,
  selectedTextContext,
  locale = 'en',
  onOpenNote,
  onFileCreated,
  onFileModified,
  onVaultChanged,
  sessionId,
}: UseAiPanelControllerArgs): AiPanelController {
  const [input, setInput] = useState('')
  const [excludedSelectedTextKey, setExcludedSelectedTextKey] = useState<string | null>(null)
  const currentSelectedTextKey = selectedTextContextKey(selectedTextContext)
  const selectedTextIncluded = currentSelectedTextKey !== null && currentSelectedTextKey !== excludedSelectedTextKey
  const selectedContext = selectedTextIncluded ? selectedTextContext : null
  const { linkedEntries, contextPrompt, paperContext, projectContext } = useAiPanelContextSnapshot({
    activeEntry,
    activeNoteContent,
    entries,
    input,
    openTabs,
    noteList,
    noteListFilter,
    selectedContext,
    vaultPath,
  })

  const { agent, permissionMode } = usePanelAgent({ vaultPath, vaultPaths, contextPrompt, defaultAiAgent, defaultAiTarget, defaultAiAgentReady, defaultAiAgentReadiness, locale, onFileCreated, onFileModified, onVaultChanged, sessionId })
  const isActive = agent.status === 'thinking' || agent.status === 'tool-executing'

  const handleSend = useCallback((text: string, references: NoteReference[]) => {
    if (!text.trim() || isActive) return
    agent.sendMessage(text, references)
    setInput('')
  }, [agent, isActive])

  const handleStop = useCallback(() => {
    if (!isActive) return
    agent.stopMessage()
  }, [agent, isActive])

  const handleNavigateWikilink = useCallback((target: string) => {
    onOpenNote?.(target)
  }, [onOpenNote])

  const handlePermissionModeChange = useAiPermissionModeHandler({ agent, defaultAiAgent, isActive, locale, permissionMode })

  const handleNewChat = useCallback(() => {
    agent.clearConversation()
    setInput('')
    setExcludedSelectedTextKey(null)
  }, [agent])

  const handleToggleSelectedTextContext = useCallback(() => {
    const nextKey = selectedTextContextKey(selectedTextContext)
    if (!nextKey) {
      setExcludedSelectedTextKey(null)
      return
    }
    setExcludedSelectedTextKey(current => current === nextKey ? null : nextKey)
  }, [selectedTextContext])

  return {
    agent,
    input,
    setInput,
    linkedEntries,
    paperContext,
    projectContext,
    selectedTextContext: selectedTextContext ?? null,
    selectedTextIncluded,
    hasContext: !!activeEntry,
    isActive,
    permissionMode,
    handleSend,
    handleStop,
    handleNavigateWikilink,
    handlePermissionModeChange,
    handleNewChat,
    handleToggleSelectedTextContext,
  }
}
