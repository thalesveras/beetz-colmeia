import { getHiveLevel } from '../../lib/levels'

export default function LevelPill({ eventsCount }: { eventsCount: number }) {
  const level = getHiveLevel(eventsCount)
  return (
    <span
      className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold border border-beetz-dark/10"
      style={{ backgroundColor: level.color, color: level.level === 'Lenda Beetz' ? '#fed417' : '#050505' }}
      title={level.description}
    >
      <span>{level.icon}</span>
      {level.level}
    </span>
  )
}
