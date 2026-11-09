'use client'

import Image from 'next/image'
import { cn } from '@/lib/utils'

type Props = {
  size?: number
  className?: string
}

export function HomeroTokenLogo({ size = 16, className }: Props) {
  return (
    <Image
      src="/homero-token.png"
      alt=""
      aria-hidden="true"
      width={size}
      height={size}
      sizes={`${size}px`}
      unoptimized
      className={cn('inline-block shrink-0 rounded-full object-cover ring-1 ring-amber-300/70', className)}
    />
  )
}
