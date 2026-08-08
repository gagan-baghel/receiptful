"use client"

import {
  Camera,
  CameraOff,
  FileText,
  ImagePlus,
  Layers,
  Loader2,
  Pencil,
  Trash2,
  Upload,
  X,
  ChevronLeft,
  ChevronRight,
} from "lucide-react"
import { useRouter } from "next/navigation"
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react"
import { toast } from "sonner"

import { PageEditor } from "@/components/capture/page-editor"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Progress } from "@/components/ui/progress"
import { Switch } from "@/components/ui/switch"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { useHaptics } from "@/hooks/use-haptics"
import { useReceiptUpload, type PendingPage } from "@/hooks/use-receipt-upload"
import { errorMessage } from "@/lib/errors"
import {
  canvasToBlob,
  canvasToDataUrl,
  downscale,
  fileToCanvas,
  isImageFile,
  isPdfFile,
} from "@/lib/image"
import { cn } from "@/lib/utils"

const ACCEPTED = "image/jpeg,image/png,image/webp,image/heic,image/heif,application/pdf"
const MAX_PAGES = 25

type CaptureContextValue = { open: () => void; addFiles: (files: FileList | File[]) => void }

const CaptureContext = createContext<CaptureContextValue | null>(null)

export function useCapture() {
  const context = useContext(CaptureContext)
  if (!context) throw new Error("useCapture must be used inside CaptureProvider")
  return context
}

function newId() {
  return Math.random().toString(36).slice(2, 11)
}

