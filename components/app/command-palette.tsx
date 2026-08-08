"use client"

import { useQuery } from "convex/react"
import { Camera, CornerDownLeft, Receipt, Search } from "lucide-react"
import { useRouter } from "next/navigation"
import { useEffect, useState } from "react"

import { useCapture } from "@/components/capture/capture-provider"
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from "@/components/ui/command"
import { api } from "@/convex/_generated/api"
import { NAV_SECTIONS, SECONDARY_NAV } from "@/components/app/nav-config"
import { formatDate, formatMoney } from "@/lib/format"

export function CommandPalette({
  open,
  onOpenChange,
  capabilities,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  capabilities: Record<string, boolean>
}) {
  const router = useRouter()
  const capture = useCapture()
  const [term, setTerm] = useState("")
  const [debounced, setDebounced] = useState("")

  // Debounce so a fast typist doesn't fire a query per keystroke.
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(term), 180)
    return () => clearTimeout(timer)
  }, [term])

  const receipts = useQuery(
    api.receipts.quickSearch,
    debounced.trim().length > 1 ? { term: debounced.trim(), limit: 6 } : "skip",
  )

  useEffect(() => {
    if (!open) setTerm("")
  }, [open])

  function go(href: string) {
    onOpenChange(false)
    router.push(href)
  }

  const navItems = [
    ...NAV_SECTIONS.flatMap((section) => section.items),
    ...SECONDARY_NAV,
  ].filter((item) => !item.capability || capabilities[item.capability])

  return (
    <CommandDialog
      open={open}
      onOpenChange={onOpenChange}
      title="Search Receiptful"
      description="Search receipts by merchant, amount, note or any text on the receipt."
    >
      <CommandInput
        placeholder="Search receipts, or jump to a page…"
        value={term}
        onValueChange={setTerm}
      />
      <CommandList>
        <CommandEmpty>
          {debounced.trim().length > 1
            ? "No matches. Try a merchant name, an amount, or a word from the receipt."
            : "Type to search receipts."}
        </CommandEmpty>

        {receipts && receipts.length > 0 ? (
          <>
            <CommandGroup heading="Receipts">
              {receipts.map((receipt) => (
                <CommandItem
                  key={receipt._id}
                  value={`receipt-${receipt._id}`}
                  onSelect={() => go(`/dashboard/receipts/${receipt._id}`)}
                >
                  <Receipt className="h-4 w-4" />
                  <span className="flex-1 truncate">
                    {receipt.merchant || "Untitled receipt"}
                  </span>
                  <span className="text-xs font-numeric text-muted-foreground">
                    {formatMoney(receipt.amountCents, receipt.currency)} ·{" "}
                    {formatDate(receipt.date, { short: true })}
                  </span>
                </CommandItem>
              ))}
            </CommandGroup>
            <CommandSeparator />
          </>
        ) : null}

        <CommandGroup heading="Actions">
          <CommandItem
            value="capture add receipt scan upload"
            onSelect={() => {
              onOpenChange(false)
              capture.open()
            }}
          >
            <Camera className="h-4 w-4" />
            Add receipts
          </CommandItem>
          <CommandItem
            value="search all receipts"
            onSelect={() =>
              go(
                debounced.trim()
                  ? `/dashboard/receipts?q=${encodeURIComponent(debounced.trim())}`
                  : "/dashboard/receipts",
              )
            }
          >
            <Search className="h-4 w-4" />
            {debounced.trim() ? `Search all receipts for “${debounced.trim()}”` : "Browse all receipts"}
            <CornerDownLeft className="ml-auto h-3 w-3 text-muted-foreground" />
          </CommandItem>
        </CommandGroup>

        <CommandSeparator />

        <CommandGroup heading="Go to">
          {navItems.map((item) => (
            <CommandItem
              key={item.href}
              value={`${item.label} ${item.description ?? ""}`}
              onSelect={() => go(item.href)}
            >
              <item.icon className="h-4 w-4" />
              {item.label}
            </CommandItem>
          ))}
        </CommandGroup>
      </CommandList>
    </CommandDialog>
  )
}
