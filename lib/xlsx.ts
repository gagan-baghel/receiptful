/**
 * A minimal .xlsx writer.
 *
 * Replaces the `xlsx` package, which carries unpatched prototype-pollution and
 * ReDoS advisories with no fix available upstream, and which shipped roughly
 * 400 KB into the browser bundle to write a single sheet.
 *
 * An .xlsx file is a ZIP of five small XML parts. Strings are written inline
 * so there is no shared-string table to maintain, and entries are STORED
 * (uncompressed) so no deflate implementation is needed — a spreadsheet of a
 * few thousand expense rows is well under a megabyte either way.
 */

export type Cell = string | number

const CRC_TABLE = (() => {
  const table = new Uint32Array(256)
  for (let index = 0; index < 256; index += 1) {
    let value = index
    for (let bit = 0; bit < 8; bit += 1) {
      value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1
    }
    table[index] = value >>> 0
  }
  return table
})()

function crc32(bytes: Uint8Array): number {
  let crc = 0xffffffff
  for (let index = 0; index < bytes.length; index += 1) {
    crc = CRC_TABLE[(crc ^ bytes[index]) & 0xff] ^ (crc >>> 8)
  }
  return (crc ^ 0xffffffff) >>> 0
}

function escapeXml(value: string): string {
  return value.replace(/[&<>"']/g, (character) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&apos;" })[character]!,
  )
}

/** Strips characters Excel rejects outright in a cell value. */
function sanitize(value: string): string {
  // Control characters other than tab/newline/CR are illegal in XML content.
  // eslint-disable-next-line no-control-regex
  return value.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, "")
}

/** 0 → A, 25 → Z, 26 → AA. */
export function columnName(index: number): string {
  let name = ""
  let remaining = index
  while (remaining >= 0) {
    name = String.fromCharCode(65 + (remaining % 26)) + name
    remaining = Math.floor(remaining / 26) - 1
  }
  return name
}

function cellXml(cell: Cell, reference: string, styleId: number): string {
  const style = styleId ? ` s="${styleId}"` : ""

  if (typeof cell === "number" && Number.isFinite(cell)) {
    return `<c r="${reference}"${style}><v>${cell}</v></c>`
  }

  const text = sanitize(String(cell ?? ""))
  if (!text) return `<c r="${reference}"${style}/>`

  return `<c r="${reference}"${style} t="inlineStr"><is><t xml:space="preserve">${escapeXml(
    text,
  )}</t></is></c>`
}

function sheetXml(rows: Cell[][], columnWidths?: number[]): string {
  const lastColumn = columnName(Math.max(0, (rows[0]?.length ?? 1) - 1))

  const cols = columnWidths?.length
    ? `<cols>${columnWidths
        .map(
          (width, index) =>
            `<col min="${index + 1}" max="${index + 1}" width="${width}" customWidth="1"/>`,
        )
        .join("")}</cols>`
    : ""

  const body = rows
    .map((row, rowIndex) => {
      const cells = row
        // Row 1 is the header, which uses the one bold style in styles.xml.
        .map((cell, columnIndex) =>
          cellXml(cell, `${columnName(columnIndex)}${rowIndex + 1}`, rowIndex === 0 ? 1 : 0),
        )
        .join("")
      return `<row r="${rowIndex + 1}">${cells}</row>`
    })
    .join("")

  // A frozen header row and a filter on the header make a long export usable.
  const filter =
    rows.length > 1 ? `<autoFilter ref="A1:${lastColumn}${rows.length}"/>` : ""

  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews>${cols}<sheetData>${body}</sheetData>${filter}</worksheet>`
}

const CONTENT_TYPES = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/></Types>`

const ROOT_RELS = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>`

const WORKBOOK_RELS = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`

/** Two fonts and two cell formats: plain, and bold for the header row. */
const STYLES = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><fonts count="2"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><name val="Calibri"/></font></fonts><fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill></fills><borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="2"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1"/></cellXfs></styleSheet>`

function workbookXml(sheetName: string): string {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="${escapeXml(
    sheetName.slice(0, 31),
  )}" sheetId="1" r:id="rId1"/></sheets></workbook>`
}

