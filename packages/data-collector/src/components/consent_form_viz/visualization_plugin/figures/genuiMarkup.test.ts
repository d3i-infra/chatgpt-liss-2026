import { genuiToMarkdown, decodeHtmlEntities, isGenuiMarkup, isLayoutGenuiMarkup } from './genuiMarkup'
import { buildLiteBlocks } from './liteMarkdown'

// Trimmed from a real gpt-5-5 export message.
const MESSAGE =
  '<Text>The safest approach is <Bold>not</Bold> a regex like <Code>&lt;div.*?&gt;</Code>.</Text>' +
  '<Divider/><Title value="Efficient extractor" size="lg"/>' +
  '<CodeBlock language="python" content="import re\n\nDIV_TAG_RE = re.compile(r\'&lt;(/?)div\\b[^&gt;]*&gt;\')\nprint(&quot;x&quot;)\n"/>' +
  '<List><List.Item>Works with <Bold>nested divs</Bold>.</List.Item><List.Item>Uses only <Code>re</Code>.</List.Item></List>' +
  '<Text>Done.</Text>'

describe('genuiToMarkdown', () => {
  it('leaves ordinary markdown untouched', () => {
    const md = 'Hello **world**\n\n```python\nx = 1\n```'
    expect(isGenuiMarkup(md)).toBe(false)
    expect(genuiToMarkdown(md)).toBe(md)
  })

  it('does not treat a lowercase HTML tag at the start as genui', () => {
    expect(genuiToMarkdown('<div>hi</div>')).toBe('<div>hi</div>')
  })

  it('rewrites genui markup into lite markdown', () => {
    expect(genuiToMarkdown(MESSAGE)).toBe([
      'The safest approach is **not** a regex like <div.*?>.',
      '---',
      '## Efficient extractor',
      '```python\nimport re\n\nDIV_TAG_RE = re.compile(r\'<(/?)div\\b[^>]*>\')\nprint("x")\n```',
      '- Works with **nested divs**.',
      '- Uses only re.',
      'Done.'
    ].join('\n'))
  })

  it('produces a real code block through buildLiteBlocks', () => {
    const blocks = buildLiteBlocks([{ kind: 'text', value: genuiToMarkdown(MESSAGE) }])
    expect(blocks.map(b => b.kind)).toEqual([
      'paragraph', 'horizontalRule', 'heading', 'codeBlock', 'listItem', 'listItem', 'paragraph'
    ])
    const code = blocks[3]
    expect(code).toEqual({
      kind: 'codeBlock',
      language: 'python',
      code: 'import re\n\nDIV_TAG_RE = re.compile(r\'<(/?)div\\b[^>]*>\')\nprint("x")'
    })
  })

  it('keeps the text of unknown components', () => {
    expect(genuiToMarkdown('<Text>see <Link href="https://x.org">here</Link></Text>')).toBe('see here')
  })

  it('preserves reference markers inside text', () => {
    const marker = '\uE200cite\uE202turn0search0\uE201'
    expect(genuiToMarkdown(`<Text>fact ${marker}</Text>`)).toBe(`fact ${marker}`)
  })
})

describe('decodeHtmlEntities', () => {
  it('decodes named and numeric entities once', () => {
    expect(decodeHtmlEntities('&lt;a&gt; &quot;b&quot; &#39;c&#x27; &amp;lt;')).toBe('<a> "b" \'c\' &lt;')
  })
})

