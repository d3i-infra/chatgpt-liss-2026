// A light, deliberately non-exhaustive markdown pass: headings (#, ##, ###),
// "- " bullet lists, "| a | b |" tables, "> " block quotes, "---" horizontal
// rules, fenced ``` code blocks, `inline code`, **bold**/*italic* inline
// emphasis, and
// containers: blocks between a containerOpen line and a containerClose line,
// nested, so a caller can lay them out (e.g. as a card). It knows nothing
// about any particular
// chat platform: callers hand it a list of segments that are either plain
// text or an opaque "reference" (TRef) - e.g. a citation chip a caller
// already resolved from its own marker format - and this module keeps those
// references correctly positioned relative to line/cell boundaries without
// needing a full markdown parser or any platform-specific knowledge.

// Wrapped (rather than a bare `{ kind: 'text' } | TRef` union) so the
// 'text'/'ref' discriminant is a fixed literal instead of depending on
// whatever shape TRef happens to have - TypeScript can't narrow a
// discriminated union by a generic member's own fields, only by a literal
// tag that's part of the union itself.
export type InputSegment<TRef> = { kind: 'text', value: string } | { kind: 'ref', segment: TRef }

export type LiteInlineChild<TRef> =
  | { type: 'text', value: string }
  | { type: 'bold', value: string }
  | { type: 'italic', value: string }
  | { type: 'code', value: string }
  | { type: 'ref', segment: TRef }

export type LiteBlock<TRef> =
  | { kind: 'paragraph', children: Array<LiteInlineChild<TRef>> }
  | { kind: 'heading', level: 1 | 2 | 3 | 4, children: Array<LiteInlineChild<TRef>> }
  | { kind: 'listItem', children: Array<LiteInlineChild<TRef>> }
  | { kind: 'table', header: Array<Array<LiteInlineChild<TRef>>>, rows: Array<Array<Array<LiteInlineChild<TRef>>>> }
  | { kind: 'codeBlock', language?: string, code: string }
  | { kind: 'blockquote', lines: Array<Array<LiteInlineChild<TRef>>> }
  | { kind: 'horizontalRule' }
  // name and attrs are whatever the caller passed to containerOpen.
  | { kind: 'container', name: string, attrs: Record<string, unknown>, blocks: Array<LiteBlock<TRef>> }

// A container is opened by a line holding only containerOpen(...) and closed
// by a line holding only CONTAINER_CLOSE. Private-use characters, so they
// can't occur in ordinary text.
const CONTAINER_START = '\uE210'
const CONTAINER_END = '\uE211'
export const CONTAINER_CLOSE = '\uE212'
const CONTAINER_OPEN_RE = /^\uE210([\w-]+)(?: (.*))?\uE211[ \t]*$/
const CONTAINER_CLOSE_RE = /^\uE212[ \t]*$/

export function containerOpen (name: string, attrs: Record<string, unknown> = {}): string {
  const json = JSON.stringify(attrs).replace(/[\uE210-\uE212]/g, '')
  return `${CONTAINER_START}${name} ${json}${CONTAINER_END}`
}

const HEADING_RE = /^(#{1,4})\s+(.*)$/
const LIST_ITEM_RE = /^-\s+(.*)$/
const BLOCKQUOTE_RE = /^>\s?(.*)$/
const HORIZONTAL_RULE_RE = /^-{3,}\s*$/
// Inline code first, so emphasis characters inside it stay as they are.
const INLINE_RE = /`([^`\n]+)`|\*\*(.+?)\*\*|\*(.+?)\*/g
// A fence may be indented, e.g. inside a list item or a layout box; its
// code lines lose the same indentation.
const CODE_FENCE_RE = /^([ \t]*)```(\S*)\s*$/

export function parseInline<TRef> (text: string): Array<LiteInlineChild<TRef>> {
  const children: Array<LiteInlineChild<TRef>> = []
  let lastIndex = 0
  let match: RegExpExecArray | null
  INLINE_RE.lastIndex = 0

  while ((match = INLINE_RE.exec(text)) !== null) {
    if (match.index > lastIndex) {
      children.push({ type: 'text', value: text.slice(lastIndex, match.index) })
    }
    if (match[1] != null) {
      children.push({ type: 'code', value: match[1] })
    } else if (match[2] != null) {
      children.push({ type: 'bold', value: match[2] })
    } else if (match[3] != null) {
      children.push({ type: 'italic', value: match[3] })
    }
    lastIndex = match.index + match[0].length
  }

  if (lastIndex < text.length) {
    children.push({ type: 'text', value: text.slice(lastIndex) })
  }

  return children
}

