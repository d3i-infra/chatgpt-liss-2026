// An <icon> of the gpt-6 layout dialect (see genuiMarkup). The export has
// only the icon's name, from the open-source Lucide set ChatGPT draws them
// with. The whole set is bundled with the app, so nothing is fetched from
// elsewhere; it's loaded the first time an icon is shown. A name that isn't
// a Lucide icon is left out.

import { lazy, Suspense } from 'react'
import { iconColorStyle } from './layoutStyles'

const LucideByName = lazy(async () => await import('./lucide_by_name'))

const SIZES: Record<string, number> = { xs: 12, sm: 14, md: 16, lg: 20, xl: 24, '2xl': 32 }

interface Props {
  name: string
  size?: string
  color?: string
}

export function LayoutIcon ({ name, size, color }: Props) {
  const { className, style } = iconColorStyle(color)
  return (
    <Suspense fallback={null}>
      <LucideByName name={name} size={SIZES[size ?? ''] ?? SIZES.md} className={`inline-block shrink-0 align-middle ${className}`} style={style} />
    </Suspense>
  )
}
