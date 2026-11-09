export const PROFILE_AVATARS = [
  { id: 'original', label: 'Original', src: '/images/pepecasa-hoodie-avatar.png' },
  { id: 'cobalt', label: 'Cobalt', src: '/avatars/hooded-cobalt.png' },
  { id: 'emerald', label: 'Emerald', src: '/avatars/hooded-emerald.png' },
  { id: 'amethyst', label: 'Amethyst', src: '/avatars/hooded-amethyst.png' },
  { id: 'crimson', label: 'Crimson', src: '/avatars/hooded-crimson.png' },
  { id: 'bronze', label: 'Bronze', src: '/avatars/hooded-bronze.png' },
  { id: 'arctic', label: 'Arctic', src: '/avatars/hooded-arctic.png' },
  { id: 'forest', label: 'Forest', src: '/avatars/hooded-forest.png' },
  { id: 'rose', label: 'Rose', src: '/avatars/hooded-rose.png' },
  { id: 'silver', label: 'Silver', src: '/avatars/hooded-silver.png' },
] as const

export type ProfileAvatarSrc = (typeof PROFILE_AVATARS)[number]['src']

export const DEFAULT_PROFILE_AVATAR = PROFILE_AVATARS[0].src

export function isProfileAvatar(value: unknown): value is ProfileAvatarSrc {
  return typeof value === 'string' && PROFILE_AVATARS.some((avatar) => avatar.src === value)
}

export function getProfileAvatar(value: unknown): ProfileAvatarSrc {
  return isProfileAvatar(value) ? value : DEFAULT_PROFILE_AVATAR
}
