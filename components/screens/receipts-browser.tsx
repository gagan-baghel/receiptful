"use client"

import { usePaginatedQuery, useMutation, useQuery } from "convex/react"
import {
  Bookmark,
  Camera,
  Check,
  ChevronDown,
  FolderPlus,
  LayoutGrid,
  List,
  Loader2,
  Receipt as ReceiptIcon,
  Search,
  SlidersHorizontal,
  Tag as TagIcon,
  Trash2,
  X,
} from "lucide-react"
import { useRouter, useSearchParams } from "next/navigation"
import { useCallback, useEffect, useMemo, useState } from "react"
import { toast } from "sonner"

import { useCapture } from "@/components/capture/capture-provider"
import { PageHeader } from "@/components/common/page-header"
import { EmptyState, ListSkeleton } from "@/components/common/states"
import {
  ReceiptCard,
  ReceiptRow,
  type ReceiptSummary,
} from "@/components/receipts/receipt-item"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet"
import { api } from "@/convex/_generated/api"
import type { Id } from "@/convex/_generated/dataModel"
import { promptDialog } from "@/components/common/confirm"
import { useHaptics } from "@/hooks/use-haptics"
import { errorMessage } from "@/lib/errors"
import { formatMoney, PAYMENT_METHOD_LABELS } from "@/lib/format"
import { cn } from "@/lib/utils"

type Filters = {
  search?: string
  from?: string
  to?: string
  categoryIds?: Id<"categories">[]
  tagIds?: Id<"tags">[]
  folderIds?: Id<"folders">[]
  paymentMethods?: string[]
  minCents?: number
  maxCents?: number
  taxDeductible?: boolean
  reimbursable?: boolean
  classification?: "business" | "personal"
  needsReview?: boolean
  archived?: boolean
  sort?: string
}

const GROUPINGS = [
  { value: "month", label: "Group by month" },
  { value: "category", label: "Group by category" },
  { value: "merchant", label: "Group by merchant" },
  { value: "classification", label: "Business / personal" },
  { value: "none", label: "No grouping" },
] as const

type Grouping = (typeof GROUPINGS)[number]["value"]

type GroupedReceipts = {
  key: string
  label: string
  sublabel?: string
  color?: string
  receipts: ReceiptSummary[]
  totalCents: number
}

const MONTH_LABEL = new Intl.DateTimeFormat("en-US", {
  month: "long",
  year: "numeric",
  timeZone: "UTC",
})

/** Buckets a page of receipts for display. Order within a group is preserved. */
function groupReceipts(receipts: ReceiptSummary[], grouping: Grouping): GroupedReceipts[] {
  if (grouping === "none") {
    return [
      {
        key: "all",
        label: "All receipts",
        receipts,
        totalCents: receipts.reduce((total, receipt) => total + receipt.baseAmountCents, 0),
      },
    ]
  }

  const buckets = new Map<string, GroupedReceipts>()

  for (const receipt of receipts) {
    let key: string
    let label: string
    let color: string | undefined

    if (grouping === "month") {
      key = receipt.date.slice(0, 7)
      label = MONTH_LABEL.format(new Date(`${key}-01T00:00:00Z`))
    } else if (grouping === "category") {
      key = receipt.category?._id ?? "uncategorised"
      label = receipt.category?.name ?? "Uncategorised"
      color = receipt.category?.color
    } else if (grouping === "merchant") {
      key = receipt.merchant.toLowerCase() || "unknown"
      label = receipt.merchant || "Unknown merchant"
    } else {
      key = receipt.classification
      label = receipt.classification === "business" ? "Business" : "Personal"
    }

    const bucket = buckets.get(key)
    if (bucket) {
      bucket.receipts.push(receipt)
      bucket.totalCents += receipt.baseAmountCents
    } else {
      buckets.set(key, {
        key,
        label,
        color,
        receipts: [receipt],
        totalCents: receipt.baseAmountCents,
      })
    }
  }

  const groups = [...buckets.values()].map((group) => ({
    ...group,
    sublabel: `${group.receipts.length} receipt${group.receipts.length === 1 ? "" : "s"}`,
  }))

  // Months read newest-first; every other grouping ranks by spend.
  return grouping === "month"
    ? groups.sort((a, b) => b.key.localeCompare(a.key))
    : groups.sort((a, b) => b.totalCents - a.totalCents)
}

