import { ArrowClockwise, ArrowCounterClockwise, CheckSquare, Clipboard, CornersOut, FrameCorners, Graph, Hand, ImageSquare, LinkSimple, MagnifyingGlass, Minus, Plus, Square, TextT } from '@phosphor-icons/react'
import { translate, type AppLocale } from '../../lib/i18n'
import type { ProjectCanvasEdgeKind, ProjectCanvasNode, ProjectCanvasNodeType } from '../../projectCanvas'
import type { VaultEntry } from '../../types'
import type { CanvasTool } from '../../canvasToolManager'
import type { CanvasAlignment, CanvasArrangement, CanvasDistribution } from '../../projectCanvasController'
import { Button } from '../ui/button'
import { Checkbox } from '../ui/checkbox'
import { Input } from '../ui/input'
import { Popover, PopoverContent, PopoverHeader, PopoverTitle, PopoverTrigger } from '../ui/popover'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select'
import { Textarea } from '../ui/textarea'
import { EDGE_KINDS, edgeKindKey } from './projectCanvasDisplay'
import { ProjectCanvasArrangePopover } from './ProjectCanvasArrangePopover'
import { projectCanvasSavedState } from './projectCanvasSaveState'

export type ProjectCanvasAddPanelMode = 'existing' | 'text' | 'task' | 'image' | 'block' | 'group'

interface ProjectCanvasToolbarProps {
  addMode: ProjectCanvasAddPanelMode
  addPanelOpen: boolean
  candidateEntries: VaultEntry[]
  candidateQuery: string
  canRedo: boolean
  canUndo: boolean
  edgeCount: number
  edgeKind: ProjectCanvasEdgeKind
  editingNodeId: string | null
  focusMode: boolean
  linkFromSelected: boolean
  locale: AppLocale
  newCardText: string
  nodeCount: number
  selectedNode: ProjectCanvasNode | null
  selectedNodeCount: number
  selectedNodeId: string | null
  saveError: string | null
  saving: boolean
  title: string
  tool: CanvasTool
  zoom: number
  onAddEmbeddedNode: () => void
  onAddEntry: (entry: VaultEntry) => void
  onAddModeChange: (mode: ProjectCanvasAddPanelMode) => void
  onAddPanelOpenChange: (open: boolean) => void
  onAlign: (alignment: CanvasAlignment) => void
  onArrange: (arrangement: CanvasArrangement) => void
  onAutoLayout: () => void
  onCandidateQueryChange: (query: string) => void
  onEdgeKindChange: (kind: ProjectCanvasEdgeKind) => void
  onFit: () => void
  onFocusModeChange: (enabled: boolean) => void
  onLinkFromSelectedChange: (linked: boolean) => void
  onNewCardTextChange: (text: string) => void
  onRedo: () => void
  onDistribute: (distribution: CanvasDistribution) => void
  onToolChange: (tool: CanvasTool) => void
  onUndo: () => void
  onZoom: (delta: number) => void
}

function candidateType(entry: VaultEntry): ProjectCanvasNodeType | null {
  if (entry.isA === 'Paper') return 'paper'
  if (entry.isA === 'Note') return 'note'
  return null
}

