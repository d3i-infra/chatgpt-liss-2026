import { buildLiteBlocks, CONTAINER_CLOSE, containerOpen, formulasToCode } from './liteMarkdown'

describe('formulasToCode', () => {
  it('shows a display formula as a code block', () => {
    expect(formulasToCode('Size it:\n\n\\[\nI \\geq \\sum I_m\n\\]\n\nDone.')).toBe('Size it:\n\n```\nI \\geq \\sum I_m\n```\n\nDone.')
    expect(formulasToCode('$$E = mc^2$$')).toBe('```\nE = mc^2\n```')
  })

  it('leaves inline formulas, money and code alone', () => {
    const text = 'Costs $5 or $10, see \\(x\\) and item \\[1\\] here.\n```\n$$not a formula$$\n```'
    expect(formulasToCode(text)).toBe(text)
  })
})

describe('inline code', () => {
  it('reads inline code, leaving emphasis characters inside it alone', () => {
    expect(buildLiteBlocks([{ kind: 'text', value: 'Use `a*b*c` and **bold**' }])).toEqual([{
      kind: 'paragraph',
      children: [{ type: 'text', value: 'Use ' }, { type: 'code', value: 'a*b*c' }, { type: 'text', value: ' and ' }, { type: 'bold', value: 'bold' }],
    }])
  })

  it('reads inline code in a table cell', () => {
    const blocks = buildLiteBlocks([{ kind: 'text', value: '| Topic | Direction |\n|---|---|\n| `greenhouse/climate` | ESP32 → NAS |' }])
    expect(blocks[0]).toMatchObject({ kind: 'table', rows: [[[{ type: 'code', value: 'greenhouse/climate' }], expect.anything()]] })
  })
})

describe('code blocks', () => {
  it('reads an indented fence, without its indentation', () => {
    const blocks = buildLiteBlocks([{ kind: 'text', value: '1. Run:\n   ```sh\n   make\n     -j4\n   ```\nDone.' }])
    expect(blocks[1]).toEqual({ kind: 'codeBlock', language: 'sh', code: 'make\n  -j4' })
    expect(blocks[2]).toEqual({ kind: 'paragraph', children: [{ type: 'text', value: 'Done.' }] })
  })
})

describe('containers', () => {
  const text = (value: string) => [{ kind: 'text' as const, value }]

  it('nests the blocks between a container opening and its close', () => {
    const blocks = buildLiteBlocks(text(`Before\n${containerOpen('box', { gap: 2 })}\nInside\n${containerOpen('text')}\nDeeper\n${CONTAINER_CLOSE}\n${CONTAINER_CLOSE}\nAfter`))
    expect(blocks).toEqual([
      { kind: 'paragraph', children: [{ type: 'text', value: 'Before' }] },
      {
        kind: 'container',
        name: 'box',
        attrs: { gap: 2 },
        blocks: [
          { kind: 'paragraph', children: [{ type: 'text', value: 'Inside' }] },
          { kind: 'container', name: 'text', attrs: {}, blocks: [{ kind: 'paragraph', children: [{ type: 'text', value: 'Deeper' }] }] },
        ],
      },
      { kind: 'paragraph', children: [{ type: 'text', value: 'After' }] },
    ])
  })

  it('keeps the content of unbalanced containers', () => {
    const blocks = buildLiteBlocks(text(`${CONTAINER_CLOSE}\nA\n${containerOpen('box')}\nB`))
    expect(blocks).toEqual([
      { kind: 'paragraph', children: [{ type: 'text', value: 'A' }] },
      { kind: 'container', name: 'box', attrs: {}, blocks: [{ kind: 'paragraph', children: [{ type: 'text', value: 'B' }] }] },
    ])
  })
})
