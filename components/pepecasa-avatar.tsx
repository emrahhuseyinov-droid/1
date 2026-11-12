import Image from 'next/image'

type PepeCasaAvatarProps = {
  size?: number
  className?: string
  src?: string
}

export function PepeCasaAvatar({ size = 40, className = '', src = '/images/pepecasa-hoodie-avatar.png' }: PepeCasaAvatarProps) {
  return (
    <span
      aria-hidden="true"
      className={`inline-flex shrink-0 overflow-hidden rounded-full shadow-[0_0_14px_rgba(16,185,129,0.16)] ${className}`}
      style={{ width: size, height: size }}
    >
      <Image
        src={src}
        alt=""
        width={size}
        height={size}
        className="block h-full w-full scale-[1.12] rounded-full object-cover"
      />
    </span>
  )
}
