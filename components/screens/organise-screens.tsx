"use client"

import { useMutation, useQuery } from "convex/react"
import {
  ArrowLeft,
  FolderOpen,
  FolderPlus,
  Pencil,
  Plus,
  Tags as TagsIcon,
  Target,
  Trash2,
  Undo2,
} from "lucide-react"
import Link from "next/link"
import { useState } from "react"
import { toast } from "sonner"

import { PageHeader, SectionHeader } from "@/components/common/page-header"
import { EmptyState, ListSkeleton, Spinner } from "@/components/common/states"
import { ReceiptRow } from "@/components/receipts/receipt-item"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Progress } from "@/components/ui/progress"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { api } from "@/convex/_generated/api"
import type { Id } from "@/convex/_generated/dataModel"
import { errorMessage } from "@/lib/errors"
import { confirmDialog } from "@/components/common/confirm"
import { formatMoney, inputToCents } from "@/lib/format"
import { cn } from "@/lib/utils"

const SWATCHES = [
  "#2563eb", "#0ea5e9", "#14b8a6", "#16a34a", "#84cc16",
  "#eab308", "#f97316", "#ef4444", "#ec4899", "#a855f7", "#6366f1", "#64748b",
]

function ColorPicker({
  value,
  onChange,
}: {
  value: string
  onChange: (color: string) => void
}) {
  return (
    <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label="Colour">
      {SWATCHES.map((color) => (
        <button
          key={color}
          type="button"
          role="radio"
          aria-checked={value === color}
          aria-label={`Colour ${color}`}
          onClick={() => onChange(color)}
          className={cn(
            "h-7 w-7 rounded-full border-2 transition-transform focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
            value === color ? "scale-110 border-foreground" : "border-transparent",
          )}
          style={{ backgroundColor: color }}
        />
      ))}
    </div>
  )
}

/* ------------------------------- Folders -------------------------------- */

