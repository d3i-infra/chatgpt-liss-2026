import { badgeClassName, containerStyle } from './layoutStyles'

describe('containerStyle', () => {
  it('draws a box with a border, padding and rounded corners as a column', () => {
    expect(containerStyle('box', { border: true, radius: 'md', padding: 2, gap: 1, align: 'center' }).className.split(' '))
      .toEqual(expect.arrayContaining(['flex', 'flex-col', 'border', 'border-grey3', 'rounded-lg', 'p-2', 'gap-1', 'items-center', 'text-center']))
  })

  it('lays out a grid in its number of columns, and a row side by side', () => {
    expect(containerStyle('grid', { columns: 2, gap: 2 }).className).toContain('grid-cols-2')
    expect(containerStyle('row', { align: 'start' }).className.split(' ')).toEqual(expect.arrayContaining(['flex-row', 'items-start']))
  })

  it('uses a hex background as is, and a named one from the theme', () => {
    expect(containerStyle('box', { background: '#DCECE5' }).style).toEqual({ backgroundColor: '#DCECE5' })
    expect(containerStyle('box', { background: 'surface-secondary' }).className).toContain('bg-grey5')
  })

  it('styles text and titles', () => {
    expect(containerStyle('text', { color: 'secondary', size: 'sm', textAlign: 'center' }).className.split(' '))
      .toEqual(expect.arrayContaining(['text-[#666666]', 'text-sm', 'text-center']))
    expect(containerStyle('title', { size: 'lg' }).className.split(' ')).toEqual(expect.arrayContaining(['font-semibold', 'text-lg']))
  })

  it('draws a badge as a small label, tinted by its color', () => {
    expect(containerStyle('badge', { color: 'success' }).className.split(' ')).toEqual(expect.arrayContaining(['w-fit', 'rounded-full', 'text-xs', 'bg-successlight']))
    expect(containerStyle('badge', {}).className.split(' ')).toEqual(expect.arrayContaining(['bg-white', 'border', 'text-grey1']))
  })

  it('gives an inline badge the same look', () => {
    expect(badgeClassName('success')).toBe(containerStyle('badge', { color: 'success' }).className)
  })

  it('ignores attributes it has no style for', () => {
    expect(containerStyle('box', { onClick: '() => x', gap: 99 }).className).toBe('flex flex-col min-w-0')
  })
})
