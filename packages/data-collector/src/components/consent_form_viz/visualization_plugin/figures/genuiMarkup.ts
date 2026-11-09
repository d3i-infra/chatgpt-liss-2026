// Newer ChatGPT models (e.g. gpt-5-5) sometimes answer in a JSX-like "genui"
// component markup instead of markdown, e.g.
//
//   <Text>Use <Bold>this</Bold>:</Text><Divider/>
//   <Title value="Usage" size="lg"/>
//   <CodeBlock language="python" content="print(&quot;hi&quot;)\n"/>
//   <List><List.Item>one</List.Item></List>
//
// Text and attribute values are HTML-escaped. buildLiteBlocks only knows
// markdown, so this module rewrites such a message into the equivalent lite
// markdown (paragraph lines, "## " headings, "- " list items, "---" rules,
// fenced code blocks, **bold**/*italic*) before it is parsed. Anything that
// doesn't start with a recognized component tag is returned unchanged, so
// ordinary markdown messages - including prose that happens to mention
// "<Text>" - are left alone. Unrecognized tags inside genui markup are
// dropped while their inner text is kept, so a new component never swallows
// content.


import { CONTAINER_CLOSE, containerOpen } from './liteMarkdown'
const GENUI_START_RE = /^\s*<(?:Text|Title|CodeBlock|Divider|List|Bold|Italic|Code)\b/
const TAG_RE = /<(\/?)([A-Z][\w.]*)((?:\s+[\w-]+(?:="[^"]*")?)*)\s*(\/?)>/g
const ATTR_RE = /([\w-]+)="([^"]*)"/g
const ENTITY_RE = /&(?:#(\d+)|#x([0-9a-f]+)|(amp|lt|gt|quot|apos));/gi
const NAMED_ENTITIES: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" }
const HEADING_SIZES: Record<string, string> = { xl: '#', lg: '##', md: '###', sm: '####' }

export function isGenuiMarkup (message: string): boolean {
  return GENUI_START_RE.test(message)
}

export function decodeHtmlEntities (text: string): string {
  return text.replace(ENTITY_RE, (entity, dec?: string, hex?: string, named?: string) => {
    if (dec != null) return String.fromCodePoint(Number(dec))
    if (hex != null) return String.fromCodePoint(parseInt(hex, 16))
    return NAMED_ENTITIES[(named ?? '').toLowerCase()] ?? entity
  })
}

function parseAttributes (raw: string): Record<string, string> {
  const attrs: Record<string, string> = {}
  ATTR_RE.lastIndex = 0
  let match: RegExpExecArray | null
  while ((match = ATTR_RE.exec(raw)) !== null) {
    attrs[match[1]] = decodeHtmlEntities(match[2])
  }
  return attrs
}

export function genuiToMarkdown (message: string, model?: string): string {
  if (isLayoutGenuiMarkup(message, model)) return layoutGenuiToMarkdown(message)
  if (!isGenuiMarkup(message)) return message

  // Finished lines/blocks, joined with "\n" at the end. A code block is
  // pushed as one multi-line entry so its own blank lines survive.
  const lines: string[] = []
  let current = ''

  const breakLine = (): void => {
    if (current.trim() !== '') lines.push(current)
    current = ''
  }

  let lastIndex = 0
  TAG_RE.lastIndex = 0
  let match: RegExpExecArray | null

  while ((match = TAG_RE.exec(message)) !== null) {
    current += decodeHtmlEntities(message.slice(lastIndex, match.index))
    lastIndex = match.index + match[0].length

    const isClosing = match[1] === '/'
    const name = match[2]
    const selfClosing = match[4] === '/'
    const attrs = isClosing ? {} : parseAttributes(match[3])

    switch (name) {
      case 'Text':
      case 'List':
        breakLine()
        break
      case 'List.Item':
        breakLine()
        if (!isClosing) current = '- '
        break
      case 'Title':
        breakLine()
        if (!isClosing) {
          current = `${HEADING_SIZES[attrs.size ?? ''] ?? '##'} `
          if (selfClosing) {
            current += attrs.value ?? ''
            breakLine()
          }
        }
        break
      case 'Divider':
        breakLine()
        lines.push('---')
        break
      case 'CodeBlock': {
        if (isClosing) break
        breakLine()
        const code = (attrs.content ?? '').replace(/\n$/, '')
        lines.push(`\`\`\`${attrs.language ?? ''}\n${code}\n\`\`\``)
        break
      }
      case 'Bold':
        current += '**'
        break
      case 'Italic':
        current += '*'
        break
      default:
        // Code (inline) and unknown components: keep their text only.
        break
    }
  }

  current += decodeHtmlEntities(message.slice(lastIndex))
  breakLine()
  return lines.join('\n')
}

// --- Layout dialect -----------------------------------------------------------
//
// gpt-6 uses a second dialect: ordinary markdown with JSX-like layout
// components mixed in anywhere in the message, e.g.
//
//   Fits your use case. <Cite refs={["turn871902search1","turn871902search4"]}/>
//
//   <row align=start gap={3}>
//     <AsyncImage query="Shelly Pro 4PM V2 DIN rail relay" aspectRatio="3:4"/>
//     <box flex="1" gap={1}>
//       **<Entity category="product" value="Shelly Pro 4PM V2" disambig="..."/>**
//       <title size="lg">€ 119,81</title>
//       <text color="secondary" size="sm">4 outputs · 16 A per channel</text>
//       <text><Link url="https://..." title="View at shop"/></text>
//     </box>
//   </row>
//
// Attribute values are JSX: "quoted", {expressions}, bare (align=start) or
// valueless flags (border). Boxes, rows, grids, text and titles become
// containers (see containerOpen in liteMarkdown) carrying their attributes,
// which the viewer lays out as cards, columns and styled text. A badge
// becomes a badge marker, so it can stay within a table cell. A caption
// becomes an italic line, a divider a rule, an icon an icon marker with its
// name, size and color, and a loop over a written-out list is repeated once
// per value. A list's items become "1." or "-" lines. A form
// ChatGPT asked the user to fill in is shown as static text: radio options
// as "○ option", an input or textarea as "✎ placeholder" and a button as
// "[ label ]";
// its state code ({@body const [x,setX] = ...}, {#each ...} and similar
// directives) is dropped. Markdown links, which the dialect also uses,
// become links too. Cite, Entity, Link and AsyncImage carry data, so they
// become private-use reference markers (cite, entity, url, and layout_image
// for an image the export only keeps the search phrase of; an
// AsyncImageGroup gets one per image) and are resolved and rendered like
// ChatGPT's own. So do a MapWidgetV2 (layout_map, with its title and points)
// and a Chart (chart, with its data), which the viewer draws. Any other
// component becomes a layout_widget marker with its code, which the viewer
// shows as a widget, so a new widget never shows up as raw code. MemoryCite (a reference to an earlier chat) is dropped, as
// references to earlier chats aren't donated. <CodeBlock> becomes a fenced code block; code blocks and
// inline code are otherwise left untouched, so code that happens to contain
// e.g. <title> survives. Tags outside this set are kept as text, so a new
// component stays visible.

const MARKER_OPEN = ''
const MARKER_CLOSE = ''
const FIELD_SEP = ''
// Brackets a line prefix (a list number, a radio circle) that is joined to
// the next content, across the line breaks removed tags leave behind.
const PREFIX_OPEN = '\u0000'
const PREFIX_CLOSE = '\u0001'

const LAYOUT_TAGS = 'box|row|grid|grid-item|list|list-item|form|radio-group|radio|input|textarea|button|text|title|caption|divider|icon|badge|Cite|Entity|Link|AsyncImageGroup|AsyncImage|MemoryCite|MapWidgetV2|Chart'
// A {...} expression, e.g. onClick={() => f("a"+({"x":"y"})[k])}: nested
// up to three levels, with braces inside its strings ignored.
const expressionBody = (inner: string): string => `(?:"(?:[^"\\\\]|\\\\.)*"|[^{}"]|${inner})*`
const nestExpression = (inner: string): string => `\\{${expressionBody(inner)}\\}`
const LAYOUT_EXPRESSION_BODY = expressionBody(nestExpression(nestExpression('\\{[^{}]*\\}')))
const LAYOUT_EXPRESSION = `\\{${LAYOUT_EXPRESSION_BODY}\\}`
// One attribute-ish chunk: a quoted string, an expression or any other
// non-delimiter character, so ">" inside a value doesn't end the tag.
const LAYOUT_ATTRS = `(?:"[^"]*"|${LAYOUT_EXPRESSION}|[^<>"{}])*`
// (?![\w-]) rather than \b, so "list" doesn't match the start of "list-item".
const LAYOUT_TAG_RE = new RegExp(`<(/?)(${LAYOUT_TAGS})(?![\\w-])(${LAYOUT_ATTRS})>`, 'g')
// A badge with plain text, kept within its line (e.g. a table cell).
const LAYOUT_BADGE_RE = new RegExp(`<badge\\b(${LAYOUT_ATTRS})(?<!/)>([^<\\n]*)</badge>`, 'g')
const LAYOUT_LINK_RE = new RegExp(`<Link\\b(${LAYOUT_ATTRS})(?<!/)>([\\s\\S]*?)</Link>`, 'g')
// A markdown link, [text](https://...), but not an image (![alt](...)).
const MARKDOWN_LINK_RE = /(?<!!)\[([^\]\n]+)\]\((https?:\/\/[^\s)]+)\)/g
const LAYOUT_CODE_BLOCK_RE = new RegExp(`<CodeBlock\\b(${LAYOUT_ATTRS})(?:/>|(?<!/)>([\\s\\S]*?)</CodeBlock>)`, 'g')
const LAYOUT_ATTR_RE = new RegExp(`([\\w-]+)(?:=(?:"([^"]*)"|\\{(${LAYOUT_EXPRESSION_BODY})\\}|([^\\s"{}/>]+)))?`, 'g')
// Template directives, allowing one level of nested braces.
const LAYOUT_DIRECTIVE_RE = /\{[@#/:][a-z]\w*(?:[^{}\n]|\{[^{}\n]*\})*\}/g
// A prefix and the whitespace after it, but not up to a code fence, which
// has to start its own line, nor a container's end. Container openings
// right after the prefix are kept in front of it, so "1. " ends up inside a
// list item's <text> rather than on a line alone.
const LAYOUT_PREFIX_RE = new RegExp(`${PREFIX_OPEN}([^${PREFIX_CLOSE}]*)${PREFIX_CLOSE}[ \\t\\n]*((?:\\uE210[^\\uE211\\n]*\\uE211[ \\t]*\\n[ \\t\\n]*)*)(?!\`\`\`|[\\uE210\\uE212])`, 'g')
// A reference inside bold text (**1. <Entity .../>**) becomes a marker the
// bold can't span, which would leave the "**" as literal text. So bold
// around a reference is split: its text stays bold, the reference itself
// isn't (see unboldReferences).
const REFERENCE_TAG = `<(?:Entity|Link|Cite)\\b${LAYOUT_ATTRS}/>`
// Any other component, e.g. a widget this code doesn't know yet: a
// capitalised tag (<SliderWidget .../> or <SliderWidget>...</SliderWidget>),
// or a lowercase one with a JSX expression attribute (<slider value={x}/>).
// Lowercase tags without one are left as text, as they could be HTML in
// ordinary prose.
const KNOWN_COMPONENTS = 'Cite|Entity|Link|AsyncImageGroup|AsyncImage|MemoryCite|MapWidgetV2|Chart|CodeBlock'
const LAYOUT_WIDGET_RE = new RegExp(`<((?!(?:${KNOWN_COMPONENTS}|${LAYOUT_TAGS})(?![\\w.-]))[A-Za-z][\\w.-]*)(?![\\w.-])(${LAYOUT_ATTRS})(?:/>|(?<!/)>([\\s\\S]*?)</\\1\\s*>)`, 'g')
const BOLD_WITH_REFERENCE_RE = new RegExp(`\\*\\*((?:(?!\\*\\*)[^\\n])*?${REFERENCE_TAG}(?:(?!\\*\\*)[^\\n])*?)\\*\\*`, 'g')
const REFERENCE_TAG_RE = new RegExp(REFERENCE_TAG, 'g')
// Detected by tags that aren't HTML, so prose about HTML isn't mistaken
// for it.
const LAYOUT_DETECT_RE = new RegExp(`<(?:box|row|grid|list|badge|radio-group)(?![\\w-])${LAYOUT_ATTRS}>|<(?:Cite|Entity|AsyncImage|AsyncImageGroup|icon|divider|MemoryCite|MapWidgetV2|Chart)(?![\\w-])${LAYOUT_ATTRS}/>|<[A-Z][\\w.]*(?=\\s[^>]*=\\{)\\s${LAYOUT_ATTRS}/>`)
// Fenced code blocks (also indented ones, nested in a box) and inline
// code spans.
const CODE_RE = /^[ \t]*```[^\n]*\n[\s\S]*?^[ \t]*```[ \t]*$|`[^`\n]+`/gm
// Models known to predate the layout dialect: their answers can contain
// HTML that happens to use e.g. a <box> tag, which must stay text. Any
// other (or no) model is judged on the message alone.
const PRE_LAYOUT_MODEL_RE = /^(?:gpt-[345](?!\d)|chatgpt-4o|o\d|text-davinci)/i

type LayoutAttrs = Record<string, unknown>

// {#each [1,2,3] as n}...{/each} over a list written out in the text: its
// body once per value, with {n} filled in. A loop over anything else (e.g. a
// form's state) can't be expanded and is shown once.
const LOOP_RE = /\{#each\s+(\[[^\]\n]*\])\s+as\s+(\w+)\s*\}([\s\S]*?)\{\/each\}/g

function expandLoops (source: string): string {
  return source.replace(LOOP_RE, (loop: string, list: string, name: string, body: string) => {
    let values: unknown
    try {
      values = JSON.parse(list.replace(/'/g, '"'))
    } catch {
      return loop
    }
    if (!Array.isArray(values)) return loop
    const placeholder = new RegExp(`\\{${name}\\}`, 'g')
    return values.map(value => body.replace(placeholder, String(value))).join('')
  })
}

// The lists open at the current tag, innermost last, for numbering items.
interface LayoutState {
  lists: Array<{ numbered: boolean, count: number }>
}

export function isLayoutGenuiMarkup (message: string, model?: string): boolean {
  if (model != null && PRE_LAYOUT_MODEL_RE.test(model)) return false
  return LAYOUT_DETECT_RE.test(message.replace(CODE_RE, ''))
}

function parseLayoutAttributes (raw: string): LayoutAttrs {
  const attrs: LayoutAttrs = {}
  LAYOUT_ATTR_RE.lastIndex = 0
  let match: RegExpExecArray | null
  while ((match = LAYOUT_ATTR_RE.exec(raw)) !== null) {
    const [, name, quoted, expression, bare] = match
    if (quoted != null) {
      attrs[name] = decodeHtmlEntities(quoted)
    } else if (expression != null) {
      try {
        attrs[name] = JSON.parse(expression)
      } catch {
        attrs[name] = expression
      }
    } else {
      attrs[name] = bare ?? true
    }
  }
  return attrs
}

function stringAttr (attrs: LayoutAttrs, name: string): string | undefined {
  const value = attrs[name]
  return typeof value === 'string' && value !== '' ? value : undefined
}

function marker (...fields: string[]): string {
  // Field values must not contain the marker characters themselves.
  const clean = fields.map(f => f.replace(/[-]/g, ''))
  return `${MARKER_OPEN}${clean.join(FIELD_SEP)}${MARKER_CLOSE}`
}

function prefix (text: string): string {
  return `\n${PREFIX_OPEN}${text}${PREFIX_CLOSE}`
}

function linkMarker (attrs: LayoutAttrs, text?: string): string {
  const href = stringAttr(attrs, 'url') ?? stringAttr(attrs, 'href')
  const label = (text?.trim() !== '' ? text?.trim() : undefined) ?? stringAttr(attrs, 'title') ?? href ?? ''
  return href != null ? marker('url', label, href) : label
}

function dedent (text: string): string {
  const lines = text.split('\n')
  const indents = lines.filter(l => l.trim() !== '').map(l => /^[ \t]*/.exec(l)?.[0].length ?? 0)
  const indent = indents.length > 0 ? Math.min(...indents) : 0
  return lines.map(l => l.slice(Math.min(indent, /^[ \t]*/.exec(l)?.[0].length ?? 0))).join('\n')
}

// Either <CodeBlock language="cpp">code</CodeBlock> or the older
// <CodeBlock language="cpp" content="code"/>.
function codeBlockToMarkdown (rawAttrs: string, children?: string): string {
  const attrs = parseLayoutAttributes(rawAttrs)
  const code = children != null
    ? dedent(children.replace(/^[ \t]*\n/, '').replace(/\s+$/, ''))
    : (stringAttr(attrs, 'content') ?? '').replace(/\n$/, '')
  return `\n\`\`\`${stringAttr(attrs, 'language') ?? ''}\n${code}\n\`\`\`\n`
}

