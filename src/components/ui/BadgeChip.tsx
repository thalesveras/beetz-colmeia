import { BADGE_DEFS } from '../../lib/levels'
import type { BadgeType } from '../../lib/types'

export default function BadgeChip({ type }: { type: BadgeType }) {
  const def = BADGE_DEFS.find((b) => b.type === type)
  if (!def) return null
  return (
    <div className="flex items-center gap-2 bg-beetz-dark text-white rounded-full pl-1.5 pr-3 py-1" title={def.description}>
      <span className="w-7 h-7 rounded-full honey-gradient flex items-center justify-center text-sm">{def.icon}</span>
      <span className="text-xs font-medium">{def.label}</span>
    </div>
  )
}
