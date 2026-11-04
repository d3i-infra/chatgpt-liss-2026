// An <icon> of the gpt-6 layout dialect (see genuiMarkup). The export has
// only the icon's name, from the open-source Lucide set ChatGPT draws them
// with; the icons themselves are bundled here, so nothing is fetched. Only
// the icons below are bundled, as including the whole set by name would
// grow the app a lot; any other icon is decorative and left out.

import {
  AppWindow, ArrowDown, ArrowDownUp, ArrowLeft, ArrowLeftRight, ArrowRight, ArrowUp, Battery, BookOpen, Cable, Calendar,
  ChartNoAxesCombined, Check, CircleAlert, CircleCheck, CircleHelp, CircleX, Clock, Cloud, CloudRain, Code, Copy, Cpu,
  Database, Download, Droplet, Euro, ExternalLink, FileText, FlaskConical, GitBranch, GitCompare, Globe, Hand, Heart,
  House, Info, Layers, Leaf, Lightbulb, Link, List, Lock, LucideIcon, Mail, MapPin, MessageCircle, MessageSquare,
  Minus, MonitorSmartphone, Moon, Network, Package, Phone, Plug, Plus, RadioTower, Rocket, Ruler, Search, Server,
  Settings, ShieldAlert, ShieldCheck, ShoppingCart, Smartphone, Sparkles, Star, Sun, Target, Thermometer,
  ThermometerSnowflake, ThermometerSun, Timer, TrendingDown, TrendingUp, TriangleAlert, Truck, Upload, User, Users,
  Wifi, WifiOff, Wind, Wrench, X, Zap
} from 'lucide-react'
import { iconColorStyle } from './layoutStyles'

// By Lucide's names, including the older ones ChatGPT still uses (e.g.
// alert-triangle, now triangle-alert).
const ICONS: Record<string, LucideIcon> = {
  'alert-circle': CircleAlert,
  'alert-triangle': TriangleAlert,
  'app-window': AppWindow,
  'arrow-down': ArrowDown,
  'arrow-down-up': ArrowDownUp,
  'arrow-left': ArrowLeft,
  'arrow-left-right': ArrowLeftRight,
  'arrow-right': ArrowRight,
  'arrow-up': ArrowUp,
  battery: Battery,
  'book-open': BookOpen,
  cable: Cable,
  calendar: Calendar,
  'chart-no-axes-combined': ChartNoAxesCombined,
  check: Check,
  'check-circle': CircleCheck,
  'circle-alert': CircleAlert,
  'circle-check': CircleCheck,
  'circle-help': CircleHelp,
  'circle-x': CircleX,
  clock: Clock,
  cloud: Cloud,
  'cloud-rain': CloudRain,
  code: Code,
  copy: Copy,
  cpu: Cpu,
  database: Database,
  download: Download,
  droplet: Droplet,
  euro: Euro,
  'external-link': ExternalLink,
  'file-text': FileText,
  'flask-conical': FlaskConical,
  'git-branch': GitBranch,
  'git-compare': GitCompare,
  globe: Globe,
  hand: Hand,
  heart: Heart,
  'help-circle': CircleHelp,
  home: House,
  house: House,
  info: Info,
  layers: Layers,
  leaf: Leaf,
  lightbulb: Lightbulb,
  link: Link,
  list: List,
  lock: Lock,
  mail: Mail,
  'map-pin': MapPin,
  'message-circle': MessageCircle,
  'message-square': MessageSquare,
  minus: Minus,
  'monitor-smartphone': MonitorSmartphone,
  moon: Moon,
  network: Network,
  package: Package,
  phone: Phone,
  plug: Plug,
  plus: Plus,
  'radio-tower': RadioTower,
  rocket: Rocket,
  ruler: Ruler,
  search: Search,
  server: Server,
  settings: Settings,
  'shield-alert': ShieldAlert,
  'shield-check': ShieldCheck,
  'shopping-cart': ShoppingCart,
  smartphone: Smartphone,
  sparkles: Sparkles,
  star: Star,
  sun: Sun,
  target: Target,
  thermometer: Thermometer,
  'thermometer-snowflake': ThermometerSnowflake,
  'thermometer-sun': ThermometerSun,
  timer: Timer,
  'trending-down': TrendingDown,
  'trending-up': TrendingUp,
  'triangle-alert': TriangleAlert,
  truck: Truck,
  upload: Upload,
  user: User,
  users: Users,
  wifi: Wifi,
  'wifi-off': WifiOff,
  wind: Wind,
  wrench: Wrench,
  x: X,
  'x-circle': CircleX,
  zap: Zap
}

const SIZES: Record<string, number> = { xs: 12, sm: 14, md: 16, lg: 20, xl: 24, '2xl': 32 }

interface Props {
  name: string
  size?: string
  color?: string
}

export function LayoutIcon ({ name, size, color }: Props) {
  const Icon = Object.hasOwn(ICONS, name) ? ICONS[name] : undefined
  if (Icon == null) return null
  const { className, style } = iconColorStyle(color)
  return <Icon aria-hidden size={SIZES[size ?? ''] ?? SIZES.md} className={`inline-block shrink-0 align-middle ${className}`} style={style} />
}
