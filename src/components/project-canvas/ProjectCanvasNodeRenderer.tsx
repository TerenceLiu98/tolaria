import type { ComponentType, ReactNode } from 'react'
import type { CanvasNodeRenderer, CanvasNodeSpec } from '../../canvasNodeSpecRegistry'
import type { AppLocale } from '../../lib/i18n'
import type { ProjectCanvasNode, ProjectCanvasResolvedRef } from '../../projectCanvas'
import type { VaultEntry } from '../../types'
import type { ProjectCanvasNodePresentation } from './projectCanvasDisplay'
import {
  ProjectCanvasDocumentNodeRenderer,
  ProjectCanvasImageNodeRenderer,
  ProjectCanvasPaperBlockNodeRenderer,
  ProjectCanvasTaskNodeRenderer,
  ProjectCanvasTextNodeRenderer,
} from './ProjectCanvasNodeRenderers'

export interface ProjectCanvasNodeRendererProps {
  editing: boolean
  editorHostRef?: (element: HTMLDivElement | null) => void
  entry: VaultEntry | null
  locale: AppLocale
  node: ProjectCanvasNode
  onNavigateWikilink: (target: string) => void
  onTextBlur: () => void
  onTextChange: (text: string) => void
  onToggleTask: () => void
  presentation: ProjectCanvasNodePresentation
  resolved?: ProjectCanvasResolvedRef
  spec: CanvasNodeSpec
  title: string
  vaultPath: string
}

type RendererRegistration = readonly [CanvasNodeRenderer, ComponentType<ProjectCanvasNodeRendererProps>]

const DEFAULT_RENDERERS: readonly RendererRegistration[] = [
  ['overview', ProjectCanvasDocumentNodeRenderer],
  ['document', ProjectCanvasDocumentNodeRenderer],
  ['paper_block', ProjectCanvasPaperBlockNodeRenderer],
  ['image', ProjectCanvasImageNodeRenderer],
  ['text', ProjectCanvasTextNodeRenderer],
  ['task', ProjectCanvasTaskNodeRenderer],
  ['group', ProjectCanvasTextNodeRenderer],
]

export class ProjectCanvasNodeRendererRegistry {
  private readonly renderers = new Map<CanvasNodeRenderer, ComponentType<ProjectCanvasNodeRendererProps>>()

  constructor(registrations: readonly RendererRegistration[] = DEFAULT_RENDERERS) {
    registrations.forEach(([key, renderer]) => this.renderers.set(key, renderer))
  }

  keys(): CanvasNodeRenderer[] {
    return [...this.renderers.keys()]
  }

  render(spec: CanvasNodeSpec, props: ProjectCanvasNodeRendererProps): ReactNode {
    const Renderer = this.renderers.get(spec.rendererAdapter.key)
    if (!Renderer) throw new Error(`Missing Canvas node renderer: ${spec.rendererAdapter.key}`)
    return <Renderer {...props} />
  }
}

export const projectCanvasNodeRendererRegistry = new ProjectCanvasNodeRendererRegistry()
