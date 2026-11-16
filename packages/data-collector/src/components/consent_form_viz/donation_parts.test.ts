import { encodeJsonParts, jsonPieces } from './donation_parts'

const decode = (parts: Uint8Array[]): string =>
  parts.map((p) => new TextDecoder('utf-8', { fatal: true }).decode(p)).join('')

const tables = [
  {
    chatgpt_conversations: [
      { message: 'héllo € 😀', role: 'user', time: '2026-01-01T00:00:00Z', unreadable: undefined },
      { message: 'line\nbreak "quoted" \\ back', role: 'assistant', n: 3, flag: null },
      { message: '😀'.repeat(50), nested: { a: [1, { b: 'ü' }], skip: undefined } },
    ],
    'deleted row count': '2',
    'extraction errors': { SkippedMessage: 3 },
  },
  { other: [], 'deleted row count': '0', 'extraction errors': {} },
]

describe('encodeJsonParts', () => {
  it.each([4, 5, 7, 16, 61, 1000, 25_000_000])('concatenates to JSON.stringify with %i-byte parts', (size) => {
    const parts = encodeJsonParts(tables, size)
    expect(decode(parts)).toBe(JSON.stringify(tables))
    for (const p of parts) expect(p.byteLength).toBeLessThanOrEqual(size)
  })

  it('makes every part a standalone array that can be transferred', () => {
    for (const p of encodeJsonParts(tables, 64)) {
      expect(p.byteOffset).toBe(0)
      expect(p.byteLength).toBe(p.buffer.byteLength)
    }
  })

  it('fills parts up to the limit, so the number of parts is minimal', () => {
    // Only the last part may be short; the others stop at most 3 bytes before the
    // limit (when the next character is a 4-byte one that does not fit).
    const parts = encodeJsonParts(tables, 64)
    for (const p of parts.slice(0, -1)) expect(p.byteLength).toBeGreaterThanOrEqual(64 - 3)
  })

  it('handles a row larger than a part', () => {
    const big = [{ t: [{ m: 'x'.repeat(1000) + 'é'.repeat(500) }] }]
    expect(decode(encodeJsonParts(big, 100))).toBe(JSON.stringify(big))
  })

  it('gives one part for an empty donation', () => {
    const parts = encodeJsonParts([], 1000)
    expect(parts.length).toBe(1)
    expect(decode(parts)).toBe('[]')
  })
})

describe('jsonPieces', () => {
  it.each([0, 1, 2, 3, 6])('matches JSON.stringify at depth %i', (depth) => {
    expect([...jsonPieces(tables, depth)].join('')).toBe(JSON.stringify(tables))
  })

  it('keeps one row per piece at the consent-page depth', () => {
    const pieces = [...jsonPieces(tables, 3)]
    expect(pieces).toContain(JSON.stringify(tables[0].chatgpt_conversations[1]))
  })
})
