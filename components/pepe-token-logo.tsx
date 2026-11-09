import Image from 'next/image'
import { cn } from '@/lib/utils'

type Props = {
  size?: number
  className?: string
}

export function PepeTokenLogo({ size = 16, className }: Props) {
  return (
    <Image
      src="/pepe-token-logo.jpeg"
      alt=""
      aria-hidden="true"
      width={size}
      height={size}
      sizes={`${size}px`}
      className={cn('inline-block shrink-0 rounded-full object-cover', className)}
    />
  )
}