function isTableSeparatorLine (line: string): boolean {
  const trimmed = line.trim()
  if (!trimmed.includes('|')) return false
  let inner = trimmed
  if (inner.startsWith('|')) inner = inner.slice(1)
  if (inner.endsWith('|')) inner = inner.slice(0, -1)
  const cells = inner.split('|')
  return cells.length > 0 && cells.every(cell => /^\s*:?-+:?\s*$/.test(cell))
}

// A line-start fragment can be as short as "|" when a reference marker sits
// immediately after the opening pipe (the rest of the row arrives as a
// separate 'ref' child once the line is reassembled), so a bare "|" must
// still count as the start of a table row.
function isTableRowLine (line: string): boolean {
  return line.trim().startsWith('|')
}

function isBlankCell<TRef> (cell: Array<LiteInlineChild<TRef>>): boolean {
  return cell.every(c => c.type === 'text' && c.value.trim() === '')
}

function trimCell<TRef> (cell: Array<LiteInlineChild<TRef>>): Array<LiteInlineChild<TRef>> {
  const trimmed = cell.filter(c => !(c.type === 'text' && c.value.trim() === ''))
  if (trimmed.length === 0) return trimmed
  const first = trimmed[0]
  if (first.type === 'text') trimmed[0] = { type: 'text', value: first.value.replace(/^\s+/, '') }
  const last = trimmed[trimmed.length - 1]
  if (last.type === 'text') trimmed[trimmed.length - 1] = { type: 'text', value: last.value.replace(/\s+$/, '') }
  return trimmed
}

// Splits a fully-assembled line's inline children into per-cell arrays at
// each "|" character. Reference markers never contain a literal "|", so
// this is safe even when a cell's content is a reference chip.
function splitChildrenByPipe<TRef> (children: Array<LiteInlineChild<TRef>>): Array<Array<LiteInlineChild<TRef>>> {
  const cells: Array<Array<LiteInlineChild<TRef>>> = []
  let cell: Array<LiteInlineChild<TRef>> = []

  for (const child of children) {
    if (child.type !== 'text') {
      cell.push(child)
      continue
    }
    const parts = child.value.split('|')
    parts.forEach((part, i) => {
      if (i > 0) {
        cells.push(cell)
        cell = []
      }
      if (part.length > 0) cell.push({ type: 'text', value: part })
    })
  }
  cells.push(cell)

  if (cells.length > 0 && isBlankCell(cells[0])) cells.shift()
  if (cells.length > 0 && isBlankCell(cells[cells.length - 1])) cells.pop()

  return cells.map(trimCell)
}

interface BlockBuilder<TRef> {
  kind: 'paragraph' | 'heading' | 'listItem' | 'tableRow' | 'tableSeparator' | 'codeFenceOpen' | 'codeFenceClose' | 'codeLine' | 'blockquote' | 'horizontalRule' | 'containerOpen' | 'containerClose'
  level: 1 | 2 | 3 | 4
  language?: string
  name?: string
  attrs?: Record<string, unknown>
  children: Array<LiteInlineChild<TRef>>
}

function newBuilder<TRef> (): BlockBuilder<TRef> {
  return { kind: 'paragraph', level: 1, children: [] }
}

// Line-level intermediate representation, produced one entry per line by
// buildRawBlocks. Fenced code blocks still span several of these (an open
// line, zero or more content lines, a close line) until groupCodeBlocks
// collapses them into a single 'codeBlock' RawBlock.
type RawLine<TRef> =
  | { kind: 'paragraph', children: Array<LiteInlineChild<TRef>> }
  | { kind: 'heading', level: 1 | 2 | 3 | 4, children: Array<LiteInlineChild<TRef>> }
  | { kind: 'listItem', children: Array<LiteInlineChild<TRef>> }
  | { kind: 'tableRow', cells: Array<Array<LiteInlineChild<TRef>>> }
  | { kind: 'tableSeparator' }
  | { kind: 'codeFenceOpen', language?: string }
  | { kind: 'codeFenceClose' }
  | { kind: 'codeLine', text: string }
  | { kind: 'blockquote', children: Array<LiteInlineChild<TRef>> }
  | { kind: 'horizontalRule' }
  | { kind: 'containerOpen', name: string, attrs: Record<string, unknown> }
  | { kind: 'containerClose' }

