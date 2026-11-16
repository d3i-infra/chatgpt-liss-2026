import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { Progress } from './progress'
import { ProgressFactory } from './factory'

const body = {
  __type__: 'PropsUIPromptProgress' as const,
  text: { translations: { en: 'Sending part 2 of 7.', nl: 'Deel 2 van 7 wordt verstuurd.' } },
}

describe('Progress', () => {
  it('announces the message in the participant locale', () => {
    const html = renderToStaticMarkup(createElement(Progress, { ...body, locale: 'nl' } as any))
    expect(html).toContain('role="status"')
    expect(html).toContain('Deel 2 van 7 wordt verstuurd.')
  })

  it('is created only for its own prompt type', () => {
    const factory = new ProgressFactory()
    expect(factory.create(body, { locale: 'en' })).not.toBeNull()
    expect(factory.create({ __type__: 'PropsUIPromptText' }, { locale: 'en' })).toBeNull()
  })
})
