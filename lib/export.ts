"use client"

import { centsToInput, formatDate } from "@/lib/format"

export type ExportRow = {
  date: string
  merchant: string
  category: string
  amountCents: number
  baseAmountCents: number
  currency: string
  taxCents: number
  subtotalCents: number | null
  paymentMethod: string
  cardLast4: string
  invoiceNumber: string
  classification: string
  taxDeductible: boolean
  reimbursable: boolean
  projectName: string
  notes: string
  tags: string[]
  uploader: string
  reviewed: boolean
}

const COLUMNS = [
  "Date",
  "Merchant",
  "Category",
  "Amount",
  "Currency",
  "Amount (base)",
  "Subtotal",
  "Tax",
  "Payment method",
  "Card last 4",
  "Invoice number",
  "Business/Personal",
  "Tax deductible",
  "Reimbursable",
  "Project",
  "Tags",
  "Notes",
  "Added by",
  "Reviewed",
] as const

function toMatrix(rows: ExportRow[], baseCurrency: string) {
  return rows.map((row) => [
    row.date,
    row.merchant,
    row.category,
    Number(centsToInput(row.amountCents, row.currency)),
    row.currency,
    Number(centsToInput(row.baseAmountCents, baseCurrency)),
    row.subtotalCents !== null ? Number(centsToInput(row.subtotalCents, row.currency)) : "",
    Number(centsToInput(row.taxCents, row.currency)),
    row.paymentMethod,
    row.cardLast4,
    row.invoiceNumber,
    row.classification,
    row.taxDeductible ? "Yes" : "No",
    row.reimbursable ? "Yes" : "No",
    row.projectName,
    row.tags.join(", "),
    row.notes,
    row.uploader,
    row.reviewed ? "Yes" : "No",
  ])
}