type RawBlock<TRef> =
  | { kind: 'paragraph', children: Array<LiteInlineChild<TRef>> }
  | { kind: 'heading', level: 1 | 2 | 3 | 4, children: Array<LiteInlineChild<TRef>> }
  | { kind: 'listItem', children: Array<LiteInlineChild<TRef>> }
  | { kind: 'tableRow', cells: Array<Array<LiteInlineChild<TRef>>> }
  | { kind: 'tableSeparator' }
  | { kind: 'codeBlock', language?: string, code: string }
  | { kind: 'blockquote', children: Array<LiteInlineChild<TRef>> }
  | { kind: 'horizontalRule' }
  | { kind: 'containerOpen', name: string, attrs: Record<string, unknown> }
  | { kind: 'containerClose' }

// Blocks before containers are nested (see nestContainers).
type FlatBlock<TRef> = Exclude<LiteBlock<TRef>, { kind: 'container' }> | { kind: 'containerOpen', name: string, attrs: Record<string, unknown> } | { kind: 'containerClose' }

function toRawBlock<TRef> (b: BlockBuilder<TRef>): RawLine<TRef> {
  if (b.kind === 'heading') return { kind: 'heading', level: b.level, children: b.children }
  if (b.kind === 'listItem') return { kind: 'listItem', children: b.children }
  if (b.kind === 'tableRow') return { kind: 'tableRow', cells: splitChildrenByPipe(b.children) }
  if (b.kind === 'tableSeparator') return { kind: 'tableSeparator' }
  if (b.kind === 'codeFenceOpen') return { kind: 'codeFenceOpen', language: b.language }
  if (b.kind === 'codeFenceClose') return { kind: 'codeFenceClose' }
  if (b.kind === 'codeLine') return { kind: 'codeLine', text: b.children.map(c => c.type === 'text' ? c.value : '').join('') }
  if (b.kind === 'blockquote') return { kind: 'blockquote', children: b.children }
  if (b.kind === 'horizontalRule') return { kind: 'horizontalRule' }
  if (b.kind === 'containerOpen') return { kind: 'containerOpen', name: b.name ?? '', attrs: b.attrs ?? {} }
  if (b.kind === 'containerClose') return { kind: 'containerClose' }
  return { kind: 'paragraph', children: b.children }
}

