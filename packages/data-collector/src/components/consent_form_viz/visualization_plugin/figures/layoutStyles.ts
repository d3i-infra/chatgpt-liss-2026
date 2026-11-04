// Styling for the gpt-6 layout dialect's containers (box, row, grid,
// grid-item, text, title, badge - see genuiMarkup), from the attributes ChatGPT
// gave them. Close to how ChatGPT draws them: cards with a border or a tinted
// background, rows and grids as columns, and secondary/small text.
//
// Tailwind only generates classes it finds written out in the source, so
// every class is spelled in full in the tables below rather than assembled.

import type { CSSProperties } from 'react'

export interface ContainerStyle {
  className: string
  style?: CSSProperties
}

const GAP: Record<string, string> = { 0: 'gap-0', 1: 'gap-1', 2: 'gap-2', 3: 'gap-3', 4: 'gap-4', 5: 'gap-5', 6: 'gap-6' }
const PADDING: Record<string, string> = { 0: 'p-0', 1: 'p-1', 2: 'p-2', 3: 'p-3', 4: 'p-4', 5: 'p-5', 6: 'p-6' }
const RADIUS: Record<string, string> = { sm: 'rounded', md: 'rounded-lg', lg: 'rounded-xl', xl: 'rounded-2xl' }
const COLUMNS: Record<string, string> = { 1: 'grid-cols-1', 2: 'grid-cols-2', 3: 'grid-cols-3', 4: 'grid-cols-4' }
const ALIGN: Record<string, string> = { start: 'items-start', center: 'items-center', end: 'items-end' }
const JUSTIFY: Record<string, string> = { start: 'justify-start', center: 'justify-center', end: 'justify-end', between: 'justify-between' }
const BACKGROUND: Record<string, string> = { 'surface-secondary': 'bg-grey5', 'surface-tertiary': 'bg-grey4' }
const TEXT_SIZE: Record<string, string> = { xs: 'text-xs', sm: 'text-sm', md: 'text-base', lg: 'text-lg', xl: 'text-xl', '2xl': 'text-2xl' }
const TITLE_SIZE: Record<string, string> = { sm: 'text-sm', md: 'text-base', lg: 'text-lg', xl: 'text-xl', '2xl': 'text-2xl' }
const WEIGHT: Record<string, string> = { normal: 'font-normal', medium: 'font-medium', semibold: 'font-semibold', bold: 'font-bold' }
const COLOR: Record<string, string> = { secondary: 'text-[#666666]', success: 'text-[#3F8A1C]', warning: 'text-warningdark', danger: 'text-error', error: 'text-error' }
const TEXT_ALIGN: Record<string, string> = { start: 'text-left', left: 'text-left', center: 'text-center', end: 'text-right', right: 'text-right' }
// A badge is a small label, tinted by its color; without one it's white
// with a border, so it stands out on the grey message bubble.
const BADGE_COLOR: Record<string, string> = { success: 'bg-successlight text-[#3F8A1C]', warning: 'bg-warninglight text-warningdark', danger: 'bg-errorlight text-error', error: 'bg-errorlight text-error' }
const HEX_COLOR_RE = /^#[0-9a-f]{3,8}$/i

function attr (attrs: Record<string, unknown>, name: string): string | undefined {
  const value = attrs[name]
  return typeof value === 'string' || typeof value === 'number' ? String(value) : undefined
}

function pick (table: Record<string, string>, value: string | undefined): string | undefined {
  return value != null ? table[value] : undefined
}

// A badge's look; a badge is otherwise inline (see genuiMarkup), this is
// also used for one that is a container.
export function badgeClassName (color: string | undefined): string {
  return ['w-fit', 'rounded-full', 'px-2', 'py-0.5', 'text-xs', 'font-medium', pick(BADGE_COLOR, color) ?? 'bg-white border border-grey3 text-grey1'].join(' ')
}

// An icon's color (see layout_icon), by name or as a hex value.
export function iconColorStyle (color: string | undefined): ContainerStyle {
  if (color != null && HEX_COLOR_RE.test(color)) return { className: '', style: { color } }
  return { className: pick(COLOR, color) ?? '' }
}

export function containerStyle (name: string, attrs: Record<string, unknown>): ContainerStyle {
  const classes: Array<string | undefined> = []
  let style: CSSProperties | undefined

  if (name === 'box' || name === 'row' || name === 'grid' || name === 'grid-item') {
    // A grid spans its container's width, even in a box that centres its
    // content, as in ChatGPT.
    if (name === 'grid') classes.push('grid', 'w-full', 'self-stretch', pick(COLUMNS, attr(attrs, 'columns')) ?? 'grid-cols-1')
    else classes.push('flex', name === 'row' ? 'flex-row' : 'flex-col')
    classes.push('min-w-0', pick(GAP, attr(attrs, 'gap')) ?? (name === 'grid' ? 'gap-2' : undefined), pick(PADDING, attr(attrs, 'padding')))
    if (attrs.border === true) classes.push('border', 'border-grey3')
    classes.push(pick(RADIUS, attr(attrs, 'radius')))
    const align = attr(attrs, 'align')
    classes.push(pick(ALIGN, align), name !== 'row' && align === 'center' ? 'text-center' : undefined)
    classes.push(pick(JUSTIFY, attr(attrs, 'justify')))
    if (attr(attrs, 'wrap') === 'wrap') classes.push('flex-wrap')
    if (attr(attrs, 'flex') === '1') classes.push('flex-1')
    if (attr(attrs, 'width') === '100%') classes.push('w-full')
    const background = attr(attrs, 'background')
    if (background != null && HEX_COLOR_RE.test(background)) style = { backgroundColor: background }
    else classes.push(pick(BACKGROUND, background))
  } else if (name === 'text') {
    classes.push(pick(TEXT_SIZE, attr(attrs, 'size')), pick(WEIGHT, attr(attrs, 'weight')), pick(COLOR, attr(attrs, 'color')), pick(TEXT_ALIGN, attr(attrs, 'textAlign')))
  } else if (name === 'badge') {
    classes.push(badgeClassName(attr(attrs, 'color')))
  } else if (name === 'title') {
    classes.push('font-semibold', pick(TITLE_SIZE, attr(attrs, 'size')) ?? 'text-base', pick(COLOR, attr(attrs, 'color')))
  }

  return { className: classes.filter((c): c is string => c != null).join(' '), style }
}
