"use client"

import {
  Crop,
  RotateCcw,
  RotateCw,
  Sparkles,
  Undo2,
  Wand2,
} from "lucide-react"
import { useCallback, useEffect, useMemo, useRef, useState } from "react"

import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { Slider } from "@/components/ui/slider"
import { Switch } from "@/components/ui/switch"
import { useHaptics } from "@/hooks/use-haptics"
import {
  adjust,
  detectDocumentQuad,
  enhanceForReading,
  rotate,
  warpPerspective,
  type Point,
  type Quad,
} from "@/lib/image"
import { cn } from "@/lib/utils"

const HANDLE_LABELS = ["Top left", "Top right", "Bottom right", "Bottom left"]

function fullQuad(width: number, height: number): Quad {
  return [
    { x: 0, y: 0 },
    { x: width, y: 0 },
    { x: width, y: height },
    { x: 0, y: height },
  ]
}

function quadsEqual(a: Quad, b: Quad) {
  return a.every((point, index) => point.x === b[index].x && point.y === b[index].y)
}

export function PageEditor({
  source,
  onApply,
  onCancel,
}: {
  source: HTMLCanvasElement
  onApply: (canvas: HTMLCanvasElement) => void
  onCancel: () => void
}) {
  const haptics = useHaptics()
  const containerRef = useRef<HTMLDivElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)

  const [rotation, setRotation] = useState(0)
  const [brightness, setBrightness] = useState(100)
  const [contrast, setContrast] = useState(100)
  const [enhance, setEnhance] = useState(false)
  const [cropping, setCropping] = useState(false)
  const [dragging, setDragging] = useState<number | null>(null)

  // The rotated base everything else is measured against.
  const rotated = useMemo(() => rotate(source, rotation), [source, rotation])
  const [quad, setQuad] = useState<Quad>(() => fullQuad(source.width, source.height))

  useEffect(() => {
    setQuad(fullQuad(rotated.width, rotated.height))
  }, [rotated])

  const [displaySize, setDisplaySize] = useState({ width: 0, height: 0 })

  useEffect(() => {
    const container = containerRef.current
    if (!container) return

    const measure = () => {
      const available = container.clientWidth
      const maxHeight = Math.min(window.innerHeight * 0.5, 520)
      const scale = Math.min(
        available / rotated.width,
        maxHeight / rotated.height,
        1,
      )
      setDisplaySize({
        width: Math.max(1, Math.round(rotated.width * scale)),
        height: Math.max(1, Math.round(rotated.height * scale)),
      })
    }

    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(container)
    return () => observer.disconnect()
  }, [rotated])

  // Paint the preview whenever any adjustment changes.
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas || displaySize.width === 0) return

    canvas.width = displaySize.width
    canvas.height = displaySize.height

    const context = canvas.getContext("2d")
    if (!context) return

    context.filter = `brightness(${brightness / 100}) contrast(${contrast / 100})`
    context.drawImage(rotated, 0, 0, displaySize.width, displaySize.height)
    context.filter = "none"
  }, [brightness, contrast, displaySize, rotated])

  const toDisplay = useCallback(
    (point: Point) => ({
      x: (point.x / rotated.width) * displaySize.width,
      y: (point.y / rotated.height) * displaySize.height,
    }),
    [displaySize, rotated],
  )

  const handlePointerMove = useCallback(
    (event: React.PointerEvent) => {
      if (dragging === null) return
      const canvas = canvasRef.current
      if (!canvas) return

      const bounds = canvas.getBoundingClientRect()
      const x = ((event.clientX - bounds.left) / bounds.width) * rotated.width
      const y = ((event.clientY - bounds.top) / bounds.height) * rotated.height

      setQuad((current) => {
        const next = [...current] as Quad
        next[dragging] = {
          x: Math.min(Math.max(0, x), rotated.width),
          y: Math.min(Math.max(0, y), rotated.height),
        }
        return next
      })
    },
    [dragging, rotated],
  )

  const autoDetect = useCallback(() => {
    const detected = detectDocumentQuad(rotated)
    if (detected) {
      setQuad(detected)
      setCropping(true)
      haptics("success")
    } else {
      haptics("warning")
    }
    return detected !== null
  }, [haptics, rotated])

  const [autoFailed, setAutoFailed] = useState(false)

  const isCropped = !quadsEqual(quad, fullQuad(rotated.width, rotated.height))
  const isModified =
    isCropped || rotation !== 0 || brightness !== 100 || contrast !== 100 || enhance

  function reset() {
    setRotation(0)
    setBrightness(100)
    setContrast(100)
    setEnhance(false)
    setCropping(false)
    setAutoFailed(false)
    setQuad(fullQuad(source.width, source.height))
  }

  function apply() {
    let result = rotate(source, rotation)
    if (isCropped) result = warpPerspective(result, quad)
    if (brightness !== 100 || contrast !== 100) {
      result = adjust(result, { brightness: brightness / 100, contrast: contrast / 100 })
    }
    if (enhance) result = enhanceForReading(result)
    haptics("success")
    onApply(result)
  }

  return (
    <div className="space-y-4">
      <div
        ref={containerRef}
        className="relative flex items-center justify-center overflow-hidden rounded-xl bg-muted/40 p-3"
      >
        <div className="relative" style={{ width: displaySize.width, height: displaySize.height }}>
          <canvas
            ref={canvasRef}
            className="block h-full w-full rounded-lg shadow-sm"
            onPointerMove={handlePointerMove}
            onPointerUp={() => setDragging(null)}
            onPointerLeave={() => setDragging(null)}
          />

          {cropping && displaySize.width > 0 ? (
            <>
              <svg
                className="pointer-events-none absolute inset-0 h-full w-full"
                aria-hidden
              >
                <polygon
                  points={quad.map((point) => {
                    const display = toDisplay(point)
                    return `${display.x},${display.y}`
                  }).join(" ")}
                  className="fill-primary/10 stroke-primary"
                  strokeWidth={2}
                />
              </svg>

              {quad.map((point, index) => {
                const display = toDisplay(point)
                return (
                  <button
                    key={index}
                    type="button"
                    aria-label={`${HANDLE_LABELS[index]} corner`}
                    onPointerDown={(event) => {
                      event.currentTarget.setPointerCapture(event.pointerId)
                      setDragging(index)
                      haptics("light")
                    }}
                    onPointerUp={() => setDragging(null)}
                    onKeyDown={(event) => {
                      const step = event.shiftKey ? 20 : 5
                      const deltas: Record<string, [number, number]> = {
                        ArrowLeft: [-step, 0],
                        ArrowRight: [step, 0],
                        ArrowUp: [0, -step],
                        ArrowDown: [0, step],
                      }
                      const delta = deltas[event.key]
                      if (!delta) return
                      event.preventDefault()
                      setQuad((current) => {
                        const next = [...current] as Quad
                        next[index] = {
                          x: Math.min(Math.max(0, next[index].x + delta[0]), rotated.width),
                          y: Math.min(Math.max(0, next[index].y + delta[1]), rotated.height),
                        }
                        return next
                      })
                    }}
                    className={cn(
                      "absolute h-7 w-7 -translate-x-1/2 -translate-y-1/2 touch-none rounded-full border-2 border-primary bg-background shadow-md transition-transform focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                      dragging === index && "scale-125",
                    )}
                    style={{ left: display.x, top: display.y }}
                  />
                )
              })}
            </>
          ) : null}
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => {
            setRotation((value) => value - 90)
            haptics("light")
          }}
        >
          <RotateCcw className="h-3.5 w-3.5" />
          Rotate left
        </Button>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => {
            setRotation((value) => value + 90)
            haptics("light")
          }}
        >
          <RotateCw className="h-3.5 w-3.5" />
          Rotate right
        </Button>
        <Button
          type="button"
          variant={cropping ? "default" : "outline"}
          size="sm"
          onClick={() => {
            setCropping((value) => !value)
            haptics("light")
          }}
        >
          <Crop className="h-3.5 w-3.5" />
          {cropping ? "Done cropping" : "Crop & straighten"}
        </Button>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => setAutoFailed(!autoDetect())}
        >
          <Wand2 className="h-3.5 w-3.5" />
          Auto-detect edges
        </Button>
        {isModified ? (
          <Button type="button" variant="ghost" size="sm" onClick={reset}>
            <Undo2 className="h-3.5 w-3.5" />
            Reset
          </Button>
        ) : null}
      </div>

      {autoFailed ? (
        <p className="text-xs text-muted-foreground" role="status">
          Couldn&rsquo;t find the receipt edges automatically. Drag the corners to set them
          yourself.
        </p>
      ) : null}

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <Label htmlFor="brightness" className="text-xs">
              Brightness
            </Label>
            <span className="text-xs font-numeric text-muted-foreground">{brightness}%</span>
          </div>
          <Slider
            id="brightness"
            min={50}
            max={180}
            step={5}
            value={[brightness]}
            onValueChange={([value]) => setBrightness(value)}
          />
        </div>

        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <Label htmlFor="contrast" className="text-xs">
              Contrast
            </Label>
            <span className="text-xs font-numeric text-muted-foreground">{contrast}%</span>
          </div>
          <Slider
            id="contrast"
            min={50}
            max={220}
            step={5}
            value={[contrast]}
            onValueChange={([value]) => setContrast(value)}
          />
        </div>
      </div>

      <label className="flex items-center justify-between rounded-lg border p-3">
        <span className="flex items-center gap-2 text-sm">
          <Sparkles className="h-4 w-4 text-muted-foreground" />
          <span>
            Sharpen for reading
            <span className="block text-xs text-muted-foreground">
              Boosts faded thermal print before extraction.
            </span>
          </span>
        </span>
        <Switch checked={enhance} onCheckedChange={setEnhance} aria-label="Sharpen for reading" />
      </label>

      <div className="flex justify-end gap-2 border-t pt-4">
        <Button type="button" variant="ghost" onClick={onCancel}>
          Cancel
        </Button>
        <Button type="button" onClick={apply}>
          Apply changes
        </Button>
      </div>
    </div>
  )
}
