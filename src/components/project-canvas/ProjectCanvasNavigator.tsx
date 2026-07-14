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
import { memo, useCallback, useEffect, useMemo, useRef, type KeyboardEvent, type ReactNode } from 'react'
import { Virtuoso, type VirtuosoHandle } from 'react-virtuoso'
import { type CanvasNodeIcon, CanvasNodeSpecRegistry } from '../../canvasNodeSpecRegistry'
import { translate, type AppLocale } from '../../lib/i18n'
import type { ProjectCanvasNode } from '../../projectCanvas'
import { cn } from '../../lib/utils'
import { Button } from '../ui/button'

interface ProjectCanvasNavigatorProps {
  locale?: AppLocale
  nodes: ProjectCanvasNode[]
  specs: CanvasNodeSpecRegistry
  selectedNodeId: string | null
  onFocusNode: (node: ProjectCanvasNode) => void
}

type NavigatorRow =
  | { kind: 'section'; key: string; label: string; count: number }
  | { kind: 'node'; key: string; node: ProjectCanvasNode }

type NavigatorKey = 'ArrowDown' | 'ArrowUp' | 'End' | 'Home'

const NODE_ICONS: Readonly<Record<CanvasNodeIcon, ReactNode>> = {
  overview: <NotePencil />,
  note: <FileText />,
  paper: <Article />,
  paper_block: <Quotes />,
  task: <CheckSquare />,
  image: <ImageSquare />,
  text: <TextT />,
  group: <SquaresFour />,
}

function nextNodeRowIndex(
  nodeRowIndices: readonly number[],
  currentRowIndex: number,
  key: NavigatorKey,
): number | null {
  const currentNodeIndex = Math.max(0, nodeRowIndices.indexOf(currentRowIndex))
  const targetByKey: Record<NavigatorKey, number> = {
    ArrowDown: Math.min(nodeRowIndices.length - 1, currentNodeIndex + 1),
    ArrowUp: Math.max(0, currentNodeIndex - 1),
    End: nodeRowIndices.length - 1,
    Home: 0,
  }
  return nodeRowIndices[targetByKey[key]] ?? null
}

function ProjectCanvasNavigatorComponent({
  locale = 'en',
  nodes,
  specs,
  selectedNodeId,
  onFocusNode,
}: ProjectCanvasNavigatorProps) {
  const virtuosoRef = useRef<VirtuosoHandle | null>(null)
  const nodeButtonsRef = useRef(new Map<string, HTMLButtonElement>())
  const pendingFocusNodeIdRef = useRef<string | null>(null)
  const rows = useMemo<NavigatorRow[]>(() => {
    const sections = new Map<string, {
      items: ProjectCanvasNode[]
      key: string
      label: string
      order: number
    }>()
    for (const node of nodes) {
      const spec = specs.getForNode(node)
      const key = String(spec.key)
      const section = sections.get(key)
      if (section) section.items.push(node)
      else sections.set(key, {
        items: [node],
        key,
        label: translate(locale, spec.navigator.sectionKey),
        order: spec.navigator.order,
      })
    }
    return [...sections.values()]
      .sort((left, right) => left.order - right.order || left.key.localeCompare(right.key))
      .flatMap(section => [
      { kind: 'section', key: `section-${section.key}`, label: section.label, count: section.items.length },
      ...section.items
        .sort((left, right) => (left.title ?? left.id).localeCompare(right.title ?? right.id))
        .map(node => ({ kind: 'node' as const, key: node.id, node })),
      ])
  }, [locale, nodes, specs])
  const nodeRowIndices = useMemo(
    () => rows.flatMap((row, index) => row.kind === 'node' ? [index] : []),
    [rows],
  )

  const registerNodeButton = useCallback((nodeId: string, element: HTMLButtonElement | null) => {
    if (!element) {
      nodeButtonsRef.current.delete(nodeId)
      return
    }
    nodeButtonsRef.current.set(nodeId, element)
    if (pendingFocusNodeIdRef.current !== nodeId) return
    pendingFocusNodeIdRef.current = null
    element.focus()
  }, [])

  const focusNodeRow = useCallback((rowIndex: number) => {
    const row = rows[rowIndex]
    if (!row || row.kind !== 'node') return
    pendingFocusNodeIdRef.current = row.node.id
    virtuosoRef.current?.scrollIntoView({ index: rowIndex, behavior: 'auto' })
    const mountedButton = nodeButtonsRef.current.get(row.node.id)
    if (!mountedButton) return
    pendingFocusNodeIdRef.current = null
    mountedButton.focus()
  }, [rows])

  const handleNodeKeyDown = useCallback((
    event: KeyboardEvent<HTMLButtonElement>,
    rowIndex: number,
    node: ProjectCanvasNode,
  ) => {
    if (event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault()
      event.stopPropagation()
      onFocusNode(node)
      return
    }
    if (!['ArrowDown', 'ArrowUp', 'End', 'Home'].includes(event.key)) return
    const nextRowIndex = nextNodeRowIndex(nodeRowIndices, rowIndex, event.key as NavigatorKey)
    if (nextRowIndex === null) return
    event.preventDefault()
    event.stopPropagation()
    focusNodeRow(nextRowIndex)
  }, [focusNodeRow, nodeRowIndices, onFocusNode])

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
            const nodeSpec = specs.getForNode(node)
            const active = node.id === selectedNodeId
            const label = node.title ?? node.ref ?? translate(locale, 'projectCanvas.untitledNode')
            return (
              <Button
                ref={element => registerNodeButton(node.id, element)}
                type="button"
                size="sm"
                variant="ghost"
                className={cn('project-canvas-navigator__item', active && 'project-canvas-navigator__item--active')}
                aria-label={label}
                aria-current={active ? 'true' : undefined}
                data-node-icon={nodeSpec.navigator.icon}
                data-testid={`project-canvas-navigator-node-${node.id}`}
                onKeyDown={event => handleNodeKeyDown(event, _index, node)}
                onClick={() => onFocusNode(node)}
              >
                {NODE_ICONS[nodeSpec.navigator.icon]}
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
