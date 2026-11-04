import { resolveMessageReferences } from './chat_conversation'
import { groupAnswerParts } from './answerParts'
import { ContentReference, ConversationMessage } from '../types'

const cite = (...tokens: string[]): string => `cite${tokens.map(t => `${t}`).join('')}`

function webpage (title: string, refs: Array<[number, string, number]>): ContentReference {
  return {
    type: 'grouped_webpages',
    items: [{
      title,
      url: `https://example.org/${title}`,
      refs: refs.map(([turn_index, ref_type, ref_index]) => ({ turn_index, ref_type, ref_index }))
    }]
  } as unknown as ContentReference
}

function citedTitles (message: string, references: ContentReference[]): Array<string | undefined> {
  return resolveMessageReferences(message, references).flatMap(s => {
    if (s.kind !== 'ref') return []
    return [s.segment.kind === 'citation' ? s.segment.sources.map(src => src.title).join('+') : undefined]
  })
}

describe('resolveMessageReferences cite markers', () => {
  it('matches markers whose turn number is the refs turn_index', () => {
    const message = `a ${cite('turn0search3')} b ${cite('turn0news21', 'turn1view0')}`
    const refs = [webpage('A', [[0, 'search', 3]]), webpage('B', [[0, 'news', 21], [1, 'view', 0]])]
    expect(citedTitles(message, refs)).toEqual(['A', 'B'])
  })

  // Some exports put an opaque turn number in the marker (e.g. "turn111111")
  // while `refs` carry the real turn_index (e.g. 3). ref_type + ref_index
  // alone is ambiguous here: "view2" exists in turns 2, 3 and 5.
  it('resolves markers whose turn number differs from turn_index', () => {
    const message = [
      cite('turn111111view2', 'turn111111view4'),
      cite('turn222222search0', 'turn111111view1'),
      cite('turn333333search1', 'turn444444view3'),
      cite('turn444444view2'),
      cite('turn555555view2', 'turn555555view3'),
      cite('turn666666view1'),
      cite('turn666666view2')
    ].join(' ')
    const refs = [
      webpage('A', [[3, 'view', 2], [3, 'view', 4]]),
      webpage('B', [[4, 'search', 0], [3, 'view', 1]]),
      webpage('C', [[1, 'search', 1], [5, 'view', 3]]),
      webpage('D', [[5, 'view', 2]]),
      webpage('E', [[6, 'view', 2], [6, 'view', 3]]),
      webpage('F', [[2, 'view', 1]]),
      webpage('G', [[2, 'view', 2]])
    ]
    expect(citedTitles(message, refs)).toEqual(['A', 'B', 'C', 'D', 'E', 'F', 'G'])
  })

  it('keeps a marker unresolved when no entry covers all its tokens', () => {
    const message = cite('turn777777view9')
    expect(citedTitles(message, [webpage('A', [[1, 'view', 2]])])).toEqual([undefined])
  })
})

describe('resolveMessageReferences layout images', () => {
  it('shows a gpt-6 AsyncImage as a placeholder with its search phrase', () => {
    const segments = resolveMessageReferences(`a layout_imageShelly Pro 4PM`, [])
    expect(segments[1]).toEqual({ kind: 'ref', segment: { kind: 'imagePlaceholder', query: 'Shelly Pro 4PM' } })
  })
})

describe('resolveMessageReferences layout icons', () => {
  it('shows a gpt-6 icon by its name, size and color', () => {
    expect(resolveMessageReferences('\uE200icon\uE202cpu\uE202xl\uE202success\uE201', [])[0])
      .toEqual({ kind: 'ref', segment: { kind: 'layoutIcon', name: 'cpu', size: 'xl', color: 'success' } })
    expect(resolveMessageReferences('\uE200icon\uE202wifi\uE202\uE202\uE201', [])[0])
      .toEqual({ kind: 'ref', segment: { kind: 'layoutIcon', name: 'wifi', size: undefined, color: undefined } })
  })
})

describe('resolveMessageReferences layout badges', () => {
  it('shows a gpt-6 badge with its text and color', () => {
    expect(resolveMessageReferences('\uE200badge\uE202Zeer goed\uE202success\uE201', [])[0])
      .toEqual({ kind: 'ref', segment: { kind: 'layoutBadge', text: 'Zeer goed', color: 'success' } })
  })
})

describe('resolveMessageReferences gpt-6 citations', () => {
  const sources = [{ domain: 'a.example', entries: [{ url: 'https://a.example/1', title: 'A' }] }]

  it("opens the answer's sources, saying how many sources it cites", () => {
    const segments = resolveMessageReferences(`a ${cite('turn1search0', 'turn1search9')}`, [], { hiddenSlots: false, answerSources: sources })
    expect(segments[1]).toEqual({ kind: 'ref', segment: { kind: 'answerSourcesCitation', count: 2, sources } })
  })

  it('ignores content_references "hidden" slots when asked', () => {
    const hidden = [{ type: 'hidden' }] as unknown as ContentReference[]
    const kindOf = (opts?: { hiddenSlots?: boolean, answerSources?: typeof sources }): string | undefined => {
      const ref = resolveMessageReferences(`a ${cite('turn0search0')}`, hidden, opts).find(s => s.kind === 'ref')
      return ref?.kind === 'ref' ? ref.segment.kind : undefined
    }
    expect(kindOf()).toBe('hidden')
    expect(kindOf({ hiddenSlots: false, answerSources: sources })).toBe('answerSourcesCitation')
  })
})

describe('groupAnswerParts', () => {
  const msg = (id: string, role: string, reactionTo?: string, extra: Partial<ConversationMessage> = {}): ConversationMessage =>
    ({ id, messageId: id, role, reactionTo, message: id, ...extra })

  it('groups assistant messages that continue one another', () => {
    const messages = [msg('u1', 'user'), msg('a1', 'assistant', 'u1'), msg('a2', 'assistant', 'a1'), msg('a3', 'assistant', 'a2'), msg('u2', 'user', 'a3')]
    expect(groupAnswerParts(messages, m => m.contentType === 'thoughts').map(g => g.map(m => m.id))).toEqual([['u1'], ['a1', 'a2', 'a3'], ['u2']])
  })

  it('keeps regenerated replies, removed parts and labelled content apart', () => {
    const messages = [
      msg('u1', 'user'),
      msg('t1', 'assistant', 'u1', { contentType: 'thoughts' }),
      msg('a1', 'assistant', 't1'),
      msg('a2', 'assistant', 'a1', { removed: true }),
      msg('b1', 'assistant', 'u1', { hidden: true }),
    ]
    expect(groupAnswerParts(messages, m => m.contentType === 'thoughts').map(g => g.map(m => m.id))).toEqual([['u1'], ['t1'], ['a1'], ['a2'], ['b1']])
  })
})
