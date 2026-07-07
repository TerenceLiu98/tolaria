import { useEffect, useState } from 'react'
import {
  ArrowCounterClockwise,
  ClipboardText,
  MagnifyingGlass,
} from '@phosphor-icons/react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Textarea } from '@/components/ui/textarea'
import { translate, type AppLocale } from '../lib/i18n'
import type { PaperParserProvider } from './parserSettings'
import {
  type PaperMetadata as ResolvedPaperMetadata,
  type PaperMetadataReadResult,
  type PaperMetadataValues,
} from './metadata'
import {
  paperMetadataForReader,
  paperReaderSummary,
} from './paperReaderModel'
import type { PaperActionConfirmation } from './paperReaderActions'

interface PaperMetadataFormState {
  title: string
  authors: string
  year: string
  venue: string
  venueShort: string
  doi: string
  arxivId: string
}

function StatusPill({ value }: { value: string }) {
  return (
    <span className="inline-flex h-6 items-center rounded-md border border-border bg-muted px-2 text-xs font-medium text-muted-foreground">
      {value}
    </span>
  )
}

function paperParseButtonLabel(
  locale: AppLocale,
  provider: PaperParserProvider | undefined,
  pending: boolean,
): string {
  if (pending) return translate(locale, 'paper.reader.parsing')
  return translate(locale, provider === 'mineru' ? 'paper.reader.parseWithMineru' : 'paper.reader.parsePaper')
}

function paperMetadataErrorMessage(error: unknown): string {
  if (typeof error === 'object' && error !== null && 'message' in error && typeof error.message === 'string') return error.message
  return error instanceof Error ? error.message : String(error)
}

function metadataConfidenceLabel(confidence: number | null | undefined): string {
  if (!Number.isFinite(confidence)) return '0%'
  return `${Math.round(Math.max(0, Math.min(1, Number(confidence))) * 100)}%`
}

function metadataFormState(metadata: ResolvedPaperMetadata | null): PaperMetadataFormState {
  return {
    title: metadata?.title ?? '',
    authors: metadata?.authors.join('\n') ?? '',
    year: metadata?.year ? String(metadata.year) : '',
    venue: metadata?.venue ?? '',
    venueShort: metadata?.venueShort ?? '',
    doi: metadata?.doi ?? '',
    arxivId: metadata?.arxivId ?? '',
  }
}

function cleanOptional(value: string): string | null {
  const trimmed = value.trim()
  return trimmed.length > 0 ? trimmed : null
}

function metadataValuesFromForm(
  form: PaperMetadataFormState,
  current: ResolvedPaperMetadata | null,
): PaperMetadataValues {
  const year = Number.parseInt(form.year.trim(), 10)
  return {
    title: cleanOptional(form.title),
    authors: form.authors
      .split(/[\n,;]/u)
      .map(author => author.trim())
      .filter(author => author.length > 0),
    year: Number.isFinite(year) ? year : null,
    venue: cleanOptional(form.venue),
    venueShort: cleanOptional(form.venueShort),
    venueType: current?.venueType ?? null,
    publicationDate: current?.publicationDate ?? null,
    publicationStage: current?.publicationStage ?? null,
    doi: cleanOptional(form.doi),
    arxivId: cleanOptional(form.arxivId),
    abstract: current?.abstract ?? null,
  }
}

function metadataValuesFromCurrent(current: ResolvedPaperMetadata): PaperMetadataValues {
  return {
    title: current.title ?? null,
    authors: current.authors,
    year: current.year ?? null,
    venue: current.venue ?? null,
    venueShort: current.venueShort ?? null,
    venueType: current.venueType ?? null,
    publicationDate: current.publicationDate ?? null,
    publicationStage: current.publicationStage ?? null,
    doi: current.doi ?? null,
    arxivId: current.arxivId ?? null,
    abstract: current.abstract ?? null,
  }
}

