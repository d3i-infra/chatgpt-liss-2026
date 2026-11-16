import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { TechnicalDetails } from './technical_details'
import { TechnicalDetailsFactory } from './factory'

const body = {
  __type__: 'PropsUIPromptTechnicalDetails' as const,
  summary: { translations: { en: 'Technical details', nl: 'Technische details' } },
  details: 'Traceback (most recent call last):\n  RuntimeError: boom',
}

function render (locale: string): string {
  return renderToStaticMarkup(createElement(TechnicalDetails, { ...body, locale } as any))
}

describe('TechnicalDetails', () => {
  it('renders the details collapsed by default', () => {
    const html = render('en')
    expect(html).toMatch(/^<details(?![^>]*\bopen\b)/)
    expect(html).toContain('<summary')
    expect(html).toContain('Technical details')
  })

  it('keeps the full details inside the collapsed section', () => {
    const html = render('en')
    const inside = html.slice(html.indexOf('</summary>'), html.indexOf('</details>'))
    expect(inside).toContain('RuntimeError: boom')
  })

  it('resolves the summary in the participant locale', () => {
    expect(render('nl')).toContain('Technische details')
  })
})

describe('TechnicalDetailsFactory', () => {
  it('renders only its own body type', () => {
    const factory = new TechnicalDetailsFactory()
    expect(factory.create({ __type__: 'PropsUIPromptText' }, { locale: 'en' } as any)).toBeNull()
    expect(factory.create(body, { locale: 'en' } as any)).not.toBeNull()
  })
})
