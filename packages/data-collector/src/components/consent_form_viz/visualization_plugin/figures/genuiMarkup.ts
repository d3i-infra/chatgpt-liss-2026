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

export function genuiToMarkdown (message: string): string {
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