function download(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement("a")
  anchor.href = url
  anchor.download = filename
  document.body.append(anchor)
  anchor.click()
  anchor.remove()
  // Revoke on the next tick so Safari has time to start the download.
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

function safeName(name: string) {
  return name.replace(/[^a-z0-9-_ ]/gi, "").trim().replace(/\s+/g, "-") || "receiptful-export"
}

/** RFC 4180 escaping — quotes doubled, fields with separators quoted. */
function csvCell(value: string | number) {
  const text = String(value ?? "")
  return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text
}

export function exportCsv(rows: ExportRow[], name: string, baseCurrency: string) {
  const matrix = toMatrix(rows, baseCurrency)
  const lines = [COLUMNS.join(","), ...matrix.map((row) => row.map(csvCell).join(","))]
  // The BOM makes Excel open UTF-8 correctly on Windows.
  const blob = new Blob([`﻿${lines.join("\r\n")}`], {
    type: "text/csv;charset=utf-8",
  })
  download(blob, `${safeName(name)}.csv`)
}

/**
 * Loaded on demand: the spreadsheet writer is large and only one button needs
 * it, so it should not sit in the bundle of every screen that can export.
 */
export async function exportExcel(rows: ExportRow[], name: string, baseCurrency: string) {
  const XLSX = await import("xlsx")
  const matrix = toMatrix(rows, baseCurrency)
  const sheet = XLSX.utils.aoa_to_sheet([[...COLUMNS], ...matrix])

  sheet["!cols"] = [
    { wch: 12 }, { wch: 26 }, { wch: 18 }, { wch: 12 }, { wch: 9 }, { wch: 14 },
    { wch: 12 }, { wch: 10 }, { wch: 16 }, { wch: 11 }, { wch: 16 }, { wch: 16 },
    { wch: 14 }, { wch: 13 }, { wch: 18 }, { wch: 24 }, { wch: 40 }, { wch: 20 },
    { wch: 10 },
  ]
  sheet["!autofilter"] = { ref: XLSX.utils.encode_range({
    s: { c: 0, r: 0 },
    e: { c: COLUMNS.length - 1, r: matrix.length },
  }) }

  const book = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(book, sheet, "Expenses")

  const output = XLSX.write(book, { bookType: "xlsx", type: "array" }) as ArrayBuffer
  download(
    new Blob([output], {
      type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    }),
    `${safeName(name)}.xlsx`,
  )
}

/**
 * PDF export goes through the browser's own print-to-PDF. It renders the exact
 * same styled table the user is looking at, needs no dependency, and produces a
 * file every OS can already open.
 */
export function exportPdf(options: {
  title: string
  subtitle: string
  rows: ExportRow[]
  summary: { label: string; value: string }[]
  baseCurrency: string
}) {
  const frame = document.createElement("iframe")
  frame.setAttribute("aria-hidden", "true")
  frame.style.position = "fixed"
  frame.style.right = "0"
  frame.style.bottom = "0"
  frame.style.width = "0"
  frame.style.height = "0"
  frame.style.border = "0"
  document.body.append(frame)

  const doc = frame.contentDocument
  if (!doc) {
    frame.remove()
    return
  }

  const escapeHtml = (value: string) =>
    value.replace(/[&<>"']/g, (character) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character]!,
    )

  doc.open()
  doc.write(`<!doctype html>
<html><head><meta charset="utf-8"><title>${escapeHtml(options.title)}</title>
<style>
  @page { size: A4 landscape; margin: 14mm; }
  * { box-sizing: border-box; }
  body { font-family: ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif; color: #0f172a; margin: 0; }
  h1 { font-size: 18px; margin: 0 0 2px; }
  .sub { font-size: 11px; color: #64748b; margin: 0 0 16px; }
  .summary { display: flex; flex-wrap: wrap; gap: 20px; margin-bottom: 18px; padding-bottom: 14px; border-bottom: 1px solid #e2e8f0; }
  .summary div { min-width: 110px; }
  .summary dt { font-size: 10px; text-transform: uppercase; letter-spacing: .04em; color: #64748b; margin: 0 0 2px; }
  .summary dd { font-size: 15px; font-weight: 600; margin: 0; font-variant-numeric: tabular-nums; }
  table { width: 100%; border-collapse: collapse; font-size: 10px; }
  thead { display: table-header-group; }
  th { text-align: left; border-bottom: 1.5px solid #cbd5e1; padding: 5px 6px; font-size: 9px; text-transform: uppercase; letter-spacing: .03em; color: #475569; }
  td { border-bottom: 1px solid #f1f5f9; padding: 5px 6px; vertical-align: top; }
  tr { break-inside: avoid; }
  .num { text-align: right; font-variant-numeric: tabular-nums; white-space: nowrap; }
  footer { margin-top: 16px; font-size: 9px; color: #94a3b8; }
</style></head>
<body>
  <h1>${escapeHtml(options.title)}</h1>
  <p class="sub">${escapeHtml(options.subtitle)}</p>
  <dl class="summary">
    ${options.summary
      .map(
        (item) =>
          `<div><dt>${escapeHtml(item.label)}</dt><dd>${escapeHtml(item.value)}</dd></div>`,
      )
      .join("")}
  </dl>
  <table>
    <thead><tr>
      <th>Date</th><th>Merchant</th><th>Category</th><th>Payment</th>
      <th class="num">Tax</th><th class="num">Amount</th>
    </tr></thead>
    <tbody>
      ${options.rows
        .map(
          (row) => `<tr>
        <td>${escapeHtml(formatDate(row.date))}</td>
        <td>${escapeHtml(row.merchant || "—")}</td>
        <td>${escapeHtml(row.category)}${row.taxDeductible ? " · deductible" : ""}</td>
        <td>${escapeHtml(row.paymentMethod)}${row.cardLast4 ? ` ••${escapeHtml(row.cardLast4)}` : ""}</td>
        <td class="num">${escapeHtml(centsToInput(row.taxCents, row.currency))}</td>
        <td class="num">${escapeHtml(row.currency)} ${escapeHtml(centsToInput(row.amountCents, row.currency))}</td>
      </tr>`,
        )
        .join("")}
    </tbody>
  </table>
  <footer>Generated by Receiptful on ${escapeHtml(new Date().toLocaleString())} · ${options.rows.length} receipt${options.rows.length === 1 ? "" : "s"}</footer>
</body></html>`)
  doc.close()

  frame.contentWindow?.focus()
  // Give the print stylesheet a tick to apply before opening the dialog.
  setTimeout(() => {
    frame.contentWindow?.print()
    setTimeout(() => frame.remove(), 1000)
  }, 250)
}
