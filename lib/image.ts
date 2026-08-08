/**
 * Client-side receipt image pipeline. Everything runs on a canvas in the
 * browser so a 12 MP phone photo becomes a ~300 KB upload before it ever
 * touches the network — cheaper storage, faster OCR, less of the user's data.
 */

export type Point = { x: number; y: number }
export type Quad = [Point, Point, Point, Point]

export const MAX_DIMENSION = 2400
export const JPEG_QUALITY = 0.86

export function isImageFile(file: File) {
  return file.type.startsWith("image/")
}

export function isPdfFile(file: File) {
  return file.type === "application/pdf"
}

export async function fileToCanvas(file: File): Promise<HTMLCanvasElement> {
  const bitmap = await createImageBitmap(file).catch(async () => {
    // Safari/HEIC fall back to an <img> decode.
    const url = URL.createObjectURL(file)
    try {
      const image = new Image()
      image.decoding = "async"
      await new Promise<void>((resolve, reject) => {
        image.onload = () => resolve()
        image.onerror = () => reject(new Error("This image could not be read."))
        image.src = url
      })
      return image as unknown as ImageBitmap
    } finally {
      URL.revokeObjectURL(url)
    }
  })

  const canvas = document.createElement("canvas")
  canvas.width = bitmap.width
  canvas.height = bitmap.height
  const context = canvas.getContext("2d")
  if (!context) throw new Error("Your browser blocked image processing.")
  context.drawImage(bitmap as CanvasImageSource, 0, 0)
  if ("close" in bitmap && typeof bitmap.close === "function") bitmap.close()
  return canvas
}

/** Scales down so the longest edge is at most `maxDimension`. Never upscales. */
export function downscale(source: HTMLCanvasElement, maxDimension = MAX_DIMENSION) {
  const longest = Math.max(source.width, source.height)
  if (longest <= maxDimension) return source

  const scale = maxDimension / longest
  const canvas = document.createElement("canvas")
  canvas.width = Math.round(source.width * scale)
  canvas.height = Math.round(source.height * scale)

  const context = canvas.getContext("2d")
  if (!context) return source
  context.imageSmoothingQuality = "high"
  context.drawImage(source, 0, 0, canvas.width, canvas.height)
  return canvas
}

export function rotate(source: HTMLCanvasElement, degrees: number) {
  const normalized = ((Math.round(degrees / 90) * 90) % 360 + 360) % 360
  if (normalized === 0) return source

  const swap = normalized === 90 || normalized === 270
  const canvas = document.createElement("canvas")
  canvas.width = swap ? source.height : source.width
  canvas.height = swap ? source.width : source.height

  const context = canvas.getContext("2d")
  if (!context) return source
  context.translate(canvas.width / 2, canvas.height / 2)
  context.rotate((normalized * Math.PI) / 180)
  context.drawImage(source, -source.width / 2, -source.height / 2)
  return canvas
}

/**
 * Brightness/contrast/saturation in one pass.
 * `brightness` and `contrast` are multipliers where 1 means unchanged.
 */
export function adjust(
  source: HTMLCanvasElement,
  { brightness = 1, contrast = 1, grayscale = false } = {},
) {
  if (brightness === 1 && contrast === 1 && !grayscale) return source

  const canvas = document.createElement("canvas")
  canvas.width = source.width
  canvas.height = source.height

  const context = canvas.getContext("2d")
  if (!context) return source

  context.filter = [
    `brightness(${brightness})`,
    `contrast(${contrast})`,
    grayscale ? "grayscale(1)" : "",
  ]
    .filter(Boolean)
    .join(" ")

  context.drawImage(source, 0, 0)
  context.filter = "none"
  return canvas
}

/**
 * Stretches the image histogram so faint thermal-printer ink separates from
 * the paper. This is the single biggest win for OCR accuracy on receipts.
 */