export function CaptureProvider({ children }: { children: ReactNode }) {
  const [isOpen, setIsOpen] = useState(false)
  const [pages, setPages] = useState<PendingPage[]>([])
  const [editing, setEditing] = useState<string | null>(null)
  const [combine, setCombine] = useState(false)
  const [processing, setProcessing] = useState(false)
  const [dropActive, setDropActive] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [tab, setTab] = useState("upload")

  const router = useRouter()
  const haptics = useHaptics()
  const { upload, progress, reset: resetUpload } = useReceiptUpload()

  const videoRef = useRef<HTMLVideoElement>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const [cameraError, setCameraError] = useState<string | null>(null)
  const [cameraReady, setCameraReady] = useState(false)

  const stopCamera = useCallback(() => {
    streamRef.current?.getTracks().forEach((track) => track.stop())
    streamRef.current = null
    setCameraReady(false)
  }, [])

  const startCamera = useCallback(async () => {
    setCameraError(null)
    if (!navigator.mediaDevices?.getUserMedia) {
      setCameraError("This browser can't access a camera. Upload a photo instead.")
      return
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: { ideal: "environment" },
          width: { ideal: 2560 },
          height: { ideal: 1440 },
        },
        audio: false,
      })
      streamRef.current = stream
      if (videoRef.current) {
        videoRef.current.srcObject = stream
        await videoRef.current.play().catch(() => undefined)
      }
      setCameraReady(true)
    } catch (caught) {
      const name = caught instanceof DOMException ? caught.name : ""
      setCameraError(
        name === "NotAllowedError"
          ? "Camera access was blocked. Allow it in your browser settings, or upload a photo instead."
          : name === "NotFoundError"
            ? "No camera was found on this device. Upload a photo instead."
            : "The camera could not be started. Upload a photo instead.",
      )
    }
  }, [])

  useEffect(() => {
    if (isOpen && tab === "camera") {
      void startCamera()
      return stopCamera
    }
    stopCamera()
    return undefined
  }, [isOpen, startCamera, stopCamera, tab])

  useEffect(() => {
    return () => {
      pages.forEach((page) => {
        if (page.previewUrl.startsWith("blob:")) URL.revokeObjectURL(page.previewUrl)
      })
    }
    // Cleanup only on unmount — page-level revokes happen where pages are removed.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const addFiles = useCallback(
    async (incoming: FileList | File[]) => {
      const files = Array.from(incoming)
      if (files.length === 0) return

      setError(null)
      setProcessing(true)

      try {
        const next: PendingPage[] = []

        for (const file of files) {
          if (pages.length + next.length >= MAX_PAGES) {
            setError(`A receipt can hold at most ${MAX_PAGES} pages.`)
            break
          }

          if (isPdfFile(file)) {
            if (file.size > 20 * 1024 * 1024) {
              setError(`${file.name} is larger than 20 MB.`)
              continue
            }
            next.push({
              id: newId(),
              blob: file,
              mimeType: "application/pdf",
              previewUrl: "",
              fileName: file.name,
            })
            continue
          }

          if (!isImageFile(file)) {
            setError(`${file.name} isn't a supported image or PDF.`)
            continue
          }

          const canvas = downscale(await fileToCanvas(file))
          const blob = await canvasToBlob(canvas)
          next.push({
            id: newId(),
            blob,
            mimeType: "image/jpeg",
            width: canvas.width,
            height: canvas.height,
            previewUrl: canvasToDataUrl(canvas, 0.6),
            canvas,
            fileName: file.name.replace(/\.[^.]+$/, ".jpg"),
          })
        }

        if (next.length > 0) {
          setPages((current) => [...current, ...next])
          // Several files at once is usually a batch of separate receipts.
          if (next.length > 1) setCombine(false)
          haptics("success")
        }
      } catch (caught) {
        setError(errorMessage(caught, "Those files couldn't be read."))
      } finally {
        setProcessing(false)
      }
    },
    [haptics, pages.length],
  )

  const open = useCallback(() => {
    resetUpload()
    setError(null)
    setIsOpen(true)
  }, [resetUpload])

  const contextValue = useMemo<CaptureContextValue>(
    () => ({
      open,
      addFiles: (files) => {
        open()
        void addFiles(files)
      },
    }),
    [addFiles, open],
  )

  function capturePhoto() {
    const video = videoRef.current
    if (!video || !cameraReady) return

    const canvas = document.createElement("canvas")
    canvas.width = video.videoWidth
    canvas.height = video.videoHeight
    const context = canvas.getContext("2d")
    if (!context) return
    context.drawImage(video, 0, 0)

    const scaled = downscale(canvas)
    void canvasToBlob(scaled).then((blob) => {
      setPages((current) => [
        ...current,
        {
          id: newId(),
          blob,
          mimeType: "image/jpeg",
          width: scaled.width,
          height: scaled.height,
          previewUrl: canvasToDataUrl(scaled, 0.6),
          canvas: scaled,
          fileName: `scan-${current.length + 1}.jpg`,
        },
      ])
      // Multiple camera shots are almost always one multi-page document.
      setCombine(true)
      haptics("medium")
    })
  }

  function removePage(id: string) {
    setPages((current) => current.filter((page) => page.id !== id))
    haptics("light")
  }

  function movePage(id: string, direction: -1 | 1) {
    setPages((current) => {
      const index = current.findIndex((page) => page.id === id)
      const target = index + direction
      if (index < 0 || target < 0 || target >= current.length) return current
      const next = [...current]
      ;[next[index], next[target]] = [next[target], next[index]]
      return next
    })
    haptics("light")
  }

  function applyEdit(id: string, canvas: HTMLCanvasElement) {
    void canvasToBlob(canvas).then((blob) => {
      setPages((current) =>
        current.map((page) =>
          page.id === id
            ? {
                ...page,
                blob,
                canvas,
                width: canvas.width,
                height: canvas.height,
                previewUrl: canvasToDataUrl(canvas, 0.6),
              }
            : page,
        ),
      )
      setEditing(null)
    })
  }

  function close() {
    setIsOpen(false)
    setPages([])
    setEditing(null)
    setError(null)
    setCombine(false)
    setTab("upload")
    resetUpload()
    stopCamera()
  }

  async function save() {
    if (pages.length === 0) return

    try {
      const created = await upload(pages, { groupPages: combine || pages.length === 1 })
      haptics("success")

      toast.success(
        created.length === 1
          ? "Receipt uploaded — reading it now"
          : `${created.length} receipts uploaded`,
        {
          description:
            created.length === 1
              ? "We'll extract the details and flag anything that needs your review."
              : "Extraction is running in the background.",
          action:
            created.length === 1
              ? {
                  label: "Open",
                  onClick: () => router.push(`/dashboard/receipts/${created[0]}`),
                }
              : {
                  label: "View all",
                  onClick: () => router.push("/dashboard/receipts"),
                },
        },
      )

      close()
      router.refresh()
    } catch (caught) {
      setError(errorMessage(caught, "The upload didn't finish. Please try again."))
      haptics("error")
    }
  }

  const editingPage = pages.find((page) => page.id === editing)
  const isUploading = progress !== null && progress.value < 1

  return (
    <CaptureContext.Provider value={contextValue}>
      {children}

      <Dialog open={isOpen} onOpenChange={(next) => (next ? setIsOpen(true) : close())}>
        <DialogContent className="max-h-[92dvh] gap-0 overflow-y-auto p-0 sm:max-w-2xl">
          <DialogHeader className="border-b px-6 py-4 text-left">
            <DialogTitle>{editingPage ? "Adjust page" : "Add receipts"}</DialogTitle>
            <DialogDescription>
              {editingPage
                ? "Straighten, crop and brighten before uploading."
                : "Snap a photo, pick images, or drop in a PDF. We read the details for you."}
            </DialogDescription>
          </DialogHeader>

          <div className="px-6 py-5">
            {editingPage?.canvas ? (
              <PageEditor
                source={editingPage.canvas}
                onApply={(canvas) => applyEdit(editingPage.id, canvas)}
                onCancel={() => setEditing(null)}
              />
            ) : (
              <div className="space-y-5">
                {error ? (
                  <Alert variant="destructive">
                    <AlertDescription>{error}</AlertDescription>
                  </Alert>
                ) : null}

                <Tabs value={tab} onValueChange={setTab}>
                  <TabsList className="grid w-full grid-cols-2">
                    <TabsTrigger value="upload">
                      <Upload className="h-3.5 w-3.5" />
                      Upload
                    </TabsTrigger>
                    <TabsTrigger value="camera">
                      <Camera className="h-3.5 w-3.5" />
                      Camera
                    </TabsTrigger>
                  </TabsList>

                  <TabsContent value="upload" className="mt-4">
                    <label
                      onDragOver={(event) => {
                        event.preventDefault()
                        setDropActive(true)
                      }}
                      onDragLeave={() => setDropActive(false)}
                      onDrop={(event) => {
                        event.preventDefault()
                        setDropActive(false)
                        void addFiles(event.dataTransfer.files)
                      }}
                      className={cn(
                        "flex cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed px-6 py-10 text-center transition-colors",
                        dropActive
                          ? "border-primary bg-primary/5"
                          : "hover:border-foreground/30 hover:bg-accent/40",
                      )}
                    >
                      <input
                        type="file"
                        accept={ACCEPTED}
                        multiple
                        className="sr-only"
                        onChange={(event) => {
                          if (event.target.files) void addFiles(event.target.files)
                          event.target.value = ""
                        }}
                      />
                      <span className="flex h-11 w-11 items-center justify-center rounded-full bg-muted text-muted-foreground">
                        {processing ? (
                          <Loader2 className="h-5 w-5 animate-spin" />
                        ) : (
                          <ImagePlus className="h-5 w-5" />
                        )}
                      </span>
                      <span className="mt-3 text-sm font-medium">
                        {processing ? "Processing images" : "Drop files or browse"}
                      </span>
                      <span className="mt-1 text-xs text-muted-foreground">
                        JPEG, PNG, WebP, HEIC or PDF · up to 20 MB each
                      </span>
                    </label>
                  </TabsContent>

                  <TabsContent value="camera" className="mt-4">
                    {cameraError ? (
                      <div className="flex flex-col items-center rounded-xl border border-dashed px-6 py-10 text-center">
                        <CameraOff className="h-6 w-6 text-muted-foreground" />
                        <p className="mt-3 max-w-xs text-sm text-muted-foreground text-pretty">
                          {cameraError}
                        </p>
                        <Button
                          variant="outline"
                          size="sm"
                          className="mt-4"
                          onClick={() => setTab("upload")}
                        >
                          Upload instead
                        </Button>
                      </div>
                    ) : (
                      <div className="space-y-3">
                        <div className="relative overflow-hidden rounded-xl bg-black">
                          <video
                            ref={videoRef}
                            playsInline
                            muted
                            className="aspect-[3/4] w-full object-cover sm:aspect-video"
                          />
                          <div
                            aria-hidden
                            className="pointer-events-none absolute inset-6 rounded-lg border-2 border-dashed border-white/50"
                          />
                        </div>
                        <Button
                          type="button"
                          className="w-full"
                          onClick={capturePhoto}
                          disabled={!cameraReady}
                        >
                          <Camera className="h-4 w-4" />
                          {pages.length > 0 ? "Capture next page" : "Capture"}
                        </Button>
                      </div>
                    )}
                  </TabsContent>
                </Tabs>

                {pages.length > 0 ? (
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <h3 className="text-sm font-semibold">
                        {pages.length} page{pages.length === 1 ? "" : "s"} ready
                      </h3>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setPages([])}
                        disabled={isUploading}
                      >
                        Clear all
                      </Button>
                    </div>

                    <ul className="space-y-2">
                      {pages.map((page, index) => (
                        <li
                          key={page.id}
                          className="flex items-center gap-3 rounded-lg border p-2"
                        >
                          <span className="flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-md bg-muted">
                            {page.previewUrl ? (
                              // eslint-disable-next-line @next/next/no-img-element
                              <img
                                src={page.previewUrl}
                                alt={`Page ${index + 1}`}
                                className="h-full w-full object-cover"
                              />
                            ) : (
                              <FileText className="h-5 w-5 text-muted-foreground" />
                            )}
                          </span>

                          <span className="min-w-0 flex-1">
                            <span className="block truncate text-sm font-medium">
                              Page {index + 1}
                            </span>
                            <span className="block truncate text-xs text-muted-foreground">
                              {page.mimeType === "application/pdf"
                                ? `PDF · ${Math.round(page.blob.size / 1024)} KB`
                                : `${page.width}×${page.height} · ${Math.round(page.blob.size / 1024)} KB`}
                            </span>
                          </span>

                          <span className="flex shrink-0 items-center gap-0.5">
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8"
                              onClick={() => movePage(page.id, -1)}
                              disabled={index === 0 || isUploading}
                              aria-label={`Move page ${index + 1} earlier`}
                            >
                              <ChevronLeft className="h-4 w-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8"
                              onClick={() => movePage(page.id, 1)}
                              disabled={index === pages.length - 1 || isUploading}
                              aria-label={`Move page ${index + 1} later`}
                            >
                              <ChevronRight className="h-4 w-4" />
                            </Button>
                            {page.canvas ? (
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-8 w-8"
                                onClick={() => setEditing(page.id)}
                                disabled={isUploading}
                                aria-label={`Adjust page ${index + 1}`}
                              >
                                <Pencil className="h-4 w-4" />
                              </Button>
                            ) : null}
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8 text-muted-foreground hover:text-destructive"
                              onClick={() => removePage(page.id)}
                              disabled={isUploading}
                              aria-label={`Remove page ${index + 1}`}
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </span>
                        </li>
                      ))}
                    </ul>

                    {pages.length > 1 ? (
                      <label className="flex items-center justify-between rounded-lg border p-3">
                        <span className="flex items-center gap-2 text-sm">
                          <Layers className="h-4 w-4 text-muted-foreground" />
                          <span>
                            Combine into one receipt
                            <span className="block text-xs text-muted-foreground">
                              {combine
                                ? "All pages belong to a single multi-page receipt."
                                : `Creates ${pages.length} separate receipts.`}
                            </span>
                          </span>
                        </span>
                        <Switch
                          checked={combine}
                          onCheckedChange={setCombine}
                          disabled={isUploading}
                          aria-label="Combine pages into one receipt"
                        />
                      </label>
                    ) : null}
                  </div>
                ) : null}

                {progress ? (
                  <div className="space-y-2">
                    <Progress value={progress.value * 100} />
                    <p className="text-xs text-muted-foreground" role="status" aria-live="polite">
                      {progress.label}
                    </p>
                  </div>
                ) : null}
              </div>
            )}
          </div>

          {!editingPage ? (
            <div className="sticky bottom-0 flex items-center justify-end gap-2 border-t bg-background px-6 py-4">
              <Button variant="ghost" onClick={close} disabled={isUploading}>
                <X className="h-4 w-4" />
                Cancel
              </Button>
              <Button onClick={save} disabled={pages.length === 0 || isUploading || processing}>
                {isUploading ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Uploading
                  </>
                ) : (
                  <>
                    <Upload className="h-4 w-4" />
                    {combine || pages.length <= 1
                      ? "Save receipt"
                      : `Save ${pages.length} receipts`}
                  </>
                )}
              </Button>
            </div>
          ) : null}
        </DialogContent>
      </Dialog>
    </CaptureContext.Provider>
  )
}
