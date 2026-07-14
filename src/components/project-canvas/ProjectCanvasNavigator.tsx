import {
  Article,
  CheckSquare,
  FileText,
  ImageSquare,
  NotePencil,
  Quotes,
  SquaresFour,
  TextT,
} from '@phosphor-icons/react'
import { memo, useEffect, useMemo, useRef, type ReactNode } from 'react'
import { Virtuoso, type VirtuosoHandle } from 'react-virtuoso'
import { translate, type AppLocale } from '../../lib/i18n'
import {
  PROJECT_OVERVIEW_NODE_ID,
  type ProjectCanvasNode,
  type ProjectCanvasNodeType,
} from '../../projectCanvas'
import { cn } from '../../lib/utils'
import { Button } from '../ui/button'

interface ProjectCanvasNavigatorProps {
  locale?: AppLocale
  nodes: ProjectCanvasNode[]
  selectedNodeId: string | null
  onFocusNode: (node: ProjectCanvasNode) => void
}

type NavigatorRow =
  | { kind: 'section'; key: string; label: string; count: number }
  | { kind: 'node'; key: string; node: ProjectCanvasNode }

const TYPE_ORDER: ProjectCanvasNodeType[] = [
  'paper',
  'note',
  'paper_block',
  'task',
  'image',
  'text',
  'group',
]

function nodeIcon(type: ProjectCanvasNodeType): ReactNode {
  if (type === 'paper') return <Article />
  if (type === 'paper_block') return <Quotes />
  if (type === 'task') return <CheckSquare />
  if (type === 'image') return <ImageSquare />
  if (type === 'text') return <TextT />
  if (type === 'group') return <SquaresFour />
  return <FileText />
}

function groupLabel(locale: AppLocale, type: ProjectCanvasNodeType): string {
  return translate(
    locale,
    type === 'paper_block' ? 'projectCanvas.navigator.evidence' : `projectCanvas.node.${type}`,
  )
}

function ProjectCanvasNavigatorComponent({
  locale = 'en',
  nodes,
  selectedNodeId,
  onFocusNode,
}: ProjectCanvasNavigatorProps) {
  const virtuosoRef = useRef<VirtuosoHandle | null>(null)
  const rows = useMemo<NavigatorRow[]>(() => {
    const overview = nodes.find(node => node.id === PROJECT_OVERVIEW_NODE_ID)
    const groups = TYPE_ORDER.flatMap(type => {
      const items = nodes
        .filter(node => node.id !== PROJECT_OVERVIEW_NODE_ID && node.type === type)
        .sort((left, right) => (left.title ?? left.id).localeCompare(right.title ?? right.id))
      return items.length > 0 ? [{ key: type, label: groupLabel(locale, type), items }] : []
    })
    const sections = overview
      ? [{ key: 'overview', label: translate(locale, 'projectCanvas.navigator.overview'), items: [overview] }, ...groups]
      : groups
    return sections.flatMap(section => [
      { kind: 'section', key: `section-${section.key}`, label: section.label, count: section.items.length },
      ...section.items.map(node => ({ kind: 'node' as const, key: node.id, node })),
    ])
  }, [locale, nodes])

  useEffect(() => {
    if (!selectedNodeId) return
    const index = rows.findIndex(row => row.kind === 'node' && row.node.id === selectedNodeId)
    if (index >= 0) virtuosoRef.current?.scrollIntoView({ index, behavior: 'auto' })
  }, [rows, selectedNodeId])

  return (
    <nav
      className="project-canvas-navigator"
      aria-label={translate(locale, 'projectCanvas.navigator')}
      onPointerDown={event => event.stopPropagation()}
    >
      <div className="project-canvas-navigator__header">
        <NotePencil size={14} />
        <span>{translate(locale, 'projectCanvas.navigator')}</span>
      </div>
      <div className="project-canvas-navigator__sections">
        <Virtuoso
          ref={virtuosoRef}
          style={{ height: '100%' }}
          data={rows}
          overscan={160}
          computeItemKey={(_index, row) => row.key}
          itemContent={(_index, row) => {
            if (row.kind === 'section') {
              return (
                <div className="project-canvas-navigator__section-title">
                  <span>{row.label}</span>
                  <span>{row.count}</span>
                </div>
              )
            }
            const { node } = row
            const active = node.id === selectedNodeId
            const label = node.title ?? node.ref ?? translate(locale, 'projectCanvas.untitledNode')
            return (
              <Button
                type="button"
                size="sm"
                variant="ghost"
                className={cn('project-canvas-navigator__item', active && 'project-canvas-navigator__item--active')}
                aria-label={label}
                aria-current={active ? 'true' : undefined}
                data-testid={`project-canvas-navigator-node-${node.id}`}
                onClick={() => onFocusNode(node)}
              >
                {node.id === PROJECT_OVERVIEW_NODE_ID ? <NotePencil /> : nodeIcon(node.type)}
                <span className="project-canvas-navigator__item-label" data-label={label} aria-hidden="true" />
              </Button>
            )
          }}
        />
      </div>
    </nav>
  )
}

export const ProjectCanvasNavigator = memo(ProjectCanvasNavigatorComponent)
ProjectCanvasNavigator.displayName = 'ProjectCanvasNavigator'
