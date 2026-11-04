// A Lucide icon drawn by its name, loaded lazily by layout_icon together
// with the whole icon set (lucideIcons).

import { createElement } from 'react'
import type { CSSProperties } from 'react'
import { lucideIcon } from './lucideIcons'

interface Props {
  name: string
  size: number
  className: string
  style?: CSSProperties
}

export default function LucideByName ({ name, size, className, style }: Props) {
  const icon = lucideIcon(name)
  if (icon == null) return null
  return createElement(icon, { 'aria-hidden': true, size, className, style })
}
