import Image from 'next/image'
import { cn } from '@/lib/utils'

type Props = {
  size?: number
  className?: string
  textClassName?: string
  showWordmark?: boolean
}

export function PepeCasaLogo({ size = 36, className, textClassName, showWordmark = true }: Props) {
  return (
    <span className={cn('inline-flex min-w-0 items-center gap-2.5', className)}>
      <Image
        src="/icon.svg"
        alt=""
        aria-hidden="true"
        width={size}
        height={size}
        sizes={`${size}px`}
        unoptimized
        className="shrink-0 object-contain"
      />
      {showWordmark && (
        <span className={cn('font-extrabold tracking-tight', textClassName)}>
          <span>pepe</span><span className="text-amber-300">.</span><span className="text-white/75">casa</span>
        </span>
      )}
    </span>
  )
}
