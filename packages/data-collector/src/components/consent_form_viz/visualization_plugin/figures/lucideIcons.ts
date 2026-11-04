// The whole Lucide icon set by name, for layout_icon. Only imported by
// lucide_by_name, so it's only loaded when a message has an icon.

import * as lucide from 'lucide-react'
import type { LucideIcon } from 'lucide-react'

// Only icons count, not the package's other exports (Icon, LucideProvider,
// ...). Older names (e.g. alert-triangle, now triangle-alert) are exported as
// the same icon, so they're found too.
const ICONS = new Set<unknown>(Object.values(lucide.icons))
const EXPORTS = lucide as unknown as Record<string, unknown>

// An icon by its Lucide name (alert-triangle), as ChatGPT writes it.
export function lucideIcon (name: string): LucideIcon | undefined {
  const exportName = name.trim().split(/[-_\s]+/).map(part => part.charAt(0).toUpperCase() + part.slice(1)).join('')
  const icon = Object.hasOwn(EXPORTS, exportName) ? EXPORTS[exportName] : undefined
  return ICONS.has(icon) ? icon as LucideIcon : undefined
}