function buildRawBlocks<TRef> (segments: Array<InputSegment<TRef>>): Array<RawLine<TRef>> {
  const blocks: Array<RawLine<TRef>> = []
  let current = newBuilder<TRef>()
  let atLineStart = true
  let inCodeBlock = false
  let fenceIndent = 0

  const flush = (): void => {
    blocks.push(toRawBlock(current))
    current = newBuilder<TRef>()
  }

  for (const segment of segments) {
    if (segment.kind === 'ref') {
      current.children.push({ type: 'ref', segment: segment.segment })
      atLineStart = false
      continue
    }

    const lines = segment.value.split('\n')
    lines.forEach((line, i) => {
      if (i > 0) {
        flush()
        atLineStart = true
      }

      let content = line

      if (atLineStart) {
        const fenceMatch = CODE_FENCE_RE.exec(content)

        if (fenceMatch != null) {
          if (inCodeBlock) {
            current.kind = 'codeFenceClose'
            inCodeBlock = false
          } else {
            current.kind = 'codeFenceOpen'
            current.language = fenceMatch[2] !== '' ? fenceMatch[2] : undefined
            fenceIndent = fenceMatch[1].length
            inCodeBlock = true
          }
          content = ''
          atLineStart = false
        } else if (inCodeBlock) {
          // Raw code content: no heading/table/list/inline-emphasis parsing.
          current.kind = 'codeLine'
          current.children.push({ type: 'text', value: content.replace(new RegExp(`^[ \\t]{0,${fenceIndent}}`), '') })
          content = ''
          atLineStart = false
        } else if (CONTAINER_OPEN_RE.test(content)) {
          const [, name, json] = CONTAINER_OPEN_RE.exec(content) as RegExpExecArray
          current.kind = 'containerOpen'
          current.name = name
          try {
            const parsed: unknown = JSON.parse(json ?? '{}')
            current.attrs = parsed != null && typeof parsed === 'object' ? parsed as Record<string, unknown> : {}
          } catch {
            current.attrs = {}
          }
          content = ''
          atLineStart = false
        } else if (CONTAINER_CLOSE_RE.test(content)) {
          current.kind = 'containerClose'
          content = ''
          atLineStart = false
        } else if (content.length > 0) {
          const headingMatch = HEADING_RE.exec(content)
          const blockquoteMatch = headingMatch == null ? BLOCKQUOTE_RE.exec(content) : null
          const horizontalRuleMatch = (headingMatch == null && blockquoteMatch == null) && HORIZONTAL_RULE_RE.test(content)
          const listMatch = (headingMatch == null && blockquoteMatch == null && !horizontalRuleMatch) ? LIST_ITEM_RE.exec(content) : null

          if (headingMatch != null) {
            current.kind = 'heading'
            current.level = headingMatch[1].length as 1 | 2 | 3 | 4
            content = headingMatch[2]
          } else if (blockquoteMatch != null) {
            current.kind = 'blockquote'
            content = blockquoteMatch[1]
          } else if (horizontalRuleMatch) {
            current.kind = 'horizontalRule'
            content = ''
          } else if (isTableSeparatorLine(content)) {
            current.kind = 'tableSeparator'
            content = ''
          } else if (isTableRowLine(content)) {
            current.kind = 'tableRow'
          } else if (listMatch != null) {
            current.kind = 'listItem'
            content = listMatch[1]
          }
        }
      }

      if (content.length > 0) {
        current.children.push(...parseInline<TRef>(content))
        atLineStart = false
      }
    })
  }

  flush()
  return blocks
}

// Collapses a fenced code block's per-line entries (open/content*/close)
// into a single codeBlock, preserving line breaks verbatim. An unterminated
// fence (no closing ```) runs to the end of the message, since chat exports
// can be truncated mid-block.
function groupCodeBlocks<TRef> (lines: Array<RawLine<TRef>>): Array<RawBlock<TRef>> {
  const result: Array<RawBlock<TRef>> = []
  let i = 0

  while (i < lines.length) {
    const line = lines[i]

    if (line.kind === 'codeFenceOpen') {
      const codeLines: string[] = []
      let j = i + 1
      while (j < lines.length && lines[j].kind !== 'codeFenceClose') {
        const inner = lines[j]
        if (inner.kind === 'codeLine') codeLines.push(inner.text)
        j++
      }
      if (j < lines.length) j++ // consume the closing fence line
      result.push({ kind: 'codeBlock', language: line.language, code: codeLines.join('\n') })
      i = j
      continue
    }

    if (line.kind === 'codeFenceClose' || line.kind === 'codeLine') {
      // Stray fence-only line with no matching open; buildRawBlocks never
      // emits these on their own, but skip defensively.
      i++
      continue
    }

    result.push(line)
    i++
  }

  return result
}

function flattenRowToParagraph<TRef> (cells: Array<Array<LiteInlineChild<TRef>>>): FlatBlock<TRef> {
  const children: Array<LiteInlineChild<TRef>> = []
  cells.forEach((cell, i) => {
    if (i > 0) children.push({ type: 'text', value: ' | ' })
    children.push(...cell)
  })
  return { kind: 'paragraph', children }
}