// Trimmed from a real gpt-6 export message.
const LAYOUT_MESSAGE = [
  '**Ja, de Shelly Pro 4PM V2 is geschikt.** Via MQTT. <Cite refs={["turn871902search1","turn871902search4"]}/>',
  '',
  '<row align=start gap={3}>',
  '  <AsyncImage query="Shelly Pro 4PM V2 DIN rail smart relay" aspectRatio="3:4" maxWidth="120px"/>',
  '  <box flex="1" gap={1}>',
  '    **<Entity category="product" value="Shelly Pro 4PM V2" disambig="slimme schakelactor"/>**',
  '',
  '    <title size="lg">€ 119,81</title>',
  '    <text color="secondary" size="sm">4 uitgangen · 16 A</text>',
  '    <text><Link url="https://www.elektramat.nl/shelly" title="Bekijk bij Elektramat"/> · <Cite refs={["turn337635product0"]}/></text>',
  '    <badge color="warning">Niet op voorraad</badge>',
  '  </box>',
  '</row>',
  '<divider color="subtle"/>',
  '<box border radius="lg" padding={3}>',
  '  <icon name="cpu" size="2xl"/>',
  '  ESP32 + Ethernet',
  '  <Entity ref="turn844734product1" value="Mean Well HDR-100-24"/>',
  '</box>',
  '',
  '## Werkt dit?',
  '',
  '- **ESP32 → Shelly:** via MQTT.'
].join('\n')

const m = (...fields: string[]): string => `\uE200${fields.join('\uE202')}\uE201`

// The layout dialect's text without its container markers (see
// containerOpen), for tests about content rather than structure.
const flat = (markdown: string): string => markdown
  .replace(/\uE210[^\uE211]*\uE211|\uE212/g, '')
  .replace(/\n[ \t]*(?=\n)/g, '\n')
  .replace(/\n{3,}/g, '\n\n')
  .trim()
const convert = (message: string): string => flat(genuiToMarkdown(message))