export function FoldersScreen() {
  const folders = useQuery(api.folders.list)
  const create = useMutation(api.folders.create)
  const update = useMutation(api.folders.update)
  const remove = useMutation(api.folders.remove)

  const [open, setOpen] = useState(false)
  const [editing, setEditing] = useState<Id<"folders"> | null>(null)
  const [name, setName] = useState("")
  const [color, setColor] = useState(SWATCHES[0])

  function startCreate() {
    setEditing(null)
    setName("")
    setColor(SWATCHES[0])
    setOpen(true)
  }

  async function submit() {
    try {
      if (editing) {
        await update({ folderId: editing, name: name.trim(), color })
        toast.success("Folder updated")
      } else {
        await create({ name: name.trim(), color })
        toast.success("Folder created")
      }
      setOpen(false)
    } catch (caught) {
      toast.error(errorMessage(caught))
    }
  }

  return (
    <div className="space-y-5">
      <PageHeader
        title="Folders"
        description="Group receipts however you actually think about them — a client, a trip, a tax year. A receipt can live in several folders at once."
        actions={
          <Button onClick={startCreate}>
            <FolderPlus className="h-4 w-4" />
            New folder
          </Button>
        }
      />

      {folders === undefined ? (
        <ListSkeleton rows={4} />
      ) : folders.length === 0 ? (
        <EmptyState
          icon={FolderOpen}
          title="No folders yet"
          description="Create a folder to keep a project, client or tax year together."
          action={
            <Button onClick={startCreate}>
              <FolderPlus className="h-4 w-4" />
              New folder
            </Button>
          }
        />
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {folders.map((folder) => (
            <li key={folder._id} className="group relative rounded-xl border bg-card p-4">
              <Link
                href={`/dashboard/folders/${folder._id}`}
                className="block focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <span
                  className="flex h-9 w-9 items-center justify-center rounded-lg"
                  style={{ backgroundColor: `${folder.color}1a`, color: folder.color }}
                >
                  <FolderOpen className="h-4 w-4" />
                </span>
                <span className="mt-3 block truncate font-medium">{folder.name}</span>
                <span className="mt-0.5 block text-xs text-muted-foreground">
                  {folder.receiptCount} receipt{folder.receiptCount === 1 ? "" : "s"} ·{" "}
                  {formatMoney(folder.totalCents, "USD", { compact: true })}
                </span>
              </Link>

              <span className="absolute right-2 top-2 flex opacity-0 transition-opacity focus-within:opacity-100 group-hover:opacity-100">
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7"
                  aria-label={`Rename ${folder.name}`}
                  onClick={() => {
                    setEditing(folder._id)
                    setName(folder.name)
                    setColor(folder.color)
                    setOpen(true)
                  }}
                >
                  <Pencil className="h-3.5 w-3.5" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7 text-muted-foreground hover:text-destructive"
                  aria-label={`Delete ${folder.name}`}
                  onClick={async () => {
                    const ok = await confirmDialog({
                      title: `Delete "${folder.name}"?`,
                      description:
                        "Receipts inside stay in the workspace — only the folder is removed.",
                      confirmLabel: "Delete folder",
                      destructive: true,
                    })
                    if (!ok) return
                    try {
                      await remove({ folderId: folder._id })
                      toast.success("Folder deleted")
                    } catch (caught) {
                      toast.error(errorMessage(caught))
                    }
                  }}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </span>
            </li>
          ))}
        </ul>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>{editing ? "Rename folder" : "New folder"}</DialogTitle>
            <DialogDescription>
              Folders are just labels — deleting one never deletes receipts.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="folder-name">Name</Label>
              <Input
                id="folder-name"
                value={name}
                onChange={(event) => setName(event.target.value)}
                placeholder="2026 Taxes"
                autoFocus
              />
            </div>
            <div className="space-y-1.5">
              <Label>Colour</Label>
              <ColorPicker value={color} onChange={setColor} />
            </div>
          </div>

          <DialogFooter>
            <Button variant="ghost" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button onClick={submit} disabled={!name.trim()}>
              {editing ? "Save" : "Create"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

export function FolderDetail({ folderId }: { folderId: Id<"folders"> }) {
  const data = useQuery(api.folders.get, { folderId })

  if (data === undefined) return <Spinner label="Loading folder" />

  return (
    <div className="space-y-5">
      <Button variant="ghost" size="sm" asChild className="-ml-2">
        <Link href="/dashboard/folders">
          <ArrowLeft className="h-4 w-4" />
          All folders
        </Link>
      </Button>

      <PageHeader
        title={data.folder.name}
        description={`${data.receipts.length} receipt${
          data.receipts.length === 1 ? "" : "s"
        } · ${formatMoney(data.totalCents, "USD")}`}
      />

      {data.receipts.length === 0 ? (
        <EmptyState
          icon={FolderOpen}
          title="This folder is empty"
          description="Add receipts to this folder from any receipt's detail page, or select several in the receipts list and use the Folder action."
          action={
            <Button asChild>
              <Link href="/dashboard/receipts">Browse receipts</Link>
            </Button>
          }
        />
      ) : (
        <ul className="space-y-2">
          {data.receipts.map((receipt) => (
            <ReceiptRow key={receipt._id} receipt={receipt} />
          ))}
        </ul>
      )}
    </div>
  )
}

/* --------------------------- Categories & tags --------------------------- */

const TAX_TREATMENTS = [
  { value: "deductible", label: "Fully deductible" },
  { value: "partial", label: "Partially deductible" },
  { value: "non_deductible", label: "Not deductible" },
] as const

export function CategoriesScreen() {
  const categories = useQuery(api.categories.list)
  const tags = useQuery(api.tags.list)

  const createCategory = useMutation(api.categories.create)
  const updateCategory = useMutation(api.categories.update)
  const removeCategory = useMutation(api.categories.remove)
  const createTag = useMutation(api.tags.create)
  const removeTag = useMutation(api.tags.remove)

  const [open, setOpen] = useState(false)
  const [editing, setEditing] = useState<Id<"categories"> | null>(null)
  const [name, setName] = useState("")
  const [color, setColor] = useState(SWATCHES[0])
  const [treatment, setTreatment] =
    useState<(typeof TAX_TREATMENTS)[number]["value"]>("deductible")
  const [percent, setPercent] = useState("100")
  const [keywords, setKeywords] = useState("")
  const [newTag, setNewTag] = useState("")

  function startCreate() {
    setEditing(null)
    setName("")
    setColor(SWATCHES[0])
    setTreatment("deductible")
    setPercent("100")
    setKeywords("")
    setOpen(true)
  }

  async function submitCategory() {
    const parsedKeywords = keywords
      .split(",")
      .map((keyword) => keyword.trim().toLowerCase())
      .filter(Boolean)

    try {
      if (editing) {
        await updateCategory({
          categoryId: editing,
          name: name.trim(),
          color,
          taxTreatment: treatment,
          deductiblePercent: Number(percent) || 0,
          keywords: parsedKeywords,
        })
        toast.success("Category updated")
      } else {
        await createCategory({
          name: name.trim(),
          color,
          icon: "Receipt",
          taxTreatment: treatment,
          deductiblePercent: Number(percent) || 0,
          keywords: parsedKeywords,
        })
        toast.success("Category created")
      }
      setOpen(false)
    } catch (caught) {
      toast.error(errorMessage(caught))
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Categories & tags"
        description="Categories drive auto-sorting and tax treatment. Tags are free-form labels you can stack on any receipt."
        actions={
          <Button onClick={startCreate}>
            <Plus className="h-4 w-4" />
            New category
          </Button>
        }
      />

      <section className="rounded-xl border bg-card">
        <div className="border-b p-4">
          <SectionHeader
            title="Categories"
            description="Keywords here are matched against the merchant name and line items when a receipt is scanned."
          />
        </div>

        {categories === undefined ? (
          <div className="p-4">
            <ListSkeleton rows={5} />
          </div>
        ) : (
          <ul className="divide-y">
            {categories.map((category) => (
              <li key={category._id} className="flex flex-wrap items-center gap-3 p-4">
                <span
                  aria-hidden
                  className="h-8 w-8 shrink-0 rounded-lg"
                  style={{ backgroundColor: `${category.color}26` }}
                >
                  <span
                    className="block h-full w-full rounded-lg border-2"
                    style={{ borderColor: category.color }}
                  />
                </span>

                <span className="min-w-0 flex-1">
                  <span className="flex flex-wrap items-center gap-2">
                    <span className="font-medium">{category.name}</span>
                    {category.isSystem ? (
                      <Badge variant="secondary" className="text-[10px]">
                        Built-in
                      </Badge>
                    ) : null}
                    <Badge variant="outline" className="text-[10px]">
                      {category.taxTreatment === "deductible"
                        ? "Deductible"
                        : category.taxTreatment === "partial"
                          ? `${category.deductiblePercent}% deductible`
                          : "Not deductible"}
                    </Badge>
                  </span>
                  <span className="mt-0.5 block truncate text-xs text-muted-foreground">
                    {category.receiptCount} receipt{category.receiptCount === 1 ? "" : "s"}
                    {category.keywords.length > 0
                      ? ` · matches ${category.keywords.slice(0, 4).join(", ")}${
                          category.keywords.length > 4 ? "…" : ""
                        }`
                      : ""}
                  </span>
                </span>

                <span className="shrink-0 text-sm font-medium font-numeric">
                  {formatMoney(category.totalCents, "USD", { compact: true })}
                </span>

                <span className="flex shrink-0">
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8"
                    aria-label={`Edit ${category.name}`}
                    onClick={() => {
                      setEditing(category._id)
                      setName(category.name)
                      setColor(category.color)
                      setTreatment(category.taxTreatment)
                      setPercent(String(category.deductiblePercent))
                      setKeywords(category.keywords.join(", "))
                      setOpen(true)
                    }}
                  >
                    <Pencil className="h-3.5 w-3.5" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 text-muted-foreground hover:text-destructive"
                    aria-label={`Delete ${category.name}`}
                    onClick={async () => {
                      const ok = await confirmDialog({
                        title: `Delete "${category.name}"?`,
                        description: `Its ${category.receiptCount} receipt${
                          category.receiptCount === 1 ? "" : "s"
                        } become uncategorised. Nothing is deleted.`,
                        confirmLabel: "Delete category",
                        destructive: true,
                      })
                      if (!ok) return
                      try {
                        const moved = await removeCategory({ categoryId: category._id })
                        toast.success(
                          moved > 0
                            ? `Category deleted · ${moved} receipts uncategorised`
                            : "Category deleted",
                        )
                      } catch (caught) {
                        toast.error(errorMessage(caught))
                      }
                    }}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="rounded-xl border bg-card p-4">
        <SectionHeader title="Tags" description="Stack as many as you like on a receipt." />

        <form
          className="mt-3 flex gap-2"
          onSubmit={async (event) => {
            event.preventDefault()
            if (!newTag.trim()) return
            try {
              await createTag({ name: newTag })
              setNewTag("")
              toast.success("Tag added")
            } catch (caught) {
              toast.error(errorMessage(caught))
            }
          }}
        >
          <Input
            value={newTag}
            onChange={(event) => setNewTag(event.target.value)}
            placeholder="Add a tag…"
            aria-label="New tag name"
            maxLength={40}
          />
          <Button type="submit" disabled={!newTag.trim()}>
            Add
          </Button>
        </form>

        {tags === undefined ? (
          <p className="mt-4 text-sm text-muted-foreground">Loading…</p>
        ) : tags.length === 0 ? (
          <p className="mt-4 text-sm text-muted-foreground">
            No tags yet. Tags are handy for things a category can&rsquo;t express — a client, a
            trip, or &ldquo;needs a receipt copy&rdquo;.
          </p>
        ) : (
          <ul className="mt-4 flex flex-wrap gap-2">
            {tags.map((tag) => (
              <li
                key={tag._id}
                className="flex items-center gap-1.5 rounded-full border py-1 pl-3 pr-1 text-sm"
              >
                <TagsIcon className="h-3 w-3 text-muted-foreground" />
                {tag.name}
                <span className="text-xs font-numeric text-muted-foreground">
                  {tag.usageCount}
                </span>
                <button
                  type="button"
                  aria-label={`Delete tag ${tag.name}`}
                  onClick={async () => {
                    const ok = await confirmDialog({
                      title: `Delete the "${tag.name}" tag?`,
                      description: `It is removed from all ${tag.usageCount} receipt${
                        tag.usageCount === 1 ? "" : "s"
                      } using it.`,
                      confirmLabel: "Delete tag",
                      destructive: true,
                    })
                    if (!ok) return
                    await removeTag({ tagId: tag._id })
                    toast.success("Tag deleted")
                  }}
                  className="rounded-full p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-destructive"
                >
                  <Trash2 className="h-3 w-3" />
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{editing ? "Edit category" : "New category"}</DialogTitle>
            <DialogDescription>
              Keywords let new receipts sort themselves into this category automatically.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="category-name">Name</Label>
              <Input
                id="category-name"
                value={name}
                onChange={(event) => setName(event.target.value)}
                placeholder="Client entertainment"
                autoFocus
              />
            </div>

            <div className="space-y-1.5">
              <Label>Colour</Label>
              <ColorPicker value={color} onChange={setColor} />
            </div>

            <div className="space-y-1.5">
              <Label>Tax treatment</Label>
              <Select
                value={treatment}
                onValueChange={(next) => {
                  const value = next as typeof treatment
                  setTreatment(value)
                  setPercent(value === "deductible" ? "100" : value === "partial" ? "50" : "0")
                }}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {TAX_TREATMENTS.map((item) => (
                    <SelectItem key={item.value} value={item.value}>
                      {item.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {treatment === "partial" ? (
              <div className="space-y-1.5">
                <Label htmlFor="percent">Deductible percentage</Label>
                <Input
                  id="percent"
                  type="number"
                  min={0}
                  max={100}
                  value={percent}
                  onChange={(event) => setPercent(event.target.value)}
                />
              </div>
            ) : null}

            <div className="space-y-1.5">
              <Label htmlFor="keywords">Matching keywords</Label>
              <Input
                id="keywords"
                value={keywords}
                onChange={(event) => setKeywords(event.target.value)}
                placeholder="starbucks, cafe, coffee"
              />
              <p className="text-xs text-muted-foreground">
                Comma separated. Matched against the merchant name and line items.
              </p>
            </div>
          </div>

          <DialogFooter>
            <Button variant="ghost" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button onClick={submitCategory} disabled={!name.trim()}>
              {editing ? "Save" : "Create"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

/* -------------------------------- Budgets -------------------------------- */

export function BudgetsScreen() {
  const budgets = useQuery(api.budgets.list, {})
  const categories = useQuery(api.categories.list)
  const create = useMutation(api.budgets.create)
  const remove = useMutation(api.budgets.remove)

  const [open, setOpen] = useState(false)
  const [name, setName] = useState("")
  const [scope, setScope] = useState<"workspace" | "category">("workspace")
  const [categoryId, setCategoryId] = useState<string>("")
  const [period, setPeriod] = useState<"monthly" | "quarterly" | "yearly">("monthly")
  const [limit, setLimit] = useState("")
  const [threshold, setThreshold] = useState("80")

  async function submit() {
    try {
      await create({
        name: name.trim(),
        scope,
        categoryId: scope === "category" ? (categoryId as Id<"categories">) : undefined,
        period,
        limitCents: inputToCents(limit),
        alertThresholdPercent: Number(threshold) || 80,
      })
      toast.success("Budget created")
      setOpen(false)
      setName("")
      setLimit("")
    } catch (caught) {
      toast.error(errorMessage(caught))
    }
  }

  return (
    <div className="space-y-5">
      <PageHeader
        title="Budgets"
        description="Set a ceiling and we'll warn you before you hit it — not after."
        actions={
          <Button
            onClick={() => {
              setName("")
              setLimit("")
              setOpen(true)
            }}
          >
            <Plus className="h-4 w-4" />
            New budget
          </Button>
        }
      />

      {budgets === undefined ? (
        <ListSkeleton rows={3} />
      ) : budgets.length === 0 ? (
        <EmptyState
          icon={Target}
          title="No budgets yet"
          description="Create a monthly limit for the whole workspace or a single category. We'll notify you at your alert threshold and again if you go over."
          action={<Button onClick={() => setOpen(true)}>Create a budget</Button>}
        />
      ) : (
        <ul className="grid gap-4 sm:grid-cols-2">
          {budgets.map((budget) => (
            <li key={budget._id} className="rounded-xl border bg-card p-5">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="truncate font-medium">{budget.name}</p>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    {budget.period} ·{" "}
                    {budget.categoryName ? budget.categoryName : "Whole workspace"} ·{" "}
                    {budget.receiptCount} receipt{budget.receiptCount === 1 ? "" : "s"}
                  </p>
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 shrink-0 text-muted-foreground hover:text-destructive"
                  aria-label={`Delete ${budget.name}`}
                  onClick={async () => {
                    const ok = await confirmDialog({
                      title: `Delete the "${budget.name}" budget?`,
                      description: "Spending is unaffected — only the limit and its alerts go.",
                      confirmLabel: "Delete budget",
                      destructive: true,
                    })
                    if (!ok) return
                    await remove({ budgetId: budget._id })
                    toast.success("Budget deleted")
                  }}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </div>

              <div className="mt-4 flex items-baseline justify-between gap-2">
                <span className="text-xl font-semibold font-numeric">
                  {formatMoney(budget.spentCents, "USD")}
                </span>
                <span className="text-sm text-muted-foreground font-numeric">
                  of {formatMoney(budget.limitCents, "USD")}
                </span>
              </div>

              <Progress
                value={Math.min(100, budget.percentUsed)}
                className={cn(
                  "mt-2",
                  budget.status === "exceeded" && "[&>div]:bg-destructive",
                  budget.status === "warning" && "[&>div]:bg-amber-500",
                )}
              />

              <p
                className={cn(
                  "mt-2 text-xs",
                  budget.status === "exceeded"
                    ? "font-medium text-destructive"
                    : budget.status === "warning"
                      ? "font-medium text-amber-600 dark:text-amber-400"
                      : "text-muted-foreground",
                )}
              >
                {budget.status === "exceeded"
                  ? `Over by ${formatMoney(Math.abs(budget.remainingCents), "USD")}`
                  : `${formatMoney(budget.remainingCents, "USD")} left · ${budget.percentUsed}% used`}
              </p>
            </li>
          ))}
        </ul>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>New budget</DialogTitle>
            <DialogDescription>
              We&rsquo;ll notify workspace managers once spend crosses your threshold.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="budget-name">Name</Label>
              <Input
                id="budget-name"
                value={name}
                onChange={(event) => setName(event.target.value)}
                placeholder="Monthly travel"
                autoFocus
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Applies to</Label>
                <Select
                  value={scope}
                  onValueChange={(next) => setScope(next as typeof scope)}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="workspace">Whole workspace</SelectItem>
                    <SelectItem value="category">A category</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1.5">
                <Label>Period</Label>
                <Select
                  value={period}
                  onValueChange={(next) => setPeriod(next as typeof period)}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="monthly">Monthly</SelectItem>
                    <SelectItem value="quarterly">Quarterly</SelectItem>
                    <SelectItem value="yearly">Yearly</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            {scope === "category" ? (
              <div className="space-y-1.5">
                <Label>Category</Label>
                <Select value={categoryId} onValueChange={setCategoryId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Choose a category" />
                  </SelectTrigger>
                  <SelectContent>
                    {(categories ?? []).map((category) => (
                      <SelectItem key={category._id} value={category._id}>
                        {category.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            ) : null}

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="budget-limit">Limit</Label>
                <Input
                  id="budget-limit"
                  inputMode="decimal"
                  value={limit}
                  onChange={(event) => setLimit(event.target.value)}
                  placeholder="2000"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="budget-threshold">Alert at %</Label>
                <Input
                  id="budget-threshold"
                  type="number"
                  min={1}
                  max={100}
                  value={threshold}
                  onChange={(event) => setThreshold(event.target.value)}
                />
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button variant="ghost" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={submit}
              disabled={
                !name.trim() ||
                !limit.trim() ||
                (scope === "category" && !categoryId)
              }
            >
              Create budget
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

/* --------------------------------- Trash --------------------------------- */

export function TrashScreen() {
  const receipts = useQuery(api.receipts.trash)
  const restore = useMutation(api.receipts.restore)
  const purge = useMutation(api.receipts.purge)

  return (
    <div className="space-y-5">
      <PageHeader
        title="Trash"
        description="Deleted receipts stay here for 30 days, then they're permanently removed."
        actions={
          receipts && receipts.length > 0 ? (
            <Button
              variant="outline"
              onClick={async () => {
                const ok = await confirmDialog({
                  title: `Permanently delete ${receipts.length} receipt${
                    receipts.length === 1 ? "" : "s"
                  }?`,
                  description:
                    "This erases the receipts and their images for good. It cannot be undone.",
                  confirmLabel: "Delete permanently",
                  destructive: true,
                })
                if (!ok) return
                await purge({ receiptIds: receipts.map((receipt) => receipt._id) })
                toast.success("Trash emptied")
              }}
            >
              <Trash2 className="h-4 w-4" />
              Empty trash
            </Button>
          ) : null
        }
      />

      {receipts === undefined ? (
        <ListSkeleton rows={4} />
      ) : receipts.length === 0 ? (
        <EmptyState
          icon={Trash2}
          title="Trash is empty"
          description="Deleted receipts land here first, so a mis-tap is never permanent."
        />
      ) : (
        <ul className="space-y-2">
          {receipts.map((receipt) => (
            <ReceiptRow
              key={receipt._id}
              receipt={receipt}
              actions={
                <span className="flex gap-1">
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8"
                    aria-label={`Restore ${receipt.merchant || "receipt"}`}
                    onClick={async () => {
                      await restore({ receiptIds: [receipt._id] })
                      toast.success("Receipt restored")
                    }}
                  >
                    <Undo2 className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 text-muted-foreground hover:text-destructive"
                    aria-label={`Permanently delete ${receipt.merchant || "receipt"}`}
                    onClick={async () => {
                      const ok = await confirmDialog({
                        title: "Permanently delete this receipt?",
                        description:
                          "The receipt and its images are erased for good. This cannot be undone.",
                        confirmLabel: "Delete permanently",
                        destructive: true,
                      })
                      if (!ok) return
                      await purge({ receiptIds: [receipt._id] })
                      toast.success("Receipt permanently deleted")
                    }}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </span>
              }
            />
          ))}
        </ul>
      )}
    </div>
  )
}