// The markdown replacement for one layout tag.
function layoutTagToMarkdown (isClosing: boolean, name: string, rawAttrs: string, state: LayoutState): string {
  const selfClosing = /\/\s*$/.test(rawAttrs)
  const attrs = isClosing ? {} : parseLayoutAttributes(rawAttrs.replace(/\/\s*$/, ''))

  switch (name) {
    case 'box':
    case 'row':
    case 'grid':
    case 'grid-item':
    case 'text':
      // Containers, laid out by the viewer from their attributes.
      if (selfClosing) return ''
      return isClosing ? `\n${CONTAINER_CLOSE}\n` : `\n${containerOpen(name, attrs)}\n`
    case 'form':
    case 'radio-group':
      return '\n'
    case 'list':
      if (isClosing) state.lists.pop()
      else if (!selfClosing) state.lists.push({ numbered: attrs.marker === 'number', count: 0 })
      return '\n'
    case 'list-item': {
      if (isClosing) return '\n'
      const list = state.lists[state.lists.length - 1]
      if (list == null) return prefix('- ')
      list.count += 1
      return prefix(list.numbered ? `${list.count}. ` : '- ')
    }
    case 'radio':
      return isClosing ? '\n' : prefix('○ ')
    case 'input':
    case 'textarea': {
      const placeholder = stringAttr(attrs, 'placeholder')?.replace(/\*/g, '')
      return isClosing ? '' : `\n✎ ${placeholder != null ? `*${placeholder}*` : '…'}\n`
    }
    case 'button':
      if (selfClosing) return ''
      return isClosing ? ' ]\n' : prefix('[ ')
    case 'title':
      if (selfClosing) {
        const value = stringAttr(attrs, 'value')
        return value != null ? `\n${containerOpen(name, attrs)}\n${value}\n${CONTAINER_CLOSE}\n` : '\n'
      }
      return isClosing ? `\n${CONTAINER_CLOSE}\n` : `\n${containerOpen(name, attrs)}\n`
    case 'badge':
      // One with other tags in it; a plain one is a badge marker.
      if (selfClosing) return ''
      return isClosing ? `\n${CONTAINER_CLOSE}\n` : `\n${containerOpen(name, attrs)}\n`
    case 'divider':
      return '\n---\n'
    case 'Cite': {
      const refs = Array.isArray(attrs.refs) ? attrs.refs.filter((r): r is string => typeof r === 'string') : []
      return refs.length > 0 ? marker('cite', ...refs) : ''
    }
    case 'Entity': {
      const value = stringAttr(attrs, 'value')
      if (value == null) return ''
      // An entity naming a search result carries its ref token where others
      // carry a category - the same shape as ChatGPT's own entity markers.
      const first = stringAttr(attrs, 'ref') ?? stringAttr(attrs, 'category') ?? ''
      const payload = [first, value, ...(stringAttr(attrs, 'disambig') != null ? [stringAttr(attrs, 'disambig')] : [])]
      return marker('entity', JSON.stringify(payload))
    }
    case 'Link':
      return isClosing ? '' : linkMarker(attrs)
    case 'AsyncImage': {
      // The export has no image, only the phrase ChatGPT searched it with.
      const query = stringAttr(attrs, 'query')
      return query != null ? marker('layout_image', query) : ''
    }
    case 'AsyncImageGroup': {
      // A collage of images: one placeholder per search phrase.
      const queries = Array.isArray(attrs.query) ? attrs.query.filter((q): q is string => typeof q === 'string' && q !== '') : []
      return queries.length > 0 ? `\n${queries.map(q => marker('layout_image', q)).join(' ')}\n` : ''
    }
    case 'MemoryCite':
      // Refers to one of the user's earlier chats. Those references aren't
      // donated: they could still hold what's in a chat the participant
      // removed from the donation.
      return ''
    case 'MapWidgetV2': {
      // A map: its points, each written out (name, address, an emoji icon)
      // or a reference to a search result, which the viewer counts.
      const points = Array.isArray(attrs.points) ? attrs.points.filter(p => typeof p === 'object' && p != null) : []
      return points.length > 0 ? `\n${marker('layout_map', stringAttr(attrs, 'title') ?? '', JSON.stringify(points))}\n` : ''
    }
    case 'Chart':
      // A chart with all its data written out, drawn by the viewer.
      return typeof attrs.content === 'object' && attrs.content != null ? `\n${marker('chart', JSON.stringify(attrs.content))}\n` : ''
    case 'caption':
      if (selfClosing) return ''
      return isClosing ? '*\n' : '\n*'
    case 'icon': {
      // Drawn by its name (see layout_icon), on a line of its own unless
      // it's an inline icon.
      const iconName = stringAttr(attrs, 'name')
      if (iconName == null) return ''
      const icon = marker('icon', iconName, stringAttr(attrs, 'size') ?? '', stringAttr(attrs, 'color') ?? '')
      return attrs.inline === true ? icon : `\n${icon}\n`
    }
    default:
      return ''
  }
}

