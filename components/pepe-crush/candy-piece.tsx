import { Cherry, Citrus, Gem, Grape, Star, type LucideIcon } from 'lucide-react'
import { SPECIAL_BOMB, SPECIAL_COL_ROCKET, SPECIAL_RAINBOW, SPECIAL_ROW_ROCKET, type Tile } from '@/lib/pepe-crush/engine'

type CandyStyle = { gradient: string; icon: LucideIcon | null }

const CANDY_STYLES: CandyStyle[] = [
  { gradient: 'from-rose-400 via-red-500 to-rose-700', icon: Cherry },
  { gradient: 'from-amber-300 via-orange-500 to-orange-700', icon: Citrus },
  { gradient: 'from-yellow-200 via-yellow-400 to-amber-500', icon: Star },
  { gradient: 'from-lime-300 via-emerald-500 to-emerald-700', icon: null },
  { gradient: 'from-sky-300 via-cyan-500 to-blue-700', icon: Gem },
  { gradient: 'from-fuchsia-300 via-purple-500 to-violet-700', icon: Grape },
]

export function CandyPiece({ tile, selected = false }: { tile: Tile; selected?: boolean }) {
  if (tile.s === SPECIAL_RAINBOW) {
    return (
      <span className={`crush-candy crush-rainbow ${selected ? 'crush-selected' : ''}`}>
        <span className="crush-rainbow-core" />
      </span>
    )
  }
  const style = CANDY_STYLES[tile.c] ?? CANDY_STYLES[0]
  const Icon = style.icon
  return (
    <span className={`crush-candy bg-gradient-to-br ${style.gradient} ${selected ? 'crush-selected' : ''}`}>
      <span className="crush-shine" />
      {Icon ? (
        <Icon className="relative h-[55%] w-[55%] text-white drop-shadow-[0_2px_2px_rgba(0,0,0,0.35)]" strokeWidth={2.4} aria-hidden="true" />
      ) : (
        <img src="/images/pepe-coin-forward-transparent.png" alt="" className="relative h-[68%] w-[68%] object-contain drop-shadow-[0_2px_2px_rgba(0,0,0,0.35)]" draggable={false} />
      )}
      {tile.s === SPECIAL_ROW_ROCKET ? <span className="crush-stripes crush-stripes-row" /> : null}
      {tile.s === SPECIAL_COL_ROCKET ? <span className="crush-stripes crush-stripes-col" /> : null}
      {tile.s === SPECIAL_BOMB ? <span className="crush-bomb-ring" /> : null}
    </span>
  )
}

export function candyLabel(tile: Tile, ru: boolean) {
  const names = ru ? ['Вишня', 'Апельсин', 'Звезда', 'PEPE', 'Кристалл', 'Виноград'] : ['Cherry', 'Orange', 'Star', 'PEPE', 'Crystal', 'Grape']
  if (tile.s === SPECIAL_RAINBOW) return ru ? 'Радужная конфета' : 'Rainbow candy'
  const base = names[tile.c] ?? ''
  if (tile.s === SPECIAL_ROW_ROCKET) return `${base}, ${ru ? 'горизонтальная ракета' : 'row rocket'}`
  if (tile.s === SPECIAL_COL_ROCKET) return `${base}, ${ru ? 'вертикальная ракета' : 'column rocket'}`
  if (tile.s === SPECIAL_BOMB) return `${base}, ${ru ? 'бомба' : 'bomb'}`
  return base
}
