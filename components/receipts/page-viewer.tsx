"use client"

import {
  ChevronLeft,
  ChevronRight,
  Download,
  FileText,
  Maximize2,
  RotateCw,
  Trash2,
  ZoomIn,
  ZoomOut,
} from "lucide-react"
import { useState } from "react"

import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogTitle,
} from "@/components/ui/dialog"
import { cn } from "@/lib/utils"

export type ReceiptPage = {
  _id: string
  order: number
  rotation: number
  mimeType: string
  url: string | null
  sizeBytes: number
}

/**
 * Receipt image viewer with zoom, pan, rotate and page navigation. PDFs render
 * in an iframe since browsers already have a capable PDF reader built in.
 */
export function PageViewer({
  pages,
  merchant,
  canEdit,
  onRotate,
  onDelete,
}: {
  pages: ReceiptPage[]
  merchant: string
  canEdit: boolean
  onRotate?: (pageId: string, rotation: number) => void
  onDelete?: (pageId: string) => void
}) {
  const [index, setIndex] = useState(0)
  const [zoom, setZoom] = useState(1)
  const [offset, setOffset] = useState({ x: 0, y: 0 })
  const [dragging, setDragging] = useState(false)
  const [fullscreen, setFullscreen] = useState(false)

  const page = pages[index]

  if (!page) {
    return (
      <div className="flex aspect-[3/4] items-center justify-center rounded-xl border border-dashed">
        <div className="text-center">
          <FileText className="mx-auto h-6 w-6 text-muted-foreground" />
          <p className="mt-2 text-sm text-muted-foreground">No image attached</p>
        </div>
      </div>
    )
  }

  const isPdf = page.mimeType === "application/pdf"

  function step(direction: -1 | 1) {
    setIndex((current) => Math.min(Math.max(0, current + direction), pages.length - 1))
    setZoom(1)
    setOffset({ x: 0, y: 0 })
  }

  const image = (
    <div
      className={cn(
        "relative flex-1 overflow-hidden rounded-lg bg-muted/40",
        zoom > 1 && "cursor-grab active:cursor-grabbing",
      )}
      onPointerDown={(event) => {
        if (zoom <= 1) return
        setDragging(true)
        event.currentTarget.setPointerCapture(event.pointerId)
      }}
      onPointerMove={(event) => {
        if (!dragging) return
        setOffset((current) => ({
          x: current.x + event.movementX,
          y: current.y + event.movementY,
        }))
      }}
      onPointerUp={() => setDragging(false)}
      onDoubleClick={() => {
        setZoom((current) => (current > 1 ? 1 : 2))
        setOffset({ x: 0, y: 0 })
      }}
    >
      {isPdf && page.url ? (
        <iframe
          src={page.url}
          title={`${merchant || "Receipt"} — page ${index + 1}`}
          className="h-full min-h-[28rem] w-full rounded-lg border-0 bg-white"
        />
      ) : page.url ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={page.url}
          alt={`${merchant || "Receipt"} — page ${index + 1} of ${pages.length}`}
          className="h-full w-full select-none object-contain transition-transform duration-150"
          style={{
            transform: `translate(${offset.x}px, ${offset.y}px) scale(${zoom}) rotate(${page.rotation}deg)`,
          }}
          draggable={false}
        />
      ) : (
        <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
          This image is unavailable.
        </div>
      )}
    </div>
  )

  const controls = (
    <div className="flex flex-wrap items-center gap-1">
      {pages.length > 1 ? (
        <>
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8"
            onClick={() => step(-1)}
            disabled={index === 0}
            aria-label="Previous page"
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <span className="px-1 text-xs font-numeric text-muted-foreground">
            {index + 1} / {pages.length}
          </span>
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8"
            onClick={() => step(1)}
            disabled={index === pages.length - 1}
            aria-label="Next page"
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
          <span aria-hidden className="mx-1 h-4 w-px bg-border" />
        </>
      ) : null}

      {!isPdf ? (
        <>
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8"
            onClick={() => setZoom((current) => Math.max(1, current - 0.5))}
            disabled={zoom <= 1}
            aria-label="Zoom out"
          >
            <ZoomOut className="h-4 w-4" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8"
            onClick={() => setZoom((current) => Math.min(5, current + 0.5))}
            disabled={zoom >= 5}
            aria-label="Zoom in"
          >
            <ZoomIn className="h-4 w-4" />
          </Button>
          {canEdit && onRotate ? (
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8"
              onClick={() => onRotate(page._id, page.rotation + 90)}
              aria-label="Rotate page"
            >
              <RotateCw className="h-4 w-4" />
            </Button>
          ) : null}
        </>
      ) : null}

      <Button
        variant="ghost"
        size="icon"
        className="h-8 w-8"
        onClick={() => setFullscreen(true)}
        aria-label="View full screen"
      >
        <Maximize2 className="h-4 w-4" />
      </Button>

      {page.url ? (
        <Button variant="ghost" size="icon" className="h-8 w-8" asChild>
          <a
            href={page.url}
            download={`${merchant || "receipt"}-page-${index + 1}${isPdf ? ".pdf" : ".jpg"}`}
            aria-label="Download this page"
          >
            <Download className="h-4 w-4" />
          </a>
        </Button>
      ) : null}

      {canEdit && onDelete && pages.length > 1 ? (
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8 text-muted-foreground hover:text-destructive"
          onClick={() => {
            onDelete(page._id)
            setIndex(0)
          }}
          aria-label="Delete this page"
        >
          <Trash2 className="h-4 w-4" />
        </Button>
      ) : null}
    </div>
  )

  return (
    <div className="space-y-3">
      <div className="flex aspect-[3/4] flex-col overflow-hidden rounded-xl border bg-card p-2 sm:aspect-[4/5]">
        {image}
      </div>

      <div className="flex items-center justify-between gap-2">
        {controls}
      </div>

      {pages.length > 1 ? (
        <ul className="flex gap-2 overflow-x-auto pb-1">
          {pages.map((item, itemIndex) => (
            <li key={item._id}>
              <button
                type="button"
                onClick={() => {
                  setIndex(itemIndex)
                  setZoom(1)
                  setOffset({ x: 0, y: 0 })
                }}
                aria-label={`Go to page ${itemIndex + 1}`}
                aria-current={itemIndex === index}
                className={cn(
                  "flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-md border-2 transition-colors",
                  itemIndex === index ? "border-primary" : "border-transparent hover:border-border",
                )}
              >
                {item.mimeType === "application/pdf" || !item.url ? (
                  <FileText className="h-4 w-4 text-muted-foreground" />
                ) : (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={item.url} alt="" loading="lazy" className="h-full w-full object-cover" />
                )}
              </button>
            </li>
          ))}
        </ul>
      ) : null}

      <Dialog open={fullscreen} onOpenChange={setFullscreen}>
        <DialogContent className="h-[92dvh] max-w-[95vw] p-3 sm:max-w-5xl">
          <DialogTitle className="sr-only">
            {merchant || "Receipt"} — page {index + 1}
          </DialogTitle>
          <div className="flex h-full flex-col gap-2">
            {image}
            <div className="flex justify-center">{controls}</div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
