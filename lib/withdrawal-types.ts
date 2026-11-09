export type WithdrawalStatus = 'pending' | 'paid' | 'rejected'

export type WithdrawalRequestView = {
  id: string
  faucetPayEmail: string
  amountAtomic: string
  status: WithdrawalStatus
  adminNote: string | null
  paymentReference: string | null
  createdAt: string
}

export type WithdrawalSnapshot = {
  availableBalanceAtomic: string
  todayUsedAtomic: string
  dailyRemainingAtomic: string
  dailyLimitAtomic: string
  minWithdrawalAtomic: string
  requests: WithdrawalRequestView[]
}
