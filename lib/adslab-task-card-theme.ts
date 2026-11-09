const taskCardPalettes = [
  {
    card: 'border-sky-300/90 bg-gradient-to-br from-[#dff3ff] via-[#eaf8ff] to-[#c9edff] text-slate-900 shadow-[0_18px_36px_rgba(14,165,233,0.15)] hover:border-sky-400 dark:border-sky-300/20 dark:from-[#173c62] dark:via-[#17344f] dark:to-[#104657] dark:text-white dark:shadow-[0_18px_42px_rgba(0,0,0,0.32),inset_0_1px_0_rgba(255,255,255,0.06)] dark:hover:border-sky-200/40',
    glow: 'bg-sky-400/30 dark:bg-sky-400/20',
    stripe: 'from-sky-400 via-blue-500 to-cyan-300',
    icon: 'border-sky-200 bg-white/80 text-sky-700 shadow-[0_8px_18px_rgba(14,165,233,0.14)] ring-4 ring-sky-100/70 dark:border-white/15 dark:bg-white/10 dark:text-sky-100 dark:ring-white/[0.04]',
    duration: 'border-blue-200 bg-white/75 text-blue-800 dark:border-blue-200/20 dark:bg-blue-300/10 dark:text-blue-100',
    reward: 'border-emerald-200 bg-emerald-50/90 text-emerald-800 dark:border-emerald-200/20 dark:bg-emerald-300/10 dark:text-emerald-100',
    count: 'border-sky-200 bg-white/65 text-slate-700 dark:border-white/10 dark:bg-white/[0.06] dark:text-slate-200',
    button: 'from-blue-700 via-sky-600 to-cyan-700 shadow-[0_12px_22px_rgba(14,165,233,0.23)]',
  },
  {
    card: 'border-violet-300/90 bg-gradient-to-br from-[#f0e5ff] via-[#f8f1ff] to-[#e7d8ff] text-slate-900 shadow-[0_18px_36px_rgba(139,92,246,0.15)] hover:border-violet-400 dark:border-violet-300/20 dark:from-[#3b285e] dark:via-[#302649] dark:to-[#4f2c5c] dark:text-white dark:shadow-[0_18px_42px_rgba(0,0,0,0.32),inset_0_1px_0_rgba(255,255,255,0.06)] dark:hover:border-violet-200/40',
    glow: 'bg-violet-400/30 dark:bg-violet-400/20',
    stripe: 'from-violet-400 via-fuchsia-500 to-pink-400',
    icon: 'border-violet-200 bg-white/80 text-violet-700 shadow-[0_8px_18px_rgba(139,92,246,0.14)] ring-4 ring-violet-100/70 dark:border-white/15 dark:bg-white/10 dark:text-violet-100 dark:ring-white/[0.04]',
    duration: 'border-violet-200 bg-white/75 text-violet-800 dark:border-violet-200/20 dark:bg-violet-300/10 dark:text-violet-100',
    reward: 'border-fuchsia-200 bg-fuchsia-50/90 text-fuchsia-800 dark:border-fuchsia-200/20 dark:bg-fuchsia-300/10 dark:text-fuchsia-100',
    count: 'border-violet-200 bg-white/65 text-slate-700 dark:border-white/10 dark:bg-white/[0.06] dark:text-slate-200',
    button: 'from-violet-700 via-purple-600 to-fuchsia-700 shadow-[0_12px_22px_rgba(168,85,247,0.23)]',
  },
  {
    card: 'border-amber-300/90 bg-gradient-to-br from-[#fff0d9] via-[#fff8e9] to-[#ffe4bd] text-slate-900 shadow-[0_18px_36px_rgba(245,158,11,0.15)] hover:border-amber-400 dark:border-amber-300/20 dark:from-[#583923] dark:via-[#432f26] dark:to-[#61401f] dark:text-white dark:shadow-[0_18px_42px_rgba(0,0,0,0.32),inset_0_1px_0_rgba(255,255,255,0.06)] dark:hover:border-amber-200/40',
    glow: 'bg-amber-400/30 dark:bg-amber-400/20',
    stripe: 'from-amber-400 via-orange-500 to-yellow-300',
    icon: 'border-amber-200 bg-white/80 text-amber-700 shadow-[0_8px_18px_rgba(245,158,11,0.14)] ring-4 ring-amber-100/70 dark:border-white/15 dark:bg-white/10 dark:text-amber-100 dark:ring-white/[0.04]',
    duration: 'border-amber-200 bg-white/75 text-amber-900 dark:border-amber-200/20 dark:bg-amber-300/10 dark:text-amber-100',
    reward: 'border-orange-200 bg-orange-50/90 text-orange-800 dark:border-orange-200/20 dark:bg-orange-300/10 dark:text-orange-100',
    count: 'border-amber-200 bg-white/65 text-slate-700 dark:border-white/10 dark:bg-white/[0.06] dark:text-slate-200',
    button: 'from-amber-700 via-orange-600 to-rose-700 shadow-[0_12px_22px_rgba(249,115,22,0.23)]',
  },
  {
    card: 'border-emerald-300/90 bg-gradient-to-br from-[#def9e9] via-[#effcf3] to-[#c9f2dc] text-slate-900 shadow-[0_18px_36px_rgba(16,185,129,0.15)] hover:border-emerald-400 dark:border-emerald-300/20 dark:from-[#17483f] dark:via-[#183a39] dark:to-[#155047] dark:text-white dark:shadow-[0_18px_42px_rgba(0,0,0,0.32),inset_0_1px_0_rgba(255,255,255,0.06)] dark:hover:border-emerald-200/40',
    glow: 'bg-emerald-400/30 dark:bg-emerald-400/20',
    stripe: 'from-emerald-400 via-teal-500 to-lime-300',
    icon: 'border-emerald-200 bg-white/80 text-emerald-700 shadow-[0_8px_18px_rgba(16,185,129,0.14)] ring-4 ring-emerald-100/70 dark:border-white/15 dark:bg-white/10 dark:text-emerald-100 dark:ring-white/[0.04]',
    duration: 'border-teal-200 bg-white/75 text-teal-800 dark:border-teal-200/20 dark:bg-teal-300/10 dark:text-teal-100',
    reward: 'border-emerald-200 bg-white/80 text-emerald-800 dark:border-emerald-200/20 dark:bg-emerald-300/10 dark:text-emerald-100',
    count: 'border-emerald-200 bg-white/65 text-slate-700 dark:border-white/10 dark:bg-white/[0.06] dark:text-slate-200',
    button: 'from-emerald-700 via-teal-600 to-cyan-700 shadow-[0_12px_22px_rgba(16,185,129,0.23)]',
  },
  {
    card: 'border-rose-300/90 bg-gradient-to-br from-[#ffe5ec] via-[#fff1f4] to-[#ffd8e3] text-slate-900 shadow-[0_18px_36px_rgba(244,63,94,0.15)] hover:border-rose-400 dark:border-rose-300/20 dark:from-[#542d48] dark:via-[#412944] dark:to-[#652f49] dark:text-white dark:shadow-[0_18px_42px_rgba(0,0,0,0.32),inset_0_1px_0_rgba(255,255,255,0.06)] dark:hover:border-rose-200/40',
    glow: 'bg-rose-400/30 dark:bg-rose-400/20',
    stripe: 'from-rose-400 via-pink-500 to-orange-300',
    icon: 'border-rose-200 bg-white/80 text-rose-700 shadow-[0_8px_18px_rgba(244,63,94,0.14)] ring-4 ring-rose-100/70 dark:border-white/15 dark:bg-white/10 dark:text-rose-100 dark:ring-white/[0.04]',
    duration: 'border-rose-200 bg-white/75 text-rose-800 dark:border-rose-200/20 dark:bg-rose-300/10 dark:text-rose-100',
    reward: 'border-pink-200 bg-pink-50/90 text-pink-800 dark:border-pink-200/20 dark:bg-pink-300/10 dark:text-pink-100',
    count: 'border-rose-200 bg-white/65 text-slate-700 dark:border-white/10 dark:bg-white/[0.06] dark:text-slate-200',
    button: 'from-rose-700 via-pink-600 to-orange-700 shadow-[0_12px_22px_rgba(244,63,94,0.23)]',
  },
] as const

export function getAdsLabTaskCardPalette(seed: string) {
  let hash = 0
  for (const character of seed) hash = (hash * 31 + character.charCodeAt(0)) | 0
  return taskCardPalettes[Math.abs(hash % taskCardPalettes.length)]
}