// A tableRow only becomes a real table once immediately followed by a
// tableSeparator; otherwise it's a stray "|"-containing line rendered as
// plain text.
function groupTables<TRef> (blocks: Array<RawBlock<TRef>>): Array<FlatBlock<TRef>> {
  const result: Array<FlatBlock<TRef>> = []
  let i = 0

  while (i < blocks.length) {
    const block = blocks[i]

    if (block.kind === 'blockquote') {
      const lines: Array<Array<LiteInlineChild<TRef>>> = []
      let j = i
      while (j < blocks.length && blocks[j].kind === 'blockquote') {
        lines.push((blocks[j] as { kind: 'blockquote', children: Array<LiteInlineChild<TRef>> }).children)
        j++
      }
      result.push({ kind: 'blockquote', lines })
      i = j
      continue
    }

    if (block.kind === 'tableRow' && blocks[i + 1]?.kind === 'tableSeparator') {
      const header = block.cells
      const rows: Array<Array<Array<LiteInlineChild<TRef>>>> = []
      let j = i + 2
      while (j < blocks.length && blocks[j].kind === 'tableRow') {
        rows.push((blocks[j] as { kind: 'tableRow', cells: Array<Array<LiteInlineChild<TRef>>> }).cells)
        j++
      }
      result.push({ kind: 'table', header, rows })
      i = j
      continue
    }

    // Source exports frequently omit the "| --- | --- |" delimiter row
    // entirely; treat 2+ consecutive pipe rows with no separator as a
    // headerless table rather than flattening every row to its own paragraph.
    if (block.kind === 'tableRow' && blocks[i + 1]?.kind === 'tableRow') {
      const rows: Array<Array<Array<LiteInlineChild<TRef>>>> = []
      let j = i
      while (j < blocks.length && blocks[j].kind === 'tableRow') {
        rows.push((blocks[j] as { kind: 'tableRow', cells: Array<Array<LiteInlineChild<TRef>>> }).cells)
        j++
      }
      result.push({ kind: 'table', header: [], rows })
      i = j
      continue
    }

    if (block.kind === 'tableRow') {
      result.push(flattenRowToParagraph(block.cells))
      i++
      continue
    }

    if (block.kind === 'tableSeparator') {
      // Stray separator line with no preceding header row; drop it.
      i++
      continue
    }

    result.push(block)
    i++
  }

  return result
}

// Nests the blocks between each containerOpen and its containerClose. A
// close without an open is dropped and an unclosed container ends with the
// message, so unbalanced markup still shows all its content.
function nestContainers<TRef> (blocks: Array<FlatBlock<TRef>>): Array<LiteBlock<TRef>> {
  const root: Array<LiteBlock<TRef>> = []
  const stack: Array<Extract<LiteBlock<TRef>, { kind: 'container' }>> = []
  for (const block of blocks) {
    const into = stack.length > 0 ? stack[stack.length - 1].blocks : root
    if (block.kind === 'containerOpen') {
      const container: Extract<LiteBlock<TRef>, { kind: 'container' }> = { kind: 'container', name: block.name, attrs: block.attrs, blocks: [] }
      into.push(container)
      stack.push(container)
    } else if (block.kind === 'containerClose') {
      stack.pop()
    } else {
      into.push(block)
    }
  }
  return root
}

export function buildLiteBlocks<TRef> (segments: Array<InputSegment<TRef>>): Array<LiteBlock<TRef>> {
  return nestContainers(groupTables(groupCodeBlocks(buildRawBlocks(segments))))
}

// Display formulas, written in LaTeX between "\[" and "\]" or "$$" and "$$"
// on lines of their own. There's no formula rendering here, so they're
// shown as a code block, which at least keeps their layout. Inline
// formulas and single "$" are left alone, as "$" is far more often money.
const DISPLAY_FORMULA_RE = /^[ \t]*(?:\\\[([\s\S]+?)\\\]|\$\$([\s\S]+?)\$\$)[ \t]*$/gm
// Fenced code blocks, which are left untouched.
const FENCED_CODE_RE = /^[ \t]*```[^\n]*\n[\s\S]*?^[ \t]*```[ \t]*$/gm

export function formulasToCode (message: string): string {
  const toCode = (text: string): string => text.replace(DISPLAY_FORMULA_RE, (_, bracketed?: string, dollars?: string) =>
    `\`\`\`\n${(bracketed ?? dollars ?? '').trim()}\n\`\`\``)
  let out = ''
  let lastIndex = 0
  FENCED_CODE_RE.lastIndex = 0
  let match: RegExpExecArray | null
  while ((match = FENCED_CODE_RE.exec(message)) !== null) {
    out += toCode(message.slice(lastIndex, match.index)) + match[0]
    lastIndex = match.index + match[0].length
  }
  return out + toCode(message.slice(lastIndex))
}