export function PaperActionConfirmDialog({
  action,
  locale,
  onCancel,
  onConfirm,
}: {
  action: PaperActionConfirmation | null
  locale: AppLocale
  onCancel: () => void
  onConfirm: () => void
}) {
  const titleKey = action === 'parse'
    ? 'paper.reader.confirmParseAgainTitle'
    : 'paper.reader.confirmRefreshMetadataTitle'
  const messageKey = action === 'parse'
    ? 'paper.reader.confirmParseAgainMessage'
    : 'paper.reader.confirmRefreshMetadataMessage'
  const confirmKey = action === 'parse'
    ? 'paper.reader.confirmParseAgainAction'
    : 'paper.reader.confirmRefreshMetadataAction'

  return (
    <Dialog open={Boolean(action)} onOpenChange={(open) => { if (!open) onCancel() }}>
      <DialogContent showCloseButton={false} className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{translate(locale, titleKey)}</DialogTitle>
          <DialogDescription>{translate(locale, messageKey)}</DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={onCancel}>
            {translate(locale, 'common.cancel')}
          </Button>
          <Button type="button" onClick={onConfirm}>
            {translate(locale, confirmKey)}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function PaperMetadataInspector({
  locale,
  metadata,
  metadataError,
  metadataPending,
  metadataReadyForAction,
  onApplyCandidate,
  onRefreshMetadata,
  onSaveMetadata,
}: {
  locale: AppLocale
  metadata: ResolvedPaperMetadata | null
  metadataError: unknown
  metadataPending: boolean
  metadataReadyForAction: boolean
  onApplyCandidate: (candidateId: string) => void
  onRefreshMetadata?: () => void
  onSaveMetadata: (values: PaperMetadataValues) => void
}) {
  const [form, setForm] = useState(() => metadataFormState(metadata))
  useEffect(() => {
    setForm(metadataFormState(metadata))
  }, [metadata])

  if (metadataError) {
    return (
      <div className="grid gap-3" data-testid="paper-reader-metadata-inspector">
        <p className="text-xs text-destructive" data-testid="paper-reader-metadata-error">
          {paperMetadataErrorMessage(metadataError)}
        </p>
        {onRefreshMetadata ? (
          <Button type="button" variant="secondary" size="sm" disabled={metadataPending || !metadataReadyForAction} onClick={onRefreshMetadata}>
            <ArrowCounterClockwise className="size-4" />
            {metadataPending ? translate(locale, 'paper.reader.metadataRefreshing') : translate(locale, 'paper.reader.refreshMetadata')}
          </Button>
        ) : null}
      </div>
    )
  }
  if (!metadata) {
    return (
      <div className="grid gap-3" data-testid="paper-reader-metadata-inspector">
        <p className="text-sm text-muted-foreground">{translate(locale, 'paper.reader.metadataUnavailable')}</p>
        {onRefreshMetadata ? (
          <Button type="button" variant="secondary" size="sm" disabled={metadataPending || !metadataReadyForAction} onClick={onRefreshMetadata}>
            <ArrowCounterClockwise className="size-4" />
            {metadataPending ? translate(locale, 'paper.reader.metadataRefreshing') : translate(locale, 'paper.reader.refreshMetadata')}
          </Button>
        ) : null}
      </div>
    )
  }

  const details = [
    metadata.authors.length > 0 ? metadata.authors.join(', ') : null,
    metadata.year ? String(metadata.year) : null,
    metadata.venueShort ?? metadata.venue,
    metadata.doi ? `DOI ${metadata.doi}` : null,
    metadata.arxivId ? `arXiv ${metadata.arxivId}` : null,
  ].filter((detail): detail is string => Boolean(detail))

  return (
    <section className="grid min-w-0 gap-4 overflow-y-auto overflow-x-hidden pr-1" data-testid="paper-reader-metadata-inspector">
      <div className="flex min-w-0 flex-wrap items-center justify-between gap-2">
        <div className="min-w-0">
          <p className="text-xs font-medium text-foreground">{translate(locale, 'paper.reader.metadata')}</p>
          {details.length > 0 ? (
            <p className="mt-1 truncate text-xs text-muted-foreground">{details.join(' · ')}</p>
          ) : (
            <p className="mt-1 text-xs text-muted-foreground">{translate(locale, 'paper.reader.metadataUnavailable')}</p>
          )}
        </div>
        <StatusPill value={translate(locale, 'paper.reader.metadataConfidence', { confidence: metadataConfidenceLabel(metadata.confidence) })} />
      </div>
      <div className="flex flex-wrap items-center gap-2">
        {onRefreshMetadata ? (
          <Button type="button" variant="secondary" size="xs" disabled={metadataPending || !metadataReadyForAction} onClick={onRefreshMetadata}>
            <ArrowCounterClockwise className="size-4" />
            {metadataPending ? translate(locale, 'paper.reader.metadataRefreshing') : translate(locale, 'paper.reader.refreshMetadata')}
          </Button>
        ) : null}
        {metadata.status === 'needs_review' ? (
          <Button type="button" variant="outline" size="xs" onClick={() => onSaveMetadata(metadataValuesFromCurrent(metadata))}>
            {translate(locale, 'paper.reader.keepCurrentMetadata')}
          </Button>
        ) : null}
      </div>
      {metadata.candidates.length > 0 ? (
        <div className="mt-3 grid min-w-0 gap-2" data-testid="paper-reader-metadata-candidates">
          <p className="text-xs font-medium text-foreground">{translate(locale, 'paper.reader.metadataNeedsReview')}</p>
          {metadata.candidates.map((candidate) => (
            <div key={candidate.id} className="flex min-w-0 flex-wrap items-center justify-between gap-2 rounded-md bg-background/70 px-2 py-2 text-xs">
              <span className="min-w-0 truncate text-muted-foreground">
                {candidate.metadata.title ?? candidate.reason}
              </span>
              <Button type="button" variant="secondary" size="xs" onClick={() => onApplyCandidate(candidate.id)}>
                {translate(locale, 'paper.reader.applyMetadataCandidate')}
              </Button>
            </div>
          ))}
        </div>
      ) : null}
      <div className="grid min-w-0 gap-3">
        <label className="grid min-w-0 gap-1 text-xs font-medium text-foreground">
          {translate(locale, 'paper.reader.metadataTitle')}
          <Input value={form.title} onChange={(event) => setForm(current => ({ ...current, title: event.target.value }))} />
        </label>
        <label className="grid min-w-0 gap-1 text-xs font-medium text-foreground">
          {translate(locale, 'paper.reader.metadataAuthors')}
          <Textarea
            className="min-h-20 min-w-0 resize-y"
            value={form.authors}
            onChange={(event) => setForm(current => ({ ...current, authors: event.target.value }))}
          />
        </label>
        <div className="grid min-w-0 gap-3 sm:grid-cols-2">
          <label className="grid min-w-0 gap-1 text-xs font-medium text-foreground">
            {translate(locale, 'paper.reader.metadataYear')}
            <Input value={form.year} onChange={(event) => setForm(current => ({ ...current, year: event.target.value }))} />
          </label>
          <label className="grid min-w-0 gap-1 text-xs font-medium text-foreground">
            {translate(locale, 'paper.reader.metadataVenue')}
            <Input value={form.venue} onChange={(event) => setForm(current => ({ ...current, venue: event.target.value }))} />
          </label>
          <label className="grid min-w-0 gap-1 text-xs font-medium text-foreground">
            {translate(locale, 'paper.reader.metadataVenueShort')}
            <Input value={form.venueShort} onChange={(event) => setForm(current => ({ ...current, venueShort: event.target.value }))} />
          </label>
          <label className="grid min-w-0 gap-1 text-xs font-medium text-foreground">
            {translate(locale, 'paper.reader.metadataDoi')}
            <Input value={form.doi} onChange={(event) => setForm(current => ({ ...current, doi: event.target.value }))} />
          </label>
          <label className="grid min-w-0 gap-1 text-xs font-medium text-foreground sm:col-span-2">
            {translate(locale, 'paper.reader.metadataArxivId')}
            <Input value={form.arxivId} onChange={(event) => setForm(current => ({ ...current, arxivId: event.target.value }))} />
          </label>
        </div>
      </div>
      <DialogFooter>
        <DialogClose asChild>
          <Button type="button" variant="outline">{translate(locale, 'common.cancel')}</Button>
        </DialogClose>
        <Button type="button" onClick={() => onSaveMetadata(metadataValuesFromForm(form, metadata))}>
          {translate(locale, 'common.save')}
        </Button>
      </DialogFooter>
    </section>
  )
}

export function PaperMetadataPanel({
  locale,
  metadataError,
  metadataReadyForAction,
  metadataPending,
  metadataResult,
  metadata,
  onApplyMetadataCandidate,
  onSaveMetadata,
  onParsePaper,
  onRefreshMetadata,
  onSelectPdfMode,
  onSelectReadMode,
  parsePaperPending,
  parseProvider,
  summary,
}: {
  locale: AppLocale
  metadataError: unknown
  metadataReadyForAction: boolean
  metadataPending: boolean
  metadataResult: PaperMetadataReadResult | null
  metadata: NonNullable<ReturnType<typeof paperMetadataForReader>>
  onApplyMetadataCandidate: (candidateId: string) => void
  onSaveMetadata: (values: PaperMetadataValues) => void
  onParsePaper?: () => void
  onRefreshMetadata?: () => void
  onSelectPdfMode: () => void
  onSelectReadMode: () => void
  parsePaperPending: boolean
  parseProvider?: PaperParserProvider
  summary: ReturnType<typeof paperReaderSummary>
}) {
  const [metadataDialogOpen, setMetadataDialogOpen] = useState(false)
  const resolvedMetadata = metadataResult?.metadata ?? null

  return (
    <section className="border-b border-border px-5 py-4" data-testid="paper-reader-metadata">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs font-medium uppercase text-muted-foreground">{translate(locale, 'paper.reader.paper')}</p>
          <h1 className="truncate text-xl font-semibold text-foreground">{metadata.title}</h1>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <TabsList aria-label={translate(locale, 'paper.reader.modeTabs')} className="h-8">
            <TabsTrigger value="markdown" className="h-7 px-3 text-xs" onClick={onSelectReadMode}>
              {translate(locale, 'paper.reader.modeRead')}
            </TabsTrigger>
            <TabsTrigger value="pdf" className="h-7 px-3 text-xs" onClick={onSelectPdfMode}>
              PDF
            </TabsTrigger>
          </TabsList>
          {onParsePaper ? (
            <Button
              type="button"
              variant="secondary"
              size="sm"
              disabled={parsePaperPending}
              onClick={onParsePaper}
            >
              <MagnifyingGlass className="size-4" />
              {paperParseButtonLabel(locale, parseProvider, parsePaperPending)}
            </Button>
          ) : null}
          {onRefreshMetadata ? (
            <Dialog open={metadataDialogOpen} onOpenChange={setMetadataDialogOpen}>
              <Button type="button" variant="secondary" size="sm" onClick={() => setMetadataDialogOpen(true)}>
                <ClipboardText className="size-4" />
                {translate(locale, 'paper.reader.metadata')}
              </Button>
              <DialogContent className="max-h-[calc(100vh-4rem)] w-[min(42rem,calc(100vw-2rem))] max-w-[calc(100vw-2rem)] overflow-hidden sm:max-w-2xl">
                <DialogHeader className="min-w-0">
                  <DialogTitle>{translate(locale, 'paper.reader.metadata')}</DialogTitle>
                  <DialogDescription>{translate(locale, 'paper.reader.metadataEditDescription')}</DialogDescription>
                </DialogHeader>
                <PaperMetadataInspector
                  locale={locale}
                  metadata={resolvedMetadata}
                  metadataError={metadataError}
                  metadataPending={metadataPending}
                  metadataReadyForAction={metadataReadyForAction}
                  onApplyCandidate={onApplyMetadataCandidate}
                  onRefreshMetadata={onRefreshMetadata}
                  onSaveMetadata={onSaveMetadata}
                />
              </DialogContent>
            </Dialog>
          ) : null}
        </div>
      </div>
      <span className="sr-only" data-testid="paper-reader-paper-id">{metadata.paperId}</span>
      <span className="sr-only" data-testid="paper-reader-selected-block">{summary.selectedBlockId ?? translate(locale, 'paper.reader.none')}</span>
    </section>
  )
}