const SORTS = [
  { value: "date_desc", label: "Newest first" },
  { value: "date_asc", label: "Oldest first" },
  { value: "amount_desc", label: "Highest amount" },
  { value: "amount_asc", label: "Lowest amount" },
  { value: "merchant_asc", label: "Merchant A–Z" },
  { value: "created_desc", label: "Recently added" },
] as const

function countActive(filters: Filters) {
  let count = 0
  if (filters.from || filters.to) count += 1
  if (filters.categoryIds?.length) count += 1
  if (filters.tagIds?.length) count += 1
  if (filters.folderIds?.length) count += 1
  if (filters.paymentMethods?.length) count += 1
  if (filters.minCents !== undefined || filters.maxCents !== undefined) count += 1
  if (filters.taxDeductible !== undefined) count += 1
  if (filters.reimbursable !== undefined) count += 1
  if (filters.classification) count += 1
  if (filters.needsReview !== undefined) count += 1
  if (filters.archived) count += 1
  return count
}

export function ReceiptsBrowser() {
  const searchParams = useSearchParams()
  const router = useRouter()
  const capture = useCapture()
  const haptics = useHaptics()

  const categories = useQuery(api.categories.list)
  const tags = useQuery(api.tags.list)
  const folders = useQuery(api.folders.list)
  const savedFilters = useQuery(api.savedFilters.list)
  const session = useQuery(api.users.me)

  const bulkUpdate = useMutation(api.receipts.bulkUpdate)
  const setArchived = useMutation(api.receipts.setArchived)
  const removeReceipts = useMutation(api.receipts.remove)
  const saveFilter = useMutation(api.savedFilters.save)

  const [term, setTerm] = useState(searchParams.get("q") ?? "")
  const [view, setView] = useState<"list" | "grid">("list")
  const [grouping, setGrouping] = useState<Grouping>("month")
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [filters, setFilters] = useState<Filters>(() => ({
    needsReview: searchParams.get("review") === "1" ? true : undefined,
    archived: searchParams.get("archived") === "1" ? true : undefined,
    sort: "date_desc",
  }))

  // The manifest's "Capture receipt" shortcut lands here with ?capture=1.
  // Without this the home-screen shortcut just opened the list.
  const captureRequested = searchParams.get("capture") === "1"
  useEffect(() => {
    if (!captureRequested) return
    capture.open()
    // Drop the parameter so a refresh or back-navigation does not reopen it.
    router.replace("/dashboard/receipts")
  }, [capture, captureRequested, router])

  // Debounce the search term so typing doesn't fire a query per keystroke.
  const [debouncedTerm, setDebouncedTerm] = useState(term)
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedTerm(term), 220)
    return () => clearTimeout(timer)
  }, [term])

  const queryFilters = useMemo(
    () => ({
      ...filters,
      search: debouncedTerm.trim() || undefined,
      paymentMethods: filters.paymentMethods as never,
      sort: (filters.sort ?? "date_desc") as never,
    }),
    [debouncedTerm, filters],
  )

  const { results, status, loadMore } = usePaginatedQuery(
    api.receipts.list,
    { filters: queryFilters },
    { initialNumItems: 24 },
  )

  const currency = session?.activeWorkspace?.baseCurrency ?? "USD"
  const activeCount = countActive(filters)

  const toggleSelected = useCallback((id: string) => {
    setSelected((current) => {
      const next = new Set(current)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }, [])

  const selectedIds = useMemo(
    () => [...selected] as Id<"receipts">[],
    [selected],
  )

  const groups = useMemo(() => groupReceipts(results, grouping), [grouping, results])

  const selectedTotal = useMemo(
    () =>
      results
        .filter((receipt) => selected.has(receipt._id))
        .reduce((total, receipt) => total + receipt.baseAmountCents, 0),
    [results, selected],
  )

  async function runBulk(action: () => Promise<unknown>, message: string) {
    try {
      await action()
      haptics("success")
      toast.success(message)
      setSelected(new Set())
    } catch (caught) {
      haptics("error")
      toast.error(errorMessage(caught))
    }
  }

  function updateFilter<K extends keyof Filters>(key: K, value: Filters[K]) {
    setFilters((current) => ({ ...current, [key]: value }))
    setSelected(new Set())
  }

  function clearFilters() {
    setFilters({ sort: filters.sort })
    setTerm("")
  }

  const filterPanel = (
    <div className="space-y-5">
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label htmlFor="from" className="text-xs">
            From
          </Label>
          <Input
            id="from"
            type="date"
            value={filters.from ?? ""}
            onChange={(event) => updateFilter("from", event.target.value || undefined)}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="to" className="text-xs">
            To
          </Label>
          <Input
            id="to"
            type="date"
            value={filters.to ?? ""}
            onChange={(event) => updateFilter("to", event.target.value || undefined)}
          />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label htmlFor="min" className="text-xs">
            Min amount
          </Label>
          <Input
            id="min"
            type="number"
            inputMode="decimal"
            min={0}
            placeholder="0"
            value={filters.minCents !== undefined ? filters.minCents / 100 : ""}
            onChange={(event) =>
              updateFilter(
                "minCents",
                event.target.value ? Math.round(Number(event.target.value) * 100) : undefined,
              )
            }
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="max" className="text-xs">
            Max amount
          </Label>
          <Input
            id="max"
            type="number"
            inputMode="decimal"
            min={0}
            placeholder="Any"
            value={filters.maxCents !== undefined ? filters.maxCents / 100 : ""}
            onChange={(event) =>
              updateFilter(
                "maxCents",
                event.target.value ? Math.round(Number(event.target.value) * 100) : undefined,
              )
            }
          />
        </div>
      </div>

      <fieldset className="space-y-2">
        <legend className="text-xs font-medium">Categories</legend>
        <div className="max-h-40 space-y-1.5 overflow-y-auto pr-1">
          {(categories ?? []).map((category) => (
            <label key={category._id} className="flex items-center gap-2 text-sm">
              <Checkbox
                checked={filters.categoryIds?.includes(category._id) ?? false}
                onCheckedChange={(checked) => {
                  const current = filters.categoryIds ?? []
                  updateFilter(
                    "categoryIds",
                    checked === true
                      ? [...current, category._id]
                      : current.filter((id) => id !== category._id),
                  )
                }}
              />
              <span
                aria-hidden
                className="h-2 w-2 rounded-full"
                style={{ backgroundColor: category.color }}
              />
              <span className="min-w-0 flex-1 truncate">{category.name}</span>
              <span className="text-xs font-numeric text-muted-foreground">
                {category.receiptCount}
              </span>
            </label>
          ))}
        </div>
      </fieldset>

      {tags && tags.length > 0 ? (
        <fieldset className="space-y-2">
          <legend className="text-xs font-medium">Tags</legend>
          <div className="flex flex-wrap gap-1.5">
            {tags.map((tag) => {
              const active = filters.tagIds?.includes(tag._id) ?? false
              return (
                <button
                  key={tag._id}
                  type="button"
                  aria-pressed={active}
                  onClick={() => {
                    const current = filters.tagIds ?? []
                    updateFilter(
                      "tagIds",
                      active ? current.filter((id) => id !== tag._id) : [...current, tag._id],
                    )
                  }}
                  className={cn(
                    "rounded-full border px-2.5 py-1 text-xs transition-colors",
                    active
                      ? "border-primary bg-primary text-primary-foreground"
                      : "hover:bg-accent",
                  )}
                >
                  {tag.name}
                </button>
              )
            })}
          </div>
        </fieldset>
      ) : null}

      {folders && folders.length > 0 ? (
        <fieldset className="space-y-2">
          <legend className="text-xs font-medium">Folders</legend>
          <div className="max-h-32 space-y-1.5 overflow-y-auto pr-1">
            {folders.map((folder) => (
              <label key={folder._id} className="flex items-center gap-2 text-sm">
                <Checkbox
                  checked={filters.folderIds?.includes(folder._id) ?? false}
                  onCheckedChange={(checked) => {
                    const current = filters.folderIds ?? []
                    updateFilter(
                      "folderIds",
                      checked === true
                        ? [...current, folder._id]
                        : current.filter((id) => id !== folder._id),
                    )
                  }}
                />
                <span className="min-w-0 flex-1 truncate">{folder.name}</span>
              </label>
            ))}
          </div>
        </fieldset>
      ) : null}

      <fieldset className="space-y-2">
        <legend className="text-xs font-medium">Payment method</legend>
        <div className="flex flex-wrap gap-1.5">
          {Object.entries(PAYMENT_METHOD_LABELS)
            .filter(([value]) => value !== "unknown")
            .map(([value, label]) => {
              const active = filters.paymentMethods?.includes(value) ?? false
              return (
                <button
                  key={value}
                  type="button"
                  aria-pressed={active}
                  onClick={() => {
                    const current = filters.paymentMethods ?? []
                    updateFilter(
                      "paymentMethods",
                      active
                        ? current.filter((item) => item !== value)
                        : [...current, value],
                    )
                  }}
                  className={cn(
                    "rounded-full border px-2.5 py-1 text-xs transition-colors",
                    active
                      ? "border-primary bg-primary text-primary-foreground"
                      : "hover:bg-accent",
                  )}
                >
                  {label}
                </button>
              )
            })}
        </div>
      </fieldset>

      <fieldset className="space-y-2">
        <legend className="text-xs font-medium">Attributes</legend>
        <label className="flex items-center gap-2 text-sm">
          <Checkbox
            checked={filters.taxDeductible === true}
            onCheckedChange={(checked) =>
              updateFilter("taxDeductible", checked === true ? true : undefined)
            }
          />
          Tax deductible only
        </label>
        <label className="flex items-center gap-2 text-sm">
          <Checkbox
            checked={filters.reimbursable === true}
            onCheckedChange={(checked) =>
              updateFilter("reimbursable", checked === true ? true : undefined)
            }
          />
          Reimbursable only
        </label>
        <label className="flex items-center gap-2 text-sm">
          <Checkbox
            checked={filters.needsReview === true}
            onCheckedChange={(checked) =>
              updateFilter("needsReview", checked === true ? true : undefined)
            }
          />
          Needs review
        </label>
        <label className="flex items-center gap-2 text-sm">
          <Checkbox
            checked={filters.classification === "business"}
            onCheckedChange={(checked) =>
              updateFilter("classification", checked === true ? "business" : undefined)
            }
          />
          Business only
        </label>
        <label className="flex items-center gap-2 text-sm">
          <Checkbox
            checked={filters.archived === true}
            onCheckedChange={(checked) =>
              updateFilter("archived", checked === true ? true : undefined)
            }
          />
          Show archived
        </label>
      </fieldset>

      <div className="flex gap-2 border-t pt-4">
        <Button variant="outline" size="sm" className="flex-1" onClick={clearFilters}>
          Clear all
        </Button>
        <Button
          size="sm"
          className="flex-1"
          onClick={async () => {
            const name = await promptDialog({
              title: "Save this filter",
              description: "It appears in your saved filters and can be shared with the workspace.",
              label: "Filter name",
              placeholder: "Q3 client travel",
              confirmLabel: "Save filter",
              validate: (value) =>
                value.length === 0
                  ? "Give the filter a name."
                  : value.length > 60
                    ? "Keep the name under 60 characters."
                    : null,
            })
            if (!name?.trim()) return
            try {
              await saveFilter({
                name: name.trim(),
                filtersJson: JSON.stringify(filters),
              })
              toast.success("Filter saved")
            } catch (caught) {
              toast.error(errorMessage(caught))
            }
          }}
        >
          <Bookmark className="h-3.5 w-3.5" />
          Save filter
        </Button>
      </div>
    </div>
  )

  return (
    <div className="space-y-5">
      <PageHeader
        title="Receipts"
        description="Search across merchants, amounts, notes, line items and everything the scanner read."
        actions={
          <Button onClick={capture.open}>
            <Camera className="h-4 w-4" />
            Add receipt
          </Button>
        }
      />

      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-0 flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={term}
            onChange={(event) => setTerm(event.target.value)}
            placeholder="Search receipts…"
            className="pl-9 pr-9"
            aria-label="Search receipts"
          />
          {term ? (
            <button
              type="button"
              onClick={() => setTerm("")}
              className="absolute right-2 top-1/2 -translate-y-1/2 rounded-md p-1 text-muted-foreground hover:text-foreground"
              aria-label="Clear search"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          ) : null}
        </div>

        <Sheet>
          <SheetTrigger asChild>
            <Button variant="outline">
              <SlidersHorizontal className="h-4 w-4" />
              Filters
              {activeCount > 0 ? (
                <Badge variant="secondary" className="ml-1 h-5 px-1.5 font-numeric">
                  {activeCount}
                </Badge>
              ) : null}
            </Button>
          </SheetTrigger>
          <SheetContent className="w-full overflow-y-auto sm:max-w-md">
            <SheetHeader>
              <SheetTitle>Filters</SheetTitle>
            </SheetHeader>
            <div className="mt-6">{filterPanel}</div>
          </SheetContent>
        </Sheet>

        {savedFilters && savedFilters.length > 0 ? (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline">
                <Bookmark className="h-4 w-4" />
                Saved
                <ChevronDown className="h-3 w-3" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuLabel className="text-xs">Saved filters</DropdownMenuLabel>
              {savedFilters.map((saved) => (
                <DropdownMenuItem
                  key={saved._id}
                  onSelect={() => {
                    setFilters(saved.filters as Filters)
                    setTerm((saved.filters as Filters).search ?? "")
                  }}
                >
                  {saved.name}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        ) : null}

        <Select
          value={grouping}
          onValueChange={(value) => setGrouping(value as Grouping)}
        >
          <SelectTrigger className="w-[11rem]" aria-label="Group receipts">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {GROUPINGS.map((option) => (
              <SelectItem key={option.value} value={option.value}>
                {option.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select
          value={filters.sort ?? "date_desc"}
          onValueChange={(value) => updateFilter("sort", value)}
        >
          <SelectTrigger className="w-[9.5rem]" aria-label="Sort receipts">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {SORTS.map((sort) => (
              <SelectItem key={sort.value} value={sort.value}>
                {sort.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <div className="flex rounded-lg border p-0.5">
          <Button
            variant={view === "list" ? "secondary" : "ghost"}
            size="icon"
            className="h-8 w-8"
            onClick={() => setView("list")}
            aria-label="List view"
            aria-pressed={view === "list"}
          >
            <List className="h-4 w-4" />
          </Button>
          <Button
            variant={view === "grid" ? "secondary" : "ghost"}
            size="icon"
            className="h-8 w-8"
            onClick={() => setView("grid")}
            aria-label="Grid view"
            aria-pressed={view === "grid"}
          >
            <LayoutGrid className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {activeCount > 0 ? (
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <span>
            {activeCount} filter{activeCount === 1 ? "" : "s"} applied
          </span>
          <Button variant="ghost" size="sm" className="h-6 text-xs" onClick={clearFilters}>
            Clear
          </Button>
        </div>
      ) : null}

      {selected.size > 0 ? (
        <div className="sticky top-16 z-20 flex flex-wrap items-center gap-2 rounded-xl border bg-card p-3 shadow-sm">
          <span className="text-sm font-medium">
            {selected.size} selected · {formatMoney(selectedTotal, currency)}
          </span>

          <div className="ml-auto flex flex-wrap items-center gap-2">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="sm">
                  <TagIcon className="h-3.5 w-3.5" />
                  Category
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="max-h-72 overflow-y-auto">
                {(categories ?? []).map((category) => (
                  <DropdownMenuItem
                    key={category._id}
                    onSelect={() =>
                      runBulk(
                        () =>
                          bulkUpdate({ receiptIds: selectedIds, categoryId: category._id }),
                        `Moved ${selected.size} receipts to ${category.name}`,
                      )
                    }
                  >
                    <span
                      aria-hidden
                      className="h-2 w-2 rounded-full"
                      style={{ backgroundColor: category.color }}
                    />
                    {category.name}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>

            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="sm">
                  <FolderPlus className="h-3.5 w-3.5" />
                  Folder
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="max-h-72 overflow-y-auto">
                {(folders ?? []).map((folder) => (
                  <DropdownMenuItem
                    key={folder._id}
                    onSelect={() =>
                      runBulk(
                        () =>
                          bulkUpdate({ receiptIds: selectedIds, addFolderIds: [folder._id] }),
                        `Added ${selected.size} receipts to ${folder.name}`,
                      )
                    }
                  >
                    {folder.name}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>

            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="sm">
                  Tags
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="max-h-72 overflow-y-auto">
                {(tags ?? []).map((tag) => (
                  <DropdownMenuCheckboxItem
                    key={tag._id}
                    checked={false}
                    onSelect={() =>
                      runBulk(
                        () => bulkUpdate({ receiptIds: selectedIds, addTagIds: [tag._id] }),
                        `Tagged ${selected.size} receipts`,
                      )
                    }
                  >
                    {tag.name}
                  </DropdownMenuCheckboxItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>

            <Button
              variant="outline"
              size="sm"
              onClick={() =>
                runBulk(
                  () => setArchived({ receiptIds: selectedIds, archived: !filters.archived }),
                  filters.archived ? "Restored from archive" : "Archived",
                )
              }
            >
              {filters.archived ? "Unarchive" : "Archive"}
            </Button>

            <Button
              variant="outline"
              size="sm"
              className="text-destructive"
              onClick={() =>
                runBulk(
                  () => removeReceipts({ receiptIds: selectedIds }),
                  `Moved ${selected.size} receipts to trash`,
                )
              }
            >
              <Trash2 className="h-3.5 w-3.5" />
              Delete
            </Button>

            <Button variant="ghost" size="sm" onClick={() => setSelected(new Set())}>
              <X className="h-3.5 w-3.5" />
            </Button>
          </div>
        </div>
      ) : null}

      {status === "LoadingFirstPage" ? (
        <ListSkeleton rows={8} />
      ) : results.length === 0 ? (
        <EmptyState
          icon={debouncedTerm || activeCount > 0 ? Search : ReceiptIcon}
          title={
            debouncedTerm || activeCount > 0
              ? "No receipts match"
              : filters.archived
                ? "Nothing archived"
                : "No receipts yet"
          }
          description={
            debouncedTerm || activeCount > 0
              ? "Try a different search term, or widen the filters."
              : "Add a receipt and it will show up here with everything already filled in."
          }
          action={
            debouncedTerm || activeCount > 0 ? (
              <Button variant="outline" onClick={clearFilters}>
                Clear filters
              </Button>
            ) : (
              <Button onClick={capture.open}>
                <Camera className="h-4 w-4" />
                Add receipt
              </Button>
            )
          }
        />
      ) : (
        <>
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <Checkbox
              checked={selected.size > 0 && selected.size === results.length}
              onCheckedChange={(checked) =>
                setSelected(
                  checked === true ? new Set(results.map((receipt) => receipt._id)) : new Set(),
                )
              }
              aria-label="Select all loaded receipts"
            />
            <span>
              {results.length} loaded
              {status === "CanLoadMore" ? " (more available)" : ""}
            </span>
          </div>

          {view === "list" ? (
            <div className="space-y-6">
              {groups.map((group) => (
                <section key={group.key}>
                  {grouping !== "none" ? (
                    <div className="sticky top-14 z-10 -mx-1 mb-2 flex items-baseline justify-between gap-3 bg-canvas/95 px-1 py-2 backdrop-blur">
                      <h2 className="flex items-center gap-2 text-sm font-semibold">
                        {group.color ? (
                          <span
                            aria-hidden
                            className="h-2 w-2 rounded-full"
                            style={{ backgroundColor: group.color }}
                          />
                        ) : null}
                        {group.label}
                        <span className="font-normal text-muted-foreground">
                          {group.sublabel}
                        </span>
                      </h2>
                      <span className="font-numeric text-sm font-semibold">
                        {formatMoney(group.totalCents, currency)}
                      </span>
                    </div>
                  ) : null}

                  <ul className="space-y-2">
                    {group.receipts.map((receipt) => (
                      <ReceiptRow
                        key={receipt._id}
                        receipt={receipt}
                        selected={selected.has(receipt._id)}
                        onSelectedChange={() => toggleSelected(receipt._id)}
                      />
                    ))}
                  </ul>
                </section>
              ))}
            </div>
          ) : (
            <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              {results.map((receipt) => (
                <ReceiptCard
                  key={receipt._id}
                  receipt={receipt}
                  selected={selected.has(receipt._id)}
                  onSelectedChange={() => toggleSelected(receipt._id)}
                />
              ))}
            </ul>
          )}

          {status === "CanLoadMore" ? (
            <div className="flex justify-center pt-2">
              <Button variant="outline" onClick={() => loadMore(24)}>
                Load more
              </Button>
            </div>
          ) : status === "LoadingMore" ? (
            <div className="flex justify-center py-4">
              <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
            </div>
          ) : (
            <p className="py-2 text-center text-xs text-muted-foreground">
              <Check className="mr-1 inline h-3 w-3" />
              That&rsquo;s everything
            </p>
          )}
        </>
      )}
    </div>
  )
}
