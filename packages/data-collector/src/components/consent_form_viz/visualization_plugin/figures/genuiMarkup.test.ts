import { genuiToMarkdown, decodeHtmlEntities, isGenuiMarkup } from './genuiMarkup'
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
