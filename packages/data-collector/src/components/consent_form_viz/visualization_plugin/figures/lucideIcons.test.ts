import { CircleCheckBig, Cpu, Grid2x2, TriangleAlert } from 'lucide-react'
import { lucideIcon } from './lucideIcons'

describe('lucideIcon', () => {
  it('finds an icon by its Lucide name', () => {
    expect(lucideIcon('cpu')).toBe(Cpu)
    expect(lucideIcon('triangle-alert')).toBe(TriangleAlert)
    expect(lucideIcon('grid-2x2')).toBe(Grid2x2)
  })

  it('finds an icon by an older name', () => {
    expect(lucideIcon('alert-triangle')).toBe(TriangleAlert)
    expect(lucideIcon('check-circle')).toBe(CircleCheckBig)
  })

  it('finds every icon seen in the test exports', () => {
    const names = [
      'alert-triangle', 'app-window', 'arrow-down', 'arrow-down-up', 'arrow-right', 'book-open', 'cable',
      'chart-no-axes-combined', 'check-circle', 'cloud-rain', 'code', 'copy', 'cpu', 'file-text', 'flask-conical',
      'git-branch', 'git-compare', 'globe', 'hand', 'message-circle', 'message-square', 'monitor-smartphone',
      'network', 'radio-tower', 'ruler', 'server', 'settings', 'shield-alert', 'shield-check', 'smartphone',
      'target', 'thermometer', 'thermometer-snowflake', 'thermometer-sun', 'timer', 'trending-up', 'users',
      'wifi', 'wifi-off', 'wind', 'wrench', 'zap'
    ]
    expect(names.filter(name => lucideIcon(name) == null)).toEqual([])
  })

  it('leaves out names that are not an icon', () => {
    expect(lucideIcon('not-an-icon')).toBeUndefined()
    expect(lucideIcon('icon')).toBeUndefined()
    expect(lucideIcon('lucide-provider')).toBeUndefined()
    expect(lucideIcon('to-string')).toBeUndefined()
    expect(lucideIcon('')).toBeUndefined()
  })
})
