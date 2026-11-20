export const PEPE_VERSE_DAILY_REWARDS = [20, 30, 20, 40, 50, 25, 75] as const
export const PEPE_VERSE_TASK_REWARDS = {
  faucet: 10,
  ptc: 10,
  shortlink: 10,
  watch: 10,
  invite: 15,
} as const
export const PEPE_VERSE_TOURNAMENT_PRIZES = [100, 50, 25] as const
export const PEPE_VERSE_DAILY_LIMIT = 5

export const PEPE_VERSE_TASKS = [
  {
    code: 'faucet',
    title: 'Claim the Manual Faucet',
    description: 'Complete a verified faucet claim today.',
    sources: ['manual_faucet', 'manual_claim'],
    href: '/manual-faucet',
    icon: 'droplet',
  },
  {
    code: 'ptc',
    title: 'Watch a PTC ad',
    description: 'Finish a verified paid-to-click ad today.',
    sources: ['adslab_ptc', 'view_ads', 'advertiser_task'],
    href: '/view-ads',
    icon: 'play',
  },
  {
    code: 'shortlink',
    title: 'Complete a Shortlink',
    description: 'Finish a verified shortlink today.',
    sources: ['adslab_shortlink', 'shortlink'],
    href: '/shortlinks',
    icon: 'link',
  },
  {
    code: 'watch',
    title: 'Watch & Earn',
    description: 'Complete an approved video activity today.',
    sources: ['applixir_video', 'youtube_advertiser_task'],
    href: '/watch-and-earn',
    icon: 'clapperboard',
  },
  {
    code: 'invite',
    title: 'Refer an active friend',
    description: 'A referral must complete a qualifying earning activity today.',
    sources: [],
    href: '/referrals',
    icon: 'users',
  },
] as const

export const PEPE_VERSE_SKINS = [
  { id: 'neon-runner', name: 'Neon Runner', cost: 0, color: 'cyan' },
  { id: 'violet-pulse', name: 'Violet Pulse', cost: 120, color: 'violet' },
  { id: 'solar-drift', name: 'Solar Drift', cost: 240, color: 'amber' },
  { id: 'aurora-guard', name: 'Aurora Guard', cost: 360, color: 'emerald' },
] as const

export type PepeVerseTaskCode = (typeof PEPE_VERSE_TASKS)[number]['code']

export const PEPE_VERSE_ACHIEVEMENTS = [
  { id: 'first-flight', title: 'First Flight', description: 'Claim your first PEPE VERSE reward.' },
  { id: 'seven-day-streak', title: 'Seven-day Streak', description: 'Claim rewards seven days in a row.' },
  { id: 'task-runner', title: 'Task Runner', description: 'Claim rewards across every daily task.' },
  { id: 'tournament-podium', title: 'Podium Finish', description: 'Claim a weekly tournament prize.' },
] as const
