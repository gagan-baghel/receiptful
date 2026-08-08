"use client"

import { useMutation } from "convex/react"
import { useCallback, useState } from "react"

import { api } from "@/convex/_generated/api"
import type { Id } from "@/convex/_generated/dataModel"
import { errorMessage } from "@/lib/errors"
import { canvasToBlob, makeThumbnail } from "@/lib/image"

export type PendingPage = {
  id: string
  /** Processed image ready to upload, or the original PDF. */
  blob: Blob
  mimeType: string
  width?: number
  height?: number
  previewUrl: string
  /** Kept so edits re-apply to the original rather than compounding. */
  canvas?: HTMLCanvasElement
  fileName: string
}

export type UploadProgress = {
  /** 0-1 across the whole batch. */
  value: number
  label: string
}

/**
 * Uploads pages straight to Convex storage, then attaches them to a receipt.
 * Each step is retried once, because a single dropped request on a phone
 * network should not cost the user their photo.
 */
export function useReceiptUpload() {
  const generateUploadUrl = useMutation(api.uploads.generateUploadUrl)
  const createReceipt = useMutation(api.receipts.create)
  const attachPage = useMutation(api.uploads.attachPage)
  const finalize = useMutation(api.uploads.finalize)

  const [progress, setProgress] = useState<UploadProgress | null>(null)
  const [error, setError] = useState<string | null>(null)

  const uploadBlob = useCallback(
    async (blob: Blob, fileName: string): Promise<Id<"_storage">> => {
      let lastError: unknown

      for (let attempt = 0; attempt < 2; attempt += 1) {
        try {
          const url = await generateUploadUrl()
          const response = await fetch(url, {
            method: "POST",
            headers: { "Content-Type": blob.type || "application/octet-stream" },
            body: blob,
          })

          if (!response.ok) {
            throw new Error(`Upload failed for ${fileName} (${response.status}).`)
          }

          const { storageId } = (await response.json()) as { storageId: Id<"_storage"> }
          return storageId
        } catch (caught) {
          lastError = caught
        }
      }

      throw lastError instanceof Error
        ? lastError
        : new Error(`Could not upload ${fileName}.`)
    },
    [generateUploadUrl],
  )

  /**
   * @param groupPages when true all pages land on one receipt (a multi-page
   * invoice); when false each page becomes its own receipt (a batch).
   */
  const upload = useCallback(
    async (
      pages: PendingPage[],
      options: { groupPages: boolean; runOcr?: boolean } = { groupPages: true },
    ): Promise<Id<"receipts">[]> => {
      if (pages.length === 0) return []

      setError(null)
      const groups = options.groupPages ? [pages] : pages.map((page) => [page])
      const created: Id<"receipts">[] = []

      let completedSteps = 0
      const totalSteps = pages.length + groups.length

      const advance = (label: string) => {
        completedSteps += 1
        setProgress({ value: completedSteps / totalSteps, label })
      }

      try {
        for (const group of groups) {
          setProgress({ value: completedSteps / totalSteps, label: "Creating receipt" })
          const receiptId = await createReceipt({})
          created.push(receiptId)

          for (const [index, page] of group.entries()) {
            const storageId = await uploadBlob(page.blob, page.fileName)
            await attachPage({
              receiptId,
              storageId,
              order: index,
              width: page.width,
              height: page.height,
            })

            // The first page doubles as the receipt's list thumbnail.
            if (index === 0 && page.canvas) {
              try {
                const thumbnail = await canvasToBlob(makeThumbnail(page.canvas), 0.7)
                const thumbnailId = await uploadBlob(thumbnail, "thumbnail.jpg")
                await attachPage({ receiptId, storageId: thumbnailId, isThumbnail: true })
              } catch {
                // A missing thumbnail is cosmetic — never fail the upload for it.
              }
            }

            advance(`Uploaded ${completedSteps} of ${pages.length}`)
          }

          await finalize({ receiptId, runOcr: options.runOcr ?? true })
          advance("Reading receipt")
        }

        setProgress({ value: 1, label: "Done" })
        return created
      } catch (caught) {
        setError(errorMessage(caught, "The upload didn't finish. Please try again."))
        setProgress(null)
        throw caught
      }
    },
    [attachPage, createReceipt, finalize, uploadBlob],
  )

  const reset = useCallback(() => {
    setProgress(null)
    setError(null)
  }, [])

  return { upload, uploadBlob, progress, error, reset }
}