export function ProjectCanvasToolbar({
  addMode,
  addPanelOpen,
  candidateEntries,
  candidateQuery,
  canRedo,
  canUndo,
  edgeCount,
  edgeKind,
  editingNodeId,
  focusMode,
  linkFromSelected,
  locale,
  newCardText,
  nodeCount,
  selectedNode,
  selectedNodeCount,
  selectedNodeId,
  saveError,
  saving,
  title,
  tool,
  zoom,
  onAddEmbeddedNode,
  onAddEntry,
  onAddModeChange,
  onAddPanelOpenChange,
  onAlign,
  onArrange,
  onAutoLayout,
  onCandidateQueryChange,
  onEdgeKindChange,
  onFit,
  onFocusModeChange,
  onLinkFromSelectedChange,
  onNewCardTextChange,
  onRedo,
  onDistribute,
  onToolChange,
  onUndo,
  onZoom,
}: ProjectCanvasToolbarProps) {
  return (
    <>
      <header className="project-canvas-toolbar">
        <div className="project-canvas-toolbar__meta">
          <div className="project-canvas-toolbar__title">{title}</div>
          <div className="project-canvas-toolbar__status">
            {translate(locale, 'projectCanvas.status', {
              edgeCount: String(edgeCount),
              nodeCount: String(nodeCount),
              savedState: projectCanvasSavedState(locale, saving, saveError),
            })}
          </div>
        </div>
      </header>
      <div className="project-canvas-floating-toolbar" aria-label={translate(locale, 'projectCanvas.toolbar')}>
        {([
          { tool: 'select', label: 'projectCanvas.selectTool', icon: <Square size={15} /> },
          { tool: 'hand', label: 'projectCanvas.handTool', icon: <Hand size={15} /> },
          { tool: 'connect', label: 'projectCanvas.connectTool', icon: <LinkSimple size={15} /> },
          { tool: 'frame', label: 'projectCanvas.frameTool', icon: <FrameCorners size={15} /> },
        ] as const).map(({ tool: nextTool, label, icon }) => (
          <Button
            key={nextTool}
            type="button"
            size="icon-sm"
            variant={tool === nextTool ? 'secondary' : 'outline'}
            aria-label={translate(locale, label)}
            aria-pressed={tool === nextTool}
            data-testid={`project-canvas-tool-${nextTool}`}
            onClick={() => onToolChange(nextTool)}
          >
            {icon}
          </Button>
        ))}
        {editingNodeId && !focusMode ? (
          <Button type="button" size="icon-sm" variant="outline" aria-label={translate(locale, 'projectCanvas.enterFocusMode')} onClick={() => onFocusModeChange(true)}>
            <CornersOut size={14} />
          </Button>
        ) : null}
        <Button type="button" size="icon-sm" variant="outline" onClick={onUndo} disabled={!canUndo} aria-label={translate(locale, 'projectCanvas.undo')}>
          <ArrowCounterClockwise size={14} />
        </Button>
        <Button type="button" size="icon-sm" variant="outline" onClick={onRedo} disabled={!canRedo} aria-label={translate(locale, 'projectCanvas.redo')}>
          <ArrowClockwise size={14} />
        </Button>
        {selectedNodeCount > 1 ? (
          <ProjectCanvasArrangePopover
            locale={locale}
            selectedNodeCount={selectedNodeCount}
            onAlign={onAlign}
            onArrange={onArrange}
            onDistribute={onDistribute}
          />
        ) : null}
        <Popover open={addPanelOpen} onOpenChange={onAddPanelOpenChange}>
          <PopoverTrigger asChild>
            <Button type="button" size="sm" variant="default">
              <Plus size={14} />
              {translate(locale, 'projectCanvas.add')}
            </Button>
          </PopoverTrigger>
          <PopoverContent className="project-canvas-add-popover" align="center" side="top" sideOffset={12}>
            <PopoverHeader>
              <PopoverTitle>{translate(locale, 'projectCanvas.addToCanvas')}</PopoverTitle>
            </PopoverHeader>
            <div className="project-canvas-add-popover__modes" role="group" aria-label={translate(locale, 'projectCanvas.addMode')}>
              {(['existing', 'text', 'task', 'image', 'block', 'group'] as const).map(mode => (
                <Button key={mode} type="button" size="xs" variant={addMode === mode ? 'secondary' : 'ghost'} onClick={() => onAddModeChange(mode)}>
                  {mode === 'existing' ? <MagnifyingGlass size={13} /> : null}
                  {mode === 'text' ? <TextT size={13} /> : null}
                  {mode === 'task' ? <CheckSquare size={13} /> : null}
                  {mode === 'image' ? <ImageSquare size={13} /> : null}
                  {mode === 'block' ? <Clipboard size={13} /> : null}
                  {mode === 'group' ? <Square size={13} /> : null}
                  {translate(locale, `projectCanvas.addMode.${mode}`)}
                </Button>
              ))}
            </div>
            <div className="project-canvas-add-popover__relation">
              <label className="project-canvas-add-popover__checkbox">
                <Checkbox checked={Boolean(selectedNodeId && linkFromSelected)} disabled={!selectedNodeId} onCheckedChange={checked => onLinkFromSelectedChange(checked === true)} />
                <span>
                  {selectedNode
                    ? translate(locale, 'projectCanvas.linkFromSelected', { title: selectedNode.title ?? selectedNode.ref ?? selectedNode.id })
                    : translate(locale, 'projectCanvas.selectSourceHint')}
                </span>
              </label>
              <Select value={edgeKind} onValueChange={value => onEdgeKindChange(value as ProjectCanvasEdgeKind)} disabled={!selectedNodeId || !linkFromSelected}>
                <SelectTrigger size="sm" className="project-canvas-add-popover__edge-kind" aria-label={translate(locale, 'projectCanvas.edgeKind')}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent position="popper" align="end">
                  {EDGE_KINDS.map(kind => <SelectItem key={kind} value={kind}>{translate(locale, edgeKindKey(kind))}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            {addMode === 'existing' ? (
              <div className="project-canvas-add-popover__existing">
                <Input value={candidateQuery} onChange={event => onCandidateQueryChange(event.target.value)} placeholder={translate(locale, 'projectCanvas.searchPlaceholder')} />
                <div className="project-canvas-add-popover__results">
                  {candidateEntries.length > 0 ? candidateEntries.map(candidate => {
                    const type = candidateType(candidate)
                    return (
                      <Button key={candidate.path} type="button" variant="ghost" className="project-canvas-add-popover__candidate" onClick={() => onAddEntry(candidate)}>
                        <span className="project-canvas-add-popover__candidate-kind">{type ? translate(locale, `projectCanvas.node.${type}`) : ''}</span>
                        <span className="project-canvas-add-popover__candidate-title">{candidate.title}</span>
                      </Button>
                    )
                  }) : <div className="project-canvas-add-popover__empty">{translate(locale, 'projectCanvas.noCandidates')}</div>}
                </div>
              </div>
            ) : (
              <div className="project-canvas-add-popover__embedded">
                <Textarea value={newCardText} onChange={event => onNewCardTextChange(event.target.value)} placeholder={translate(locale, `projectCanvas.addPlaceholder.${addMode}`)} />
                <Button type="button" size="sm" onClick={onAddEmbeddedNode}>{translate(locale, 'projectCanvas.addCard')}</Button>
              </div>
            )}
          </PopoverContent>
        </Popover>
        <Button type="button" size="icon-sm" variant="outline" onClick={() => onZoom(-0.1)} aria-label={translate(locale, 'projectCanvas.zoomOut')}><Minus size={14} /></Button>
        <Button type="button" size="sm" variant="ghost" onClick={onFit}>{Math.round(zoom * 100)}%</Button>
        <Button type="button" size="icon-sm" variant="outline" onClick={() => onZoom(0.1)} aria-label={translate(locale, 'projectCanvas.zoomIn')}><Plus size={14} /></Button>
        <Button type="button" size="sm" variant="outline" onClick={onFit}><CornersOut size={14} />{translate(locale, 'projectCanvas.fit')}</Button>
        <Button type="button" size="sm" variant="outline" onClick={onAutoLayout}><Graph size={14} />{translate(locale, 'projectCanvas.autoLayout')}</Button>
      </div>
    </>
  )
}
