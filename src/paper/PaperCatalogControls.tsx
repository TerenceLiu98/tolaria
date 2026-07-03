import { WarningCircle } from '@phosphor-icons/react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import type { PaperCatalogEntry, PaperCatalogFilters } from './catalog'

type PaperCatalogControlsProps = {
  entries: PaperCatalogEntry[]
  filteredCount: number
  filters: PaperCatalogFilters
  onFiltersChange: (filters: PaperCatalogFilters) => void
}

const ALL = '__all__'

function uniqueOptions(values: Array<string | null>): string[] {
  return [...new Set(values.filter((value): value is string => Boolean(value)))].sort((left, right) => left.localeCompare(right))
}

function setFilterValue(filters: PaperCatalogFilters, key: keyof PaperCatalogFilters, value: string): PaperCatalogFilters {
  return { ...filters, [key]: value === ALL ? undefined : value }
}

export function PaperCatalogControls({ entries, filteredCount, filters, onFiltersChange }: PaperCatalogControlsProps) {
  const venues = uniqueOptions(entries.map(entry => entry.venueShort ?? entry.venue))
  const venueTypes = uniqueOptions(entries.map(entry => entry.venueType))
  const metadataStatuses = uniqueOptions(entries.map(entry => entry.metadataStatus))
  const parseStatuses = uniqueOptions(entries.map(entry => entry.parseStatus))
  const duplicateCount = entries.filter(entry => entry.duplicateState === 'candidate').length

  return (
    <section className="shrink-0 border-b border-border bg-card px-3 py-2" data-testid="paper-catalog-controls">
      <div className="mb-2 flex items-center justify-between gap-2 text-[11px] text-muted-foreground">
        <span>{filteredCount} of {entries.length} papers</span>
        {duplicateCount > 0 && (
          <Button
            type="button"
            variant="ghost"
            size="xs"
            className="h-6 gap-1 px-1.5 text-[11px] text-muted-foreground"
            onClick={() => onFiltersChange({ ...filters, duplicateCandidates: !filters.duplicateCandidates })}
            data-testid="paper-catalog-duplicates-toggle"
          >
            <WarningCircle size={12} />
            {duplicateCount} duplicates
          </Button>
        )}
      </div>
      <Input
        value={filters.query ?? ''}
        onChange={(event) => onFiltersChange({ ...filters, query: event.target.value || undefined })}
        placeholder="Search papers, authors, venues, DOI, arXiv"
        className="mb-2 h-8 text-[12px]"
        data-testid="paper-catalog-search"
      />
      <div className="grid grid-cols-2 gap-2">
        <Select value={filters.venue ?? ALL} onValueChange={(value) => onFiltersChange(setFilterValue(filters, 'venue', value))}>
          <SelectTrigger className="h-8 text-[12px]" aria-label="Venue">
            <SelectValue placeholder="Venue" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>All venues</SelectItem>
            {venues.map(venue => <SelectItem key={venue} value={venue}>{venue}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={filters.venueType ?? ALL} onValueChange={(value) => onFiltersChange(setFilterValue(filters, 'venueType', value))}>
          <SelectTrigger className="h-8 text-[12px]" aria-label="Venue type">
            <SelectValue placeholder="Venue type" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>All types</SelectItem>
            {venueTypes.map(type => <SelectItem key={type} value={type}>{type}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={filters.metadataStatus ?? ALL} onValueChange={(value) => onFiltersChange(setFilterValue(filters, 'metadataStatus', value))}>
          <SelectTrigger className="h-8 text-[12px]" aria-label="Metadata status">
            <SelectValue placeholder="Metadata" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>All metadata</SelectItem>
            {metadataStatuses.map(status => <SelectItem key={status} value={status}>{status}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={filters.parseStatus ?? ALL} onValueChange={(value) => onFiltersChange(setFilterValue(filters, 'parseStatus', value))}>
          <SelectTrigger className="h-8 text-[12px]" aria-label="Parse status">
            <SelectValue placeholder="Parse" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>All parse states</SelectItem>
            {parseStatuses.map(status => <SelectItem key={status} value={status}>{status}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>
    </section>
  )
}