describe('genuiToMarkdown layout dialect (gpt-6)', () => {
  it('detects the dialect anywhere in the message, but not inside code', () => {
    expect(isLayoutGenuiMarkup(LAYOUT_MESSAGE)).toBe(true)
    expect(isLayoutGenuiMarkup('Plain **markdown** with <b>html</b>')).toBe(false)
    expect(isLayoutGenuiMarkup('Use `<box gap={3}>` or\n```jsx\n<row align=start>\n```')).toBe(false)
  })

  it('rewrites layout components into markdown and reference markers', () => {
    expect(convert(LAYOUT_MESSAGE)).toBe([
      `**Ja, de Shelly Pro 4PM V2 is geschikt.** Via MQTT. ${m('cite', 'turn871902search1', 'turn871902search4')}`,
      '',
      m('layout_image', 'Shelly Pro 4PM V2 DIN rail smart relay'),
      '',
      m('entity', '["product","Shelly Pro 4PM V2","slimme schakelactor"]'),
      '',
      '€ 119,81',
      '',
      '4 uitgangen · 16 A',
      '',
      `${m('url', 'Bekijk bij Elektramat', 'https://www.elektramat.nl/shelly')} · ${m('cite', 'turn337635product0')}`,
      '',
      m('badge', 'Niet op voorraad', 'warning'),
      '',
      '---',
      '',
      m('icon', 'cpu', '2xl', ''),
      '',
      'ESP32 + Ethernet',
      m('entity', '["turn844734product1","Mean Well HDR-100-24"]'),
      '',
      '## Werkt dit?',
      '',
      '- **ESP32 → Shelly:** via MQTT.'
    ].join('\n'))
  })

  it('leaves code blocks untouched', () => {
    const msg = '<box gap={3}>Hi</box>\n\n```html\n  <title>Page</title>\n```'
    expect(convert(msg)).toBe('Hi\n\n```html\n  <title>Page</title>\n```')
  })

  it('turns a card into nested containers with their attributes', () => {
    // Empty lines between the parts don't matter: they aren't rendered there.
    type Block = ReturnType<typeof buildLiteBlocks>[number]
    const withoutEmpty = (blocks: Block[]): Block[] => blocks
      .filter(b => !(b.kind === 'paragraph' && b.children.length === 0))
      .map(b => b.kind === 'container' ? { ...b, blocks: withoutEmpty(b.blocks) } : b)
    const blocks = withoutEmpty(buildLiteBlocks([{ kind: 'text', value: genuiToMarkdown('<box border radius="md" padding={2}>\n  <text weight="medium">Channel 1</text>\n  <icon name="arrow-down"/>\n  <text size="sm">Window 1</text>\n</box>') }]))
    expect(blocks).toEqual([{
      kind: 'container',
      name: 'box',
      attrs: { border: true, radius: 'md', padding: 2 },
      blocks: [
        { kind: 'container', name: 'text', attrs: { weight: 'medium' }, blocks: [{ kind: 'paragraph', children: [{ type: 'text', value: 'Channel 1' }] }] },
        { kind: 'paragraph', children: [{ type: 'text', value: m('icon', 'arrow-down', '', '') }] },
        { kind: 'container', name: 'text', attrs: { size: 'sm' }, blocks: [{ kind: 'paragraph', children: [{ type: 'text', value: 'Window 1' }] }] },
      ],
    }])
  })

  it('keeps the text around a reference in bold, but not the reference', () => {
    expect(convert('<box>**1. <Entity value="Astro" category="software"/>**</box>'))
      .toBe(`**1.** ${m('entity', '["software","Astro"]')}`)
    expect(convert('<box>**See <Cite refs={["turn1search0"]}/> here**</box>'))
      .toBe(`**See** ${m('cite', 'turn1search0')} **here**`)
  })

  it('shows an image group as one placeholder per image, and a caption in italics', () => {
    expect(convert('<box><AsyncImageGroup query={["hazel tree","hazel nuts"]} layout="bento"/>\n<caption>Two photos</caption></box>'))
      .toBe(`${m('layout_image', 'hazel tree')} ${m('layout_image', 'hazel nuts')}\n\n*Two photos*`)
  })

  it('recognises messages by their other layout tags too', () => {
    expect(isLayoutGenuiMarkup('Result: <badge color="warning">Suspect</badge>')).toBe(true)
    expect(convert('Result: <badge color="warning">Suspect</badge>')).toBe(`Result: ${m('badge', 'Suspect', 'warning')}`)
    expect(convert('See your earlier chat. <MemoryCite />')).toBe('See your earlier chat.')
  })

  it('turns markdown links into links, but not images', () => {
    expect(convert('<box>Read the [full text](https://x.org/a). ![logo](https://x.org/l.png)</box>'))
      .toBe(`Read the ${m('url', 'full text', 'https://x.org/a')}. ![logo](https://x.org/l.png)`)
  })

  it('keeps a Link with children as a link with that text', () => {
    expect(convert('<box>See <Link url="https://x.org">the docs</Link></box>'))
      .toBe(`See ${m('url', 'the docs', 'https://x.org')}`)
  })

  it('numbers the items of a numbered list and bullets the others', () => {
    const msg = [
      '<list connector="solid" marker="number" gap={2}>',
      '  <list-item>',
      '    **Phase 1 — Monitoring**',
      '',
      '    Connect the sensor.',
      '  </list-item>',
      '  <list-item>**Phase 2**</list-item>',
      '</list>',
      '<list><list-item><text>One</text></list-item></list>'
    ].join('\n')
    expect(convert(msg)).toBe('1. **Phase 1 — Monitoring**\n\nConnect the sensor.\n\n2. **Phase 2**\n\n- One')
  })

  it('shows a form as static text and drops its state code', () => {
    const msg = [
      '{@body const [kind,setKind] = DIL.useState("hinged")}',
      '<box border radius="xl" padding={4}>',
      '  <form gap={4} onSubmit={() => GenUI.issueNewTurn("My choice: "+kind)}>',
      '    <text weight="medium">1. What kind of windows?</text>',
      '    <radio-group value={kind} onChange={setKind} direction="col">',
      '      <radio value="hinged">Hinged</radio>',
      '      <radio value="sliding">Sliding</radio>',
      '    </radio-group>',
      '    <input value={model} onChange={setModel} placeholder="e.g. TS-264"/>',
      '    <button block submit>Make my plan</button>',
      '  </form>',
      '</box>'
    ].join('\n')
    expect(convert(msg)).toBe('1. What kind of windows?\n\n○ Hinged\n\n○ Sliding\n\n✎ *e.g. TS-264*\n\n[ Make my plan ]')
  })

  it('ends a tag after an expression with nested braces and strings', () => {
    const msg = '<box><button block onClick={() => GenUI.issueNewTurn("Use: "+({"a":"x}"})[k])}>Go</button></box>'
    expect(convert(msg)).toBe('[ Go ]')
  })

  it('repeats a loop over a written-out list once per value', () => {
    const msg = '<grid columns={2}>\n  {#each [1,2] as n}\n  <grid-item>Channel {n}</grid-item>\n  {/each}\n</grid>'
    expect(convert(msg)).toBe('Channel 1\n\nChannel 2')
  })

  it('shows a loop over anything else once, without its loop code', () => {
    const msg = '<grid>\n{#each items as item}\n<grid-item>One item</grid-item>\n{/each}\n</grid>'
    expect(convert(msg)).toBe('One item')
  })

  it('leaves a code block nested in a box untouched', () => {
    const msg = '<box border>\n  <text weight="medium">Telemetry</text>\n  ```text\n  greenhouse/climate/inside\n  <divider/>\n  ```\n  <divider/>\n</box>'
    const blocks = buildLiteBlocks([{ kind: 'text', value: genuiToMarkdown(msg) }])
    expect(blocks).toHaveLength(1)
    const box = blocks[0]
    if (box.kind !== 'container') throw new Error('expected a box')
    expect(box.blocks).toContainEqual({ kind: 'codeBlock', language: 'text', code: 'greenhouse/climate/inside\n<divider/>' })
  })

  it('keeps a badge within its table cell', () => {
    const msg = '| Eigenschap | Turkse hazelaar |\n|---|---|\n| Droge zomers | <badge color="success">Zeer goed</badge> |\n| Natte grond | <badge>Matig</badge> |'
    expect(convert(msg)).toBe(`| Eigenschap | Turkse hazelaar |\n|---|---|\n| Droge zomers | ${m('badge', 'Zeer goed', 'success')} |\n| Natte grond | ${m('badge', 'Matig', '')} |`)
  })

  it('keeps an inline icon within its line, and puts others on a line of their own', () => {
    expect(convert('Copy it <icon name="copy" size="xs" inline/> here')).toBe(`Copy it ${m('icon', 'copy', 'xs', '')} here`)
    expect(convert('Hot <icon name="thermometer-sun" size="xl" color="#D97706"/> day')).toBe(`Hot \n${m('icon', 'thermometer-sun', 'xl', '#D97706')}\nday`)
  })

  it('turns a CodeBlock with children into a fenced code block', () => {
    const msg = '<box>\n  <CodeBlock language="cpp" editable>\n  #include <Wire.h>\n\n  void setup() {\n    Wire.begin();\n  }\n  </CodeBlock>\n</box>'
    expect(convert(msg)).toBe('```cpp\n#include <Wire.h>\n\nvoid setup() {\n  Wire.begin();\n}\n```')
  })

  it('leaves messages of models that predate the dialect alone', () => {
    const html = 'Use this:\n\n<box gap={3}>Hi</box>'
    expect(isLayoutGenuiMarkup(html, 'gpt-6')).toBe(true)
    expect(isLayoutGenuiMarkup(html)).toBe(true)
    for (const model of ['gpt-4o', 'gpt-4-1', 'gpt-5-5', 'gpt-3.5', 'o3-mini', 'chatgpt-4o-latest', 'text-davinci-002-render-sha']) {
      expect(isLayoutGenuiMarkup(html, model)).toBe(false)
      expect(genuiToMarkdown(html, model)).toBe(html)
    }
  })
})
