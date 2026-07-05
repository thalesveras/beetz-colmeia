import type { BadgeType, HiveLevel } from './types'

export interface LevelDef {
  level: HiveLevel
  minEvents: number
  icon: string
  color: string
  description: string
}

export const HIVE_LEVELS: LevelDef[] = [
  { level: 'Nova Abelha', minEvents: 0, icon: '🐣', color: '#fef3c7', description: 'Acabou de chegar na colmeia' },
  { level: 'Abelha em Treinamento', minEvents: 1, icon: '🐝', color: '#fde68a', description: 'Já colocou a mão na massa' },
  { level: 'Coletor de Mel', minEvents: 5, icon: '🍯', color: '#fed417', description: 'Presença constante nos eventos' },
  { level: 'Abelha Operacional', minEvents: 12, icon: '⚡', color: '#f5b700', description: 'Referência de entrega na equipe' },
  { level: 'Líder da Colmeia', minEvents: 25, icon: '👑', color: '#d97706', description: 'Guia e inspira outras abelhas' },
  { level: 'Lenda Beetz', minEvents: 50, icon: '🏆', color: '#050505', description: 'História viva da Beetz' }
]

export function getHiveLevel(eventsCount: number): LevelDef {
  let current = HIVE_LEVELS[0]
  for (const lvl of HIVE_LEVELS) {
    if (eventsCount >= lvl.minEvents) current = lvl
  }
  return current
}

export function getNextLevel(eventsCount: number): LevelDef | null {
  const current = getHiveLevel(eventsCount)
  const idx = HIVE_LEVELS.findIndex((l) => l.level === current.level)
  return HIVE_LEVELS[idx + 1] ?? null
}

export function getLevelProgress(eventsCount: number): number {
  const current = getHiveLevel(eventsCount)
  const next = getNextLevel(eventsCount)
  if (!next) return 100
  const span = next.minEvents - current.minEvents
  const progressed = eventsCount - current.minEvents
  return Math.min(100, Math.round((progressed / span) * 100))
}

export interface BadgeDef {
  type: BadgeType
  label: string
  icon: string
  description: string
}

export const BADGE_DEFS: BadgeDef[] = [
  { type: 'first_event', label: 'Primeiro evento', icon: '🎉', description: 'Participou do primeiro evento Beetz' },
  { type: 'ten_events', label: '10 eventos', icon: '🔟', description: 'Já rodou 10 eventos com a colmeia' },
  { type: 'fifty_events', label: '50 eventos', icon: '💯', description: '50 eventos de história com a Beetz' },
  { type: 'leader_highlight', label: 'Líder destaque', icon: '👑', description: 'Referência de liderança na equipe' },
  { type: 'punctuality', label: 'Pontualidade', icon: '⏰', description: 'Sempre no horário, sem desculpas' },
  { type: 'most_complimented', label: 'Mais elogiado', icon: '💛', description: 'Reconhecido pela turma com muitos elogios' }
]

export function badgesFromStats(eventsCount: number, complimentsReceived: number): BadgeType[] {
  const badges: BadgeType[] = []
  if (eventsCount >= 1) badges.push('first_event')
  if (eventsCount >= 10) badges.push('ten_events')
  if (eventsCount >= 50) badges.push('fifty_events')
  if (complimentsReceived >= 10) badges.push('most_complimented')
  return badges
}