// The content of a bold span with references in it, as bold text parts
// around unbolded references: "1. <Entity/>" becomes "**1.** <Entity/>".
function unboldReferences (inner: string): string {
  let out = ''
  let lastIndex = 0
  const bold = (text: string): string => {
    const trimmed = text.trim()
    if (trimmed === '') return text
    const lead = text.slice(0, text.indexOf(trimmed))
    const trail = text.slice(text.indexOf(trimmed) + trimmed.length)
    return `${lead}**${trimmed}**${trail}`
  }
  REFERENCE_TAG_RE.lastIndex = 0
  let match: RegExpExecArray | null
  while ((match = REFERENCE_TAG_RE.exec(inner)) !== null) {
    out += bold(inner.slice(lastIndex, match.index)) + match[0]
    lastIndex = match.index + match[0].length
  }
  return out + bold(inner.slice(lastIndex))
}

// An unknown component becomes a widget marker with its name and its code,
// which the viewer shows as a widget whose code opens on click. The code is
// JSON, with the characters the steps after this one act on (tags,
// directives, links, emphasis) as \u escapes, so it reaches the viewer as
// written.
function widgetMarker (source: string, name: string, rawAttrs: string): string {
  const component = /^[A-Z]/.test(name) || /=\{/.test(rawAttrs)
  if (!component) return source
  // The first line starts at the tag, so only the lines after it carry the
  // message's indentation.
  const [first, ...rest] = source.split('\n')
  const code = JSON.stringify([first, ...(rest.length > 0 ? dedent(rest.join('\n')).split('\n') : [])].join('\n')).replace(/[<>{}[\]*_`]/g, c => `\\u${c.charCodeAt(0).toString(16).padStart(4, '0')}`)
  return `\n${marker('layout_widget', name, code)}\n`
}

function convertLayoutProse (prose: string, state: LayoutState): string {
  return prose
    .replace(LAYOUT_WIDGET_RE, (source: string, name: string, rawAttrs: string) => widgetMarker(source, name, rawAttrs))
    .replace(LAYOUT_DIRECTIVE_RE, '')
    .replace(BOLD_WITH_REFERENCE_RE, (_, inner: string) => unboldReferences(inner))
    .replace(LAYOUT_BADGE_RE, (_, rawAttrs: string, text: string) => text.trim() !== '' ? marker('badge', text.trim(), stringAttr(parseLayoutAttributes(rawAttrs), 'color') ?? '') : '')
    .replace(LAYOUT_LINK_RE, (_, rawAttrs: string, text: string) => linkMarker(parseLayoutAttributes(rawAttrs), text))
    .replace(MARKDOWN_LINK_RE, (_, text: string, href: string) => marker('url', text, href))
    .replace(LAYOUT_TAG_RE, (_, slash: string, name: string, rawAttrs: string) => layoutTagToMarkdown(slash === '/', name, rawAttrs, state))
}

export function layoutGenuiToMarkdown (message: string): string {
  // CodeBlocks first, so their code is skipped like any other code block.
  const source = expandLoops(message.replace(LAYOUT_CODE_BLOCK_RE, (_, rawAttrs: string, children?: string) => codeBlockToMarkdown(rawAttrs, children)))
  const state: LayoutState = { lists: [] }
  let out = ''
  let lastIndex = 0
  CODE_RE.lastIndex = 0
  let match: RegExpExecArray | null
  while ((match = CODE_RE.exec(source)) !== null) {
    out += convertLayoutProse(source.slice(lastIndex, match.index), state) + match[0]
    lastIndex = match.index + match[0].length
  }
  out += convertLayoutProse(source.slice(lastIndex), state)
  out = out.replace(LAYOUT_PREFIX_RE, '\n$2$1')

  // Component nesting is indented, which isn't meaningful markdown here;
  // drop it along with the blank lines the removed tags leave behind, but
  // keep code blocks' own indentation.
  const parts: string[] = []
  let inFence = false
  for (const line of out.split('\n')) {
    if (/^\s*```/.test(line)) inFence = !inFence
    parts.push(inFence || /^\s*```/.test(line) ? line : line.replace(/^[ \t]+(?=\S)/, '').replace(/^[ \t]+$/, ''))
  }
  return parts.join('\n').replace(/\n{3,}/g, '\n\n').trim()
}
