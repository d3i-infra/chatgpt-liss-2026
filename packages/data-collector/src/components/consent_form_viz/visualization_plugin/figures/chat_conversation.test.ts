import { resolveMessageReferences } from './chat_conversation'
import { ContentReference } from '../types'

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
