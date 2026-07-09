import { Article, Binoculars, Graph, ListBullets, Quotes, Sparkle, WarningCircle } from '@phosphor-icons/react'
import type { ProjectCanvasAiContext } from '../../projectCanvasAiContext'
import type { ProjectCanvasAiAction } from '../../projectCanvasAiActions'
import { createTranslator, type AppLocale } from '../../lib/i18n'
import { ActionTooltip } from '../ui/action-tooltip'
import { Button } from '../ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '../ui/dropdown-menu'

interface ProjectCanvasAiContextBarProps {
  context: ProjectCanvasAiContext
  disabled?: boolean
  locale?: AppLocale
  onAction?: (action: ProjectCanvasAiAction) => void
}

export function ProjectCanvasAiContextBar({
  context,
  disabled = false,
  locale = 'en',
  onAction,
}: ProjectCanvasAiContextBarProps) {
  const t = createTranslator(locale)
  const selectedLabel = context.selectedNode?.title ?? context.selectedNode?.id ?? null
  const preview = [
    t('ai.panel.projectContext.project', { project: context.project.title }),
    selectedLabel ? t('ai.panel.projectContext.selected', { node: selectedLabel }) : null,
    t('ai.panel.projectContext.papers', { count: context.summary.referencedPaperCount }),
    t('ai.panel.projectContext.citations', { count: context.summary.citedBlockCount }),
    t('ai.panel.projectContext.stale', { count: context.summary.staleReferenceCount }),
  ].filter((item): item is string => item !== null)

  const actions: Array<{ action: ProjectCanvasAiAction; icon: typeof Article; label: string }> = [
    { action: 'summarize', icon: Article, label: t('ai.panel.projectContext.action.summarize.label') },
    { action: 'recommend_paper', icon: Binoculars, label: t('ai.panel.projectContext.action.recommend_paper.label') },
    { action: 'cited_outline', icon: ListBullets, label: t('ai.panel.projectContext.action.cited_outline.label') },
  ]

  return (
    <div
      className="flex w-full max-w-full min-w-0 flex-col overflow-hidden border-b border-border text-muted-foreground"
      style={{ padding: '6px 12px', gap: 4, fontSize: 11 }}
      data-testid="ai-project-context-bar"
    >
      <div className="flex w-full min-w-0 items-center gap-1.5">
        <ActionTooltip
          copy={{ label: preview.join('\n') }}
          side="bottom"
          align="start"
          contentTestId="ai-project-context-tooltip"
        >
          <div className="flex min-w-0 flex-1 items-center gap-1.5 overflow-hidden">
            <Graph size={12} className="shrink-0" />
            <span className="shrink-0 font-semibold" data-testid="ai-project-tools-available">
              {t('ai.panel.projectContext.toolsAvailable')}
            </span>
            <span className="shrink-0 rounded-full border border-border px-1.5 py-0.5 text-[10px]">
              {t('ai.panel.projectContext.included')}
            </span>
            <span className="min-w-0 flex-1" aria-hidden="true" />
            {context.summary.referencedPaperCount > 0 && (
              <span className="shrink-0" data-testid="ai-project-paper-count">{context.summary.referencedPaperCount}P</span>
            )}
            {context.summary.citedBlockCount > 0 && (
              <span className="inline-flex shrink-0 items-center gap-1" data-testid="ai-project-citation-count">
                <Quotes size={11} />{context.summary.citedBlockCount}
              </span>
            )}
            {context.summary.staleReferenceCount > 0 && (
              <span className="inline-flex shrink-0 items-center gap-1" data-testid="ai-project-stale-count">
                <WarningCircle size={11} />{context.summary.staleReferenceCount}
              </span>
            )}
          </div>
        </ActionTooltip>
        {onAction && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                type="button"
                variant="ghost"
                size="icon-xs"
                disabled={disabled}
                aria-label={t('ai.panel.projectContext.action.menu')}
              >
                <Sparkle />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="min-w-52">
              {actions.map(({ action, icon: Icon, label }) => (
                <DropdownMenuItem key={action} onSelect={() => onAction(action)}>
                  <Icon />
                  {label}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </div>
      <div
        className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 pl-[18px] text-[10px] leading-4"
        data-testid="ai-project-context-preview"
      >
        <span className="min-w-0 max-w-full truncate">
          {t('ai.panel.projectContext.project', { project: context.project.title })}
        </span>
        {selectedLabel && (
          <span className="min-w-0 max-w-full truncate">
            {t('ai.panel.projectContext.selected', { node: selectedLabel })}
          </span>
        )}
      </div>
    </div>
  )
}
