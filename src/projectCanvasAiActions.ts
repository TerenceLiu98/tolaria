import type { createTranslator } from './lib/i18n'
import type { ProjectCanvasAiContext } from './projectCanvasAiContext'

export type ProjectCanvasAiAction = 'summarize' | 'recommend_paper' | 'cited_outline'

export function projectCanvasAiActionPrompt(
  action: ProjectCanvasAiAction,
  context: ProjectCanvasAiContext,
  t: ReturnType<typeof createTranslator>,
): string {
  const selected = context.selectedNode?.title ?? context.selectedNode?.id ?? t('ai.panel.projectContext.action.noSelection')
  const prompt = t(`ai.panel.projectContext.action.${action}.prompt`, {
    project: context.project.title,
    projectId: context.project.id,
    selected,
  })
  return `${t(`ai.panel.projectContext.action.${action}.label`)}\n\n${prompt}`
}
