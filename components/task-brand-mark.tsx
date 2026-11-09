import Image from 'next/image'
import type { LucideIcon } from 'lucide-react'
import {
  Activity,
  BarChart3,
  Coins,
  Compass,
  Globe,
  Layers,
  Orbit,
  Radar,
  Sparkles,
  Target,
  TrendingUp,
  Wallet,
  Play,
  Star,
} from 'lucide-react'

type TaskBrandMarkProps = {
  name: string
  itemId?: string
  type?: 'ptc' | 'youtube' | 'legacy'
  size?: 'sm' | 'md'
  appearance?: 'default' | 'simple' | 'pro'
}

type BrandTheme = {
  background: string
  shadow: string
}

type BrandPreset = {
  icon: LucideIcon
  theme: BrandTheme
}

const themes = {
  blue: { background: 'from-blue-500 via-blue-600 to-indigo-700', shadow: 'shadow-blue-500/25' },
  violet: { background: 'from-violet-500 via-purple-600 to-indigo-700', shadow: 'shadow-violet-500/25' },
  emerald: { background: 'from-emerald-400 via-teal-500 to-cyan-700', shadow: 'shadow-emerald-500/25' },
  indigo: { background: 'from-indigo-400 via-indigo-600 to-blue-800', shadow: 'shadow-indigo-500/25' },
  cyan: { background: 'from-cyan-400 via-sky-500 to-blue-700', shadow: 'shadow-cyan-500/25' },
  amber: { background: 'from-amber-300 via-orange-500 to-rose-600', shadow: 'shadow-amber-500/25' },
  sky: { background: 'from-sky-400 via-blue-500 to-violet-700', shadow: 'shadow-sky-500/25' },
  rose: { background: 'from-rose-400 via-pink-500 to-violet-700', shadow: 'shadow-rose-500/25' },
  orange: { background: 'from-orange-400 via-amber-500 to-yellow-700', shadow: 'shadow-orange-500/25' },
} satisfies Record<string, BrandTheme>

const taskBrandPresets: Record<string, BrandPreset> = {
  'pepe-casa-1': { icon: Compass, theme: themes.blue },
  'partner-2': { icon: Activity, theme: themes.violet },
  'pepe-casa-3': { icon: Coins, theme: themes.emerald },
  'partner-4': { icon: Orbit, theme: themes.indigo },
  'pepe-casa-5': { icon: Radar, theme: themes.cyan },
  'pepe-casa-6': { icon: Wallet, theme: themes.amber },
  'pepe-casa-7': { icon: Globe, theme: themes.sky },
  'pepe-casa-8': { icon: TrendingUp, theme: themes.emerald },
  'pepe-casa-9': { icon: Target, theme: themes.rose },
  'pepe-casa-10': { icon: BarChart3, theme: themes.violet },
  'pepe-casa-11': { icon: Layers, theme: themes.blue },
  'pepe-casa-12': { icon: Sparkles, theme: themes.orange },
}

export function TaskBrandMark({ itemId, type = 'legacy', size = 'md', appearance = 'default' }: TaskBrandMarkProps) {
  const preset = itemId ? taskBrandPresets[itemId] : undefined
  const Icon = appearance === 'pro' ? Star : preset?.icon ?? (type === 'youtube' ? Play : type === 'ptc' ? Globe : Sparkles)
  const theme = preset?.theme ?? (type === 'youtube' ? themes.rose : type === 'ptc' ? themes.blue : themes.violet)
  const dimensions = size === 'sm' ? 'size-10' : 'size-12'
  const iconSize = size === 'sm' ? 19 : 22

  if (type === 'youtube') {
    const surface = appearance === 'pro'
      ? 'border-amber-300 bg-gradient-to-br from-yellow-100 via-amber-50 to-amber-200/80 shadow-[0_0_20px_rgba(245,158,11,0.38)] ring-1 ring-amber-300/60 dark:border-amber-200/60 dark:from-amber-300/20 dark:via-amber-200/10 dark:to-yellow-400/20'
      : appearance === 'simple'
        ? 'border-cyan-200 bg-gradient-to-br from-sky-50 to-cyan-100 shadow-[0_0_14px_rgba(34,211,238,0.14)] dark:border-cyan-800 dark:from-blue-950/80 dark:to-cyan-950/70'
        : 'border-red-200 bg-red-50 shadow-[0_0_14px_rgba(239,68,68,0.16)] dark:border-red-500/30 dark:bg-red-950/30'

    return (
      <span aria-hidden="true" className={`flex shrink-0 items-center justify-center rounded-full border ${dimensions} ${surface}`}>
        <Image
          src="/youtube.svg"
          alt=""
          width={size === 'sm' ? 20 : 24}
          height={size === 'sm' ? 14 : 17}
          className={appearance === 'pro' ? 'drop-shadow-[0_0_7px_rgba(245,158,11,0.45)]' : 'drop-shadow-[0_1px_3px_rgba(0,0,0,0.25)]'}
        />
      </span>
    )
  }

  if (appearance !== 'default') {
    return (
      <span aria-hidden="true" className={`flex shrink-0 items-center justify-center rounded-full border shadow-sm ${dimensions} ${appearance === 'pro' ? 'border-amber-300 bg-gradient-to-br from-yellow-100 via-amber-50 to-amber-200/80 text-amber-600 shadow-[0_0_20px_rgba(245,158,11,0.38)] ring-1 ring-amber-300/60 dark:border-amber-200/60 dark:from-amber-300/20 dark:via-amber-200/10 dark:to-yellow-400/20 dark:text-amber-200' : 'border-cyan-200 bg-gradient-to-br from-sky-50 to-cyan-100 text-blue-600 shadow-cyan-500/15 dark:border-cyan-800 dark:from-blue-950/80 dark:to-cyan-950/70 dark:text-cyan-300'}`}>
        <Icon size={iconSize} strokeWidth={2} />
      </span>
    )
  }

  const defaultDimensions = size === 'sm' ? 'size-10 rounded-[15px]' : 'size-12 rounded-[18px]'

  return (
    <span
      aria-hidden="true"
      className={`relative flex shrink-0 items-center justify-center overflow-hidden border border-white/25 bg-gradient-to-br ${theme.background} ${theme.shadow} ${defaultDimensions} shadow-lg ring-1 ring-black/5`}
    >
      <span className="absolute inset-[3px] rounded-[13px] border border-white/20 bg-white/[0.08]" />
      <span className="absolute -left-3 -top-4 size-9 rounded-full bg-white/20 blur-md" />
      <Icon className="relative drop-shadow-sm" size={iconSize} strokeWidth={2} />
    </span>
  )
}
