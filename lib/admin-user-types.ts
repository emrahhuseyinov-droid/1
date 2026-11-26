export type AdminUserSummary = {
  id: string
  name: string
  email: string
  emailVerified: boolean
  registeredAt: string
  guestId: string | null
  tasksCompleted: number
  recordedEvents: number
  arcadeRuns: number
  crushGames: number
  ptcCompletions: number
  youtubeCompletions: number
  latestActivityAt: string | null
}

export type AdminUsersResponse = {
  users: AdminUserSummary[]
  refreshedAt: string
}

export type AdminActivityItem = {
  eventId: string
  occurredAt: string
  kind: 'task' | 'game' | 'reward' | 'account' | 'promotion' | 'finance'
  title: string
  detail: string
  amount: string | null
  amountUnit: 'atomic' | 'token' | null
  tokenSymbol: string | null
}

export type AdminUserActivityPage = {
  user: Pick<AdminUserSummary, 'id' | 'name' | 'email' | 'registeredAt'>
  events: AdminActivityItem[]
  nextCursor: { occurredAt: string; eventId: string } | null
}
