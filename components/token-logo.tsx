import { HomeroTokenLogo } from '@/components/homero-token-logo'
import { PepeTokenLogo } from '@/components/pepe-token-logo'
import type { WalletCoinSymbol } from '@/lib/wallet-assets'

type Props = {
  symbol: WalletCoinSymbol
  size?: number
  className?: string
}

export function TokenLogo({ symbol, size = 16, className }: Props) {
  return symbol === 'HOMERO'
    ? <HomeroTokenLogo size={size} className={className} />
    : <PepeTokenLogo size={size} className={className} />
}