export function enhanceForReading(source: HTMLCanvasElement) {
  const canvas = document.createElement("canvas")
  canvas.width = source.width
  canvas.height = source.height

  const context = canvas.getContext("2d", { willReadFrequently: true })
  if (!context) return source
  context.drawImage(source, 0, 0)

  const image = context.getImageData(0, 0, canvas.width, canvas.height)
  const data = image.data

  const histogram = new Uint32Array(256)
  for (let index = 0; index < data.length; index += 4) {
    const luminance =
      (data[index] * 299 + data[index + 1] * 587 + data[index + 2] * 114) / 1000
    histogram[luminance | 0] += 1
  }

  // Clip the darkest and lightest 1% so specular glare doesn't set the range.
  const totalPixels = data.length / 4
  const clip = Math.max(1, Math.floor(totalPixels * 0.01))

  let low = 0
  let accumulated = 0
  while (low < 255 && accumulated + histogram[low] < clip) {
    accumulated += histogram[low]
    low += 1
  }

  let high = 255
  accumulated = 0
  while (high > low && accumulated + histogram[high] < clip) {
    accumulated += histogram[high]
    high -= 1
  }

  const span = Math.max(1, high - low)
  const lookup = new Uint8ClampedArray(256)
  for (let value = 0; value < 256; value += 1) {
    lookup[value] = ((value - low) / span) * 255
  }

  for (let index = 0; index < data.length; index += 4) {
    data[index] = lookup[data[index]]
    data[index + 1] = lookup[data[index + 1]]
    data[index + 2] = lookup[data[index + 2]]
  }

  context.putImageData(image, 0, 0)
  return canvas
}

/**
 * Finds the receipt's corners by locating the largest bright region against a
 * darker background, then taking its extreme points. Good enough for the common
 * "receipt on a desk" shot; the user can always drag the corners afterwards.
 */
export function detectDocumentQuad(source: HTMLCanvasElement): Quad | null {
  const sampleWidth = 220
  const scale = sampleWidth / source.width
  const sampleHeight = Math.max(1, Math.round(source.height * scale))

  const canvas = document.createElement("canvas")
  canvas.width = sampleWidth
  canvas.height = sampleHeight

  const context = canvas.getContext("2d", { willReadFrequently: true })
  if (!context) return null
  context.drawImage(source, 0, 0, sampleWidth, sampleHeight)

  const { data } = context.getImageData(0, 0, sampleWidth, sampleHeight)
  const luminance = new Float32Array(sampleWidth * sampleHeight)

  let total = 0
  for (let index = 0; index < luminance.length; index += 1) {
    const offset = index * 4
    const value =
      (data[offset] * 299 + data[offset + 1] * 587 + data[offset + 2] * 114) / 1000
    luminance[index] = value
    total += value
  }

  const mean = total / luminance.length
  let variance = 0
  for (const value of luminance) variance += (value - mean) ** 2
  const deviation = Math.sqrt(variance / luminance.length)

  // A flat image has no document edge to find — leave it alone.
  if (deviation < 18) return null

  const threshold = mean + deviation * 0.15
  let minX = sampleWidth
  let minY = sampleHeight
  let maxX = 0
  let maxY = 0
  let matched = 0

  for (let y = 0; y < sampleHeight; y += 1) {
    for (let x = 0; x < sampleWidth; x += 1) {
      if (luminance[y * sampleWidth + x] < threshold) continue
      matched += 1
      if (x < minX) minX = x
      if (x > maxX) maxX = x
      if (y < minY) minY = y
      if (y > maxY) maxY = y
    }
  }

  const coverage = matched / luminance.length
  // Too little means we found noise; too much means the whole frame is paper.
  if (coverage < 0.06 || coverage > 0.96) return null

  const inverse = 1 / scale
  const pad = 2
  const left = Math.max(0, (minX - pad) * inverse)
  const right = Math.min(source.width, (maxX + pad) * inverse)
  const top = Math.max(0, (minY - pad) * inverse)
  const bottom = Math.min(source.height, (maxY + pad) * inverse)

  if (right - left < source.width * 0.15 || bottom - top < source.height * 0.15) {
    return null
  }

  return [
    { x: left, y: top },
    { x: right, y: top },
    { x: right, y: bottom },
    { x: left, y: bottom },
  ]
}

/** Solves the 8 unknowns of a projective transform mapping unit rect → quad. */
function solveHomography(quad: Quad, width: number, height: number) {
  const destination: Point[] = [
    { x: 0, y: 0 },
    { x: width, y: 0 },
    { x: width, y: height },
    { x: 0, y: height },
  ]

  // Build the system mapping destination -> source, so we can sample backwards.
  const matrix: number[][] = []
  const vector: number[] = []

  for (let index = 0; index < 4; index += 1) {
    const source = quad[index]
    const target = destination[index]
    matrix.push([target.x, target.y, 1, 0, 0, 0, -target.x * source.x, -target.y * source.x])
    vector.push(source.x)
    matrix.push([0, 0, 0, target.x, target.y, 1, -target.x * source.y, -target.y * source.y])
    vector.push(source.y)
  }

  // Gaussian elimination with partial pivoting.
  const size = 8
  for (let column = 0; column < size; column += 1) {
    let pivot = column
    for (let row = column + 1; row < size; row += 1) {
      if (Math.abs(matrix[row][column]) > Math.abs(matrix[pivot][column])) pivot = row
    }
    if (Math.abs(matrix[pivot][column]) < 1e-10) return null

    ;[matrix[column], matrix[pivot]] = [matrix[pivot], matrix[column]]
    ;[vector[column], vector[pivot]] = [vector[pivot], vector[column]]

    for (let row = 0; row < size; row += 1) {
      if (row === column) continue
      const factor = matrix[row][column] / matrix[column][column]
      if (factor === 0) continue
      for (let col = column; col < size; col += 1) {
        matrix[row][col] -= factor * matrix[column][col]
      }
      vector[row] -= factor * vector[column]
    }
  }

  const coefficients = new Array(size)
  for (let index = 0; index < size; index += 1) {
    coefficients[index] = vector[index] / matrix[index][index]
  }

  return coefficients as [number, number, number, number, number, number, number, number]
}