type Entry = { name: string; data: Uint8Array }

/** Builds a ZIP with STORED entries. */
function zip(entries: Entry[]): Blob {
  const chunks: Uint8Array[] = []
  const central: Uint8Array[] = []
  let offset = 0

  // A fixed timestamp keeps the output byte-identical for identical input,
  // which makes the export diffable and testable.
  const dosTime = 0
  const dosDate = (2020 - 1980) * 512 + 1 * 32 + 1

  for (const entry of entries) {
    const nameBytes = new TextEncoder().encode(entry.name)
    const crc = crc32(entry.data)
    const size = entry.data.length

    const local = new Uint8Array(30 + nameBytes.length)
    const localView = new DataView(local.buffer)
    localView.setUint32(0, 0x04034b50, true)
    localView.setUint16(4, 20, true)
    localView.setUint16(6, 0, true)
    localView.setUint16(8, 0, true) // stored
    localView.setUint16(10, dosTime, true)
    localView.setUint16(12, dosDate, true)
    localView.setUint32(14, crc, true)
    localView.setUint32(18, size, true)
    localView.setUint32(22, size, true)
    localView.setUint16(26, nameBytes.length, true)
    localView.setUint16(28, 0, true)
    local.set(nameBytes, 30)

    chunks.push(local, entry.data)

    const directory = new Uint8Array(46 + nameBytes.length)
    const directoryView = new DataView(directory.buffer)
    directoryView.setUint32(0, 0x02014b50, true)
    directoryView.setUint16(4, 20, true)
    directoryView.setUint16(6, 20, true)
    directoryView.setUint16(8, 0, true)
    directoryView.setUint16(10, 0, true)
    directoryView.setUint16(12, dosTime, true)
    directoryView.setUint16(14, dosDate, true)
    directoryView.setUint32(16, crc, true)
    directoryView.setUint32(20, size, true)
    directoryView.setUint32(24, size, true)
    directoryView.setUint16(28, nameBytes.length, true)
    directoryView.setUint32(42, offset, true)
    directory.set(nameBytes, 46)
    central.push(directory)

    offset += local.length + size
  }

  const centralSize = central.reduce((sum, part) => sum + part.length, 0)

  const end = new Uint8Array(22)
  const endView = new DataView(end.buffer)
  endView.setUint32(0, 0x06054b50, true)
  endView.setUint16(8, entries.length, true)
  endView.setUint16(10, entries.length, true)
  endView.setUint32(12, centralSize, true)
  endView.setUint32(16, offset, true)

  const parts = [...chunks, ...central, end].map(
    (part) => part.buffer.slice(part.byteOffset, part.byteOffset + part.byteLength) as ArrayBuffer,
  )

  return new Blob(parts, {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  })
}

/**
 * Builds a single-sheet workbook. Row 0 is treated as the header: it is bolded,
 * frozen, and given a filter.
 */
export function buildWorkbook(options: {
  rows: Cell[][]
  sheetName?: string
  columnWidths?: number[]
}): Blob {
  const encode = (text: string) => new TextEncoder().encode(text)

  return zip([
    { name: "[Content_Types].xml", data: encode(CONTENT_TYPES) },
    { name: "_rels/.rels", data: encode(ROOT_RELS) },
    { name: "xl/workbook.xml", data: encode(workbookXml(options.sheetName ?? "Sheet1")) },
    { name: "xl/_rels/workbook.xml.rels", data: encode(WORKBOOK_RELS) },
    { name: "xl/styles.xml", data: encode(STYLES) },
    {
      name: "xl/worksheets/sheet1.xml",
      data: encode(sheetXml(options.rows, options.columnWidths)),
    },
  ])
}
