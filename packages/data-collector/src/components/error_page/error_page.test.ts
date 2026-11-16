import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { ErrorPage } from './error_page'

const render = (props: Record<string, unknown>): string =>
  renderToStaticMarkup(createElement(ErrorPage, { __type__: 'PropsUIPageError', message: '', locale: 'en', ...props } as any))

describe('ErrorPage', () => {
  it('explains a memory failure and how to try again', () => {
    const html = render({ reason: 'memory', message: 'RangeError: Out of memory' })
    expect(html).toContain('ran out of memory')
    expect(html).toContain('reload this page')
  })

  it('explains a start failure', () => {
    expect(render({ reason: 'start' })).toContain('could not be started')
  })

  it('keeps the technical message collapsed', () => {
    const html = render({ reason: 'other', message: 'PythonError: boom' })
    expect(html).toMatch(/<details(?![^>]*\bopen\b)/)
    expect(html.slice(html.indexOf('<details'))).toContain('PythonError: boom')
    expect(html.slice(0, html.indexOf('<details'))).not.toContain('PythonError: boom')
  })

  it('offers Stop', () => {
    expect(render({ reason: 'other' })).toContain('Stop')
    expect(render({ reason: 'other', locale: 'nl' })).toContain('Stoppen')
  })
})