function quadSize(quad: Quad) {
  const distance = (a: Point, b: Point) => Math.hypot(a.x - b.x, a.y - b.y)
  const width = Math.max(distance(quad[0], quad[1]), distance(quad[3], quad[2]))
  const height = Math.max(distance(quad[0], quad[3]), distance(quad[1], quad[2]))
  return { width: Math.max(1, Math.round(width)), height: Math.max(1, Math.round(height)) }
}

/**
 * Flattens a photographed receipt taken at an angle into a straight-on scan.
 * Corners must be ordered top-left, top-right, bottom-right, bottom-left.
 */
export function warpPerspective(source: HTMLCanvasElement, quad: Quad) {
  const { width, height } = quadSize(quad)
  const coefficients = solveHomography(quad, width, height)
  if (!coefficients) return source

  const readContext = source.getContext("2d", { willReadFrequently: true })
  if (!readContext) return source
  const input = readContext.getImageData(0, 0, source.width, source.height)

  const canvas = document.createElement("canvas")
  canvas.width = width
  canvas.height = height
  const context = canvas.getContext("2d")
  if (!context) return source

  const output = context.createImageData(width, height)
  const [a, b, c, d, e, f, g, h] = coefficients

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const denominator = g * x + h * y + 1
      const sourceX = (a * x + b * y + c) / denominator
      const sourceY = (d * x + e * y + f) / denominator

      const outputOffset = (y * width + x) * 4

      if (
        sourceX < 0 ||
        sourceY < 0 ||
        sourceX >= source.width - 1 ||
        sourceY >= source.height - 1
      ) {
        output.data[outputOffset + 3] = 255
        output.data[outputOffset] = 255
        output.data[outputOffset + 1] = 255
        output.data[outputOffset + 2] = 255
        continue
      }

      // Bilinear sample keeps small text legible after the warp.
      const x0 = Math.floor(sourceX)
      const y0 = Math.floor(sourceY)
      const dx = sourceX - x0
      const dy = sourceY - y0

      for (let channel = 0; channel < 3; channel += 1) {
        const topLeft = input.data[(y0 * source.width + x0) * 4 + channel]
        const topRight = input.data[(y0 * source.width + x0 + 1) * 4 + channel]
        const bottomLeft = input.data[((y0 + 1) * source.width + x0) * 4 + channel]
        const bottomRight = input.data[((y0 + 1) * source.width + x0 + 1) * 4 + channel]

        const top = topLeft + (topRight - topLeft) * dx
        const bottom = bottomLeft + (bottomRight - bottomLeft) * dx
        output.data[outputOffset + channel] = top + (bottom - top) * dy
      }
      output.data[outputOffset + 3] = 255
    }
  }

  context.putImageData(output, 0, 0)
  return canvas
}

export function canvasToBlob(
  canvas: HTMLCanvasElement,
  quality = JPEG_QUALITY,
): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (blob) resolve(blob)
        else reject(new Error("Could not encode the image."))
      },
      "image/jpeg",
      quality,
    )
  })
}

export function canvasToDataUrl(canvas: HTMLCanvasElement, quality = 0.7) {
  return canvas.toDataURL("image/jpeg", quality)
}

/** Small square preview used in the page strip and receipt lists. */
export function makeThumbnail(source: HTMLCanvasElement, size = 320) {
  const canvas = document.createElement("canvas")
  canvas.width = size
  canvas.height = size

  const context = canvas.getContext("2d")
  if (!context) return source

  const scale = Math.max(size / source.width, size / source.height)
  const width = source.width * scale
  const height = source.height * scale

  context.fillStyle = "#ffffff"
  context.fillRect(0, 0, size, size)
  context.imageSmoothingQuality = "high"
  context.drawImage(source, (size - width) / 2, (size - height) / 2, width, height)
  return canvas
}
