export type TaskCardPalette = {
  surface: string
  glow: string
  label: string
  metric: string
  accent: string
  divider: string
  button: string
  pending: string
}

const taskCardPalettes: TaskCardPalette[] = [
  {
    surface: 'border-cyan-400/30 bg-gradient-to-br from-cyan-50/90 via-white to-sky-50/80 dark:border-cyan-300/25 dark:from-cyan-500/[0.15] dark:via-[#111a2b] dark:to-sky-950/35',
    glow: 'bg-cyan-400/20 dark:bg-cyan-400/[0.18]',
    label: 'border-cyan-400/25 bg-cyan-500/10 text-cyan-800 dark:text-cyan-200',
    metric: 'border-cyan-400/25 bg-white/70 text-cyan-800 dark:bg-cyan-500/[0.09] dark:text-cyan-100',
    accent: 'text-cyan-600 dark:text-cyan-300',
    divider: 'bg-gradient-to-r from-transparent via-cyan-400/35 to-transparent',
    button: 'bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-500 hover:to-blue-500 focus-visible:ring-cyan-400',
    pending: 'border-cyan-400/25 bg-cyan-500/[0.08] text-cyan-700 dark:text-cyan-200',
  },
  {
    surface: 'border-violet-400/30 bg-gradient-to-br from-violet-50/90 via-white to-fuchsia-50/80 dark:border-violet-300/25 dark:from-violet-500/[0.15] dark:via-[#111a2b] dark:to-fuchsia-950/35',
    glow: 'bg-violet-400/20 dark:bg-violet-400/[0.18]',
    label: 'border-violet-400/25 bg-violet-500/10 text-violet-800 dark:text-violet-200',
    metric: 'border-violet-400/25 bg-white/70 text-violet-800 dark:bg-violet-500/[0.09] dark:text-violet-100',
    accent: 'text-violet-600 dark:text-violet-300',
    divider: 'bg-gradient-to-r from-transparent via-violet-400/35 to-transparent',
    button: 'bg-gradient-to-r from-violet-600 to-fuchsia-600 hover:from-violet-500 hover:to-fuchsia-500 focus-visible:ring-violet-400',
    pending: 'border-violet-400/25 bg-violet-500/[0.08] text-violet-700 dark:text-violet-200',
  },
  {
    surface: 'border-emerald-400/30 bg-gradient-to-br from-emerald-50/90 via-white to-teal-50/80 dark:border-emerald-300/25 dark:from-emerald-500/[0.14] dark:via-[#111a2b] dark:to-teal-950/35',
    glow: 'bg-emerald-400/20 dark:bg-emerald-400/[0.18]',
    label: 'border-emerald-400/25 bg-emerald-500/10 text-emerald-800 dark:text-emerald-200',
    metric: 'border-emerald-400/25 bg-white/70 text-emerald-800 dark:bg-emerald-500/[0.09] dark:text-emerald-100',
    accent: 'text-emerald-600 dark:text-emerald-300',
    divider: 'bg-gradient-to-r from-transparent via-emerald-400/35 to-transparent',
    button: 'bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 focus-visible:ring-emerald-400',
    pending: 'border-emerald-400/25 bg-emerald-500/[0.08] text-emerald-700 dark:text-emerald-200',
  },
  {
    surface: 'border-amber-400/30 bg-gradient-to-br from-amber-50/90 via-white to-orange-50/80 dark:border-amber-300/25 dark:from-amber-500/[0.14] dark:via-[#111a2b] dark:to-orange-950/35',
    glow: 'bg-amber-400/20 dark:bg-amber-400/[0.18]',
    label: 'border-amber-400/25 bg-amber-500/10 text-amber-800 dark:text-amber-200',
    metric: 'border-amber-400/25 bg-white/70 text-amber-800 dark:bg-amber-500/[0.09] dark:text-amber-100',
    accent: 'text-amber-600 dark:text-amber-300',
    divider: 'bg-gradient-to-r from-transparent via-amber-400/35 to-transparent',
    button: 'bg-gradient-to-r from-amber-500 to-orange-600 hover:from-amber-400 hover:to-orange-500 focus-visible:ring-amber-400',
    pending: 'border-amber-400/25 bg-amber-500/[0.08] text-amber-700 dark:text-amber-200',
  },
  {
    surface: 'border-rose-400/30 bg-gradient-to-br from-rose-50/90 via-white to-pink-50/80 dark:border-rose-300/25 dark:from-rose-500/[0.14] dark:via-[#111a2b] dark:to-pink-950/35',
    glow: 'bg-rose-400/20 dark:bg-rose-400/[0.18]',
    label: 'border-rose-400/25 bg-rose-500/10 text-rose-800 dark:text-rose-200',
    metric: 'border-rose-400/25 bg-white/70 text-rose-800 dark:bg-rose-500/[0.09] dark:text-rose-100',
    accent: 'text-rose-600 dark:text-rose-300',
    divider: 'bg-gradient-to-r from-transparent via-rose-400/35 to-transparent',
    button: 'bg-gradient-to-r from-rose-600 to-pink-600 hover:from-rose-500 hover:to-pink-500 focus-visible:ring-rose-400',
    pending: 'border-rose-400/25 bg-rose-500/[0.08] text-rose-700 dark:text-rose-200',
  },
  {
    surface: 'border-indigo-400/30 bg-gradient-to-br from-indigo-50/90 via-white to-blue-50/80 dark:border-indigo-300/25 dark:from-indigo-500/[0.15] dark:via-[#111a2b] dark:to-blue-950/35',
    glow: 'bg-indigo-400/20 dark:bg-indigo-400/[0.18]',
    label: 'border-indigo-400/25 bg-indigo-500/10 text-indigo-800 dark:text-indigo-200',
    metric: 'border-indigo-400/25 bg-white/70 text-indigo-800 dark:bg-indigo-500/[0.09] dark:text-indigo-100',
    accent: 'text-indigo-600 dark:text-indigo-300',
    divider: 'bg-gradient-to-r from-transparent via-indigo-400/35 to-transparent',
    button: 'bg-gradient-to-r from-indigo-600 to-blue-600 hover:from-indigo-500 hover:to-blue-500 focus-visible:ring-indigo-400',
    pending: 'border-indigo-400/25 bg-indigo-500/[0.08] text-indigo-700 dark:text-indigo-200',
  },
  {
    surface: 'border-sky-400/30 bg-gradient-to-br from-sky-50/90 via-white to-blue-50/80 dark:border-sky-300/25 dark:from-sky-500/[0.15] dark:via-[#111a2b] dark:to-blue-950/35',
    glow: 'bg-sky-400/20 dark:bg-sky-400/[0.18]',
    label: 'border-sky-400/25 bg-sky-500/10 text-sky-800 dark:text-sky-200',
    metric: 'border-sky-400/25 bg-white/70 text-sky-800 dark:bg-sky-500/[0.09] dark:text-sky-100',
    accent: 'text-sky-600 dark:text-sky-300',
    divider: 'bg-gradient-to-r from-transparent via-sky-400/35 to-transparent',
    button: 'bg-gradient-to-r from-sky-600 to-blue-600 hover:from-sky-500 hover:to-blue-500 focus-visible:ring-sky-400',
    pending: 'border-sky-400/25 bg-sky-500/[0.08] text-sky-700 dark:text-sky-200',
  },
  {
    surface: 'border-orange-400/30 bg-gradient-to-br from-orange-50/90 via-white to-amber-50/80 dark:border-orange-300/25 dark:from-orange-500/[0.14] dark:via-[#111a2b] dark:to-amber-950/35',
    glow: 'bg-orange-400/20 dark:bg-orange-400/[0.18]',
    label: 'border-orange-400/25 bg-orange-500/10 text-orange-800 dark:text-orange-200',
    metric: 'border-orange-400/25 bg-white/70 text-orange-800 dark:bg-orange-500/[0.09] dark:text-orange-100',
    accent: 'text-orange-600 dark:text-orange-300',
    divider: 'bg-gradient-to-r from-transparent via-orange-400/35 to-transparent',
    button: 'bg-gradient-to-r from-orange-500 to-amber-600 hover:from-orange-400 hover:to-amber-500 focus-visible:ring-orange-400',
    pending: 'border-orange-400/25 bg-orange-500/[0.08] text-orange-700 dark:text-orange-200',
  },
]

function hashSeed(seed: string | number) {
  if (typeof seed === 'number') return Math.abs(Math.trunc(seed) - 1)

  let hash = 2166136261
  for (let index = 0; index < seed.length; index += 1) {
    hash = Math.imul(hash ^ seed.charCodeAt(index), 16777619)
  }
  return hash >>> 0
}

export function getTaskCardPalette(seed: string | number): TaskCardPalette {
  return taskCardPalettes[hashSeed(seed) % taskCardPalettes.length]
}
