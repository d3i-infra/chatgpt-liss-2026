// The donation is written straight into UTF-8 parts of at most `partBytes`, so the
// whole donation never exists as one string or one byte array: the page holds the
// finished parts only, and each part leaves the browser on its own request.
// Concatenated in order the parts are exactly JSON.stringify(value), and each part
// is valid UTF-8 on its own (encodeInto never writes half a character).

// Part size when the flow does not set one. 25 MB: the largest size measured to
// keep donating flat on an 8 GB laptop, and well under Next's 210 MB per request.
export const DEFAULT_DONATE_PART_BYTES = 25_000_000

const omitted = (v: unknown): boolean =>
  v === undefined || typeof v === "function" || typeof v === "symbol"

// JSON.stringify(value) as a sequence of pieces. The outer `depth` levels of arrays
// and plain objects are walked here; anything deeper is one JSON.stringify call.
// For the consent page: the tables array, each table object, and its rows array,
// so a piece is at most one row.
export function * jsonPieces (value: unknown, depth: number): Generator<string> {
  if (depth <= 0 || value === null || typeof value !== "object" ||
      typeof (value as { toJSON?: unknown }).toJSON === "function") {
    const s = JSON.stringify(value)
    yield s === undefined ? "null" : s // undefined only reaches here as an array element
    return
  }
  if (Array.isArray(value)) {
    yield "["
    for (let i = 0; i < value.length; i++) {
      if (i > 0) yield ","
      const item = value[i]
      if (omitted(item)) yield "null"
      else yield * jsonPieces(item, depth - 1)
    }
    yield "]"
    return
  }
  yield "{"
  let first = true
  for (const key of Object.keys(value)) {
    const item = (value as Record<string, unknown>)[key]
    if (omitted(item)) continue
    yield (first ? "" : ",") + JSON.stringify(key) + ":"
    first = false
    yield * jsonPieces(item, depth - 1)
  }
  yield "}"
}

// A part as a standalone Uint8Array (its own whole buffer), so it can be transferred
// to the worker and on to the page instead of copied.
function finish (buffer: Uint8Array, length: number): Uint8Array {
  if (length === buffer.length) return buffer
  const transfer = (buffer.buffer as ArrayBuffer & { transfer?: (n: number) => ArrayBuffer }).transfer
  return transfer ? new Uint8Array(transfer.call(buffer.buffer, length)) : buffer.slice(0, length)
}

export function encodeJsonParts (value: unknown, partBytes: number, depth = 3): Uint8Array[] {
  if (!(partBytes >= 4)) throw new RangeError("partBytes must hold at least one character (4 bytes)")
  const encoder = new TextEncoder()
  const parts: Uint8Array[] = []
  let buffer = new Uint8Array(partBytes)
  let length = 0
  for (const piece of jsonPieces(value, depth)) {
    let rest = piece
    for (;;) {
      const { read, written } = encoder.encodeInto(rest, buffer.subarray(length))
      length += written
      if (read === rest.length) break
      // The part is full (the next character does not fit): start a new one.
      parts.push(finish(buffer, length))
      buffer = new Uint8Array(partBytes)
      length = 0
      rest = rest.slice(read)
    }
  }
  if (length > 0 || parts.length === 0) parts.push(finish(buffer, length))
  return parts
}
