import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { getRanking, type RankingEntry } from '../lib/dataService'
import { useAuth } from '../contexts/AuthContext'
import { canViewRanking } from '../lib/permissions'
import Avatar from '../components/ui/Avatar'
import LevelPill from '../components/ui/LevelPill'
import { getHiveLevel } from '../lib/levels'

const medals = ['🥇', '🥈', '🥉']

export default function Ranking() {
  const { accessRole, userId } = useAuth()
  const [ranking, setRanking] = useState<RankingEntry[]>([])
  const [loading, setLoading] = useState(true)

  // finally: se a consulta falhar (rede, sessão renovando), a tela mostra o
  // vazio em vez de "carregando" eterno.
  useEffect(() => {
    getRanking()
      .then((r) => setRanking(r))
      .catch(() => setRanking([]))
      .finally(() => setLoading(false))
  }, [])

  if (!canViewRanking(accessRole)) {
    return (
      <div className="bg-white rounded-2xl p-8 shadow-soft border border-beetz-dark/5 text-center">
        <p className="text-4xl mb-3">🔒</p>
        <h1 className="text-xl font-bold mb-1">Acesso restrito</h1>
        <p className="text-sm text-beetz-dark/60">Seu perfil de acesso não tem permissão pra ver o ranking.</p>
      </div>
    )
  }

  return (
    <div className="space-y-6 max-w-3xl">
      <div>
        <h1 className="text-2xl md:text-3xl font-extrabold">Ranking da colmeia</h1>
        <p className="text-beetz-dark/60 mt-1">As abelhas mais reconhecidas pela turma — mel e elogios contam pontos.</p>
      </div>

      {loading ? (
        <p className="text-beetz-dark/50">Carregando ranking...</p>
      ) : (
        /* Pódio de verdade: 3 degraus lado a lado ATÉ no celular — o 1º no
           centro, mais alto; nomes clampados em 2 linhas (nome comprido não
           entorta mais os degraus; no celular vale só o primeiro nome). */
        <div className="grid grid-cols-3 gap-2 sm:gap-4 items-end">
          {ranking.slice(0, 3).map((entry, i) => (
            <Link
              key={entry.profile.id}
              to={`/perfil/${entry.profile.id}`}
              className={`block min-w-0 rounded-2xl p-3 sm:p-5 text-center border transition-shadow hover:shadow-glow ${
                i === 0
                  ? 'bg-beetz-dark text-white border-beetz-dark shadow-glow order-2 pb-6 sm:-translate-y-3'
                  : 'bg-white border-beetz-dark/5 shadow-soft mt-6 sm:mt-0'
              } ${i === 1 ? 'order-1' : ''} ${i === 2 ? 'order-3' : ''}`}
            >
              <p className="text-2xl sm:text-3xl">{medals[i]}</p>
              <Avatar src={entry.profile.avatar_url} name={`${entry.profile.first_name} ${entry.profile.last_name}`} size="lg" />
              <p className="font-bold mt-2 text-xs sm:text-base leading-tight break-words line-clamp-2">
                <span className="sm:hidden">{entry.profile.first_name}</span>
                <span className="hidden sm:inline">{entry.profile.first_name} {entry.profile.last_name}</span>
              </p>
              <p className={`text-[11px] sm:text-sm mt-1 ${i === 0 ? 'text-white/60' : 'text-beetz-dark/50'}`}>
                🍯 {entry.honeyReceived} · 💛 {entry.complimentsReceived}
              </p>
            </Link>
          ))}
        </div>
      )}

      <div className="bg-white rounded-2xl shadow-soft border border-beetz-dark/5 divide-y divide-beetz-dark/5">
        {ranking.map((entry, i) => {
          const lvl = getHiveLevel(entry.eventsCount)
          const souEu = entry.profile.id === userId
          return (
            <Link
              key={entry.profile.id}
              to={`/perfil/${entry.profile.id}`}
              className={`flex items-center gap-3 p-4 transition-colors ${souEu ? 'bg-beetz-yellow/10 hover:bg-beetz-yellow/20' : 'hover:bg-beetz-gray/60'}`}
            >
              {/* Top 3 leva medalha também aqui; do 4º em diante, o número. */}
              {i < 3
                ? <span className="w-7 text-center text-lg leading-none">{medals[i]}</span>
                : <span className="w-7 text-center font-extrabold text-beetz-dark/40">{i + 1}</span>}
              <Avatar src={entry.profile.avatar_url} name={`${entry.profile.first_name} ${entry.profile.last_name}`} size="sm" />
              <div className="flex-1 min-w-0">
                <p className="font-semibold text-sm truncate">
                  {entry.profile.first_name} {entry.profile.last_name}
                  {souEu && <span className="ml-2 text-[10px] font-bold uppercase tracking-wide text-beetz-dark/40">você</span>}
                </p>
                {/* No celular o nível vive AQUI (o chip sumia com o espaço do
                    nome); no desktop o chip volta ao lado, com folga. */}
                <p className="text-xs text-beetz-dark/50 truncate">
                  {lvl.icon} {lvl.level}{entry.profile.role ? ` · ${entry.profile.role}` : ''}
                </p>
              </div>
              <span className="hidden sm:block"><LevelPill eventsCount={entry.eventsCount} /></span>
              <span className="shrink-0 text-sm font-bold text-beetz-dark/70 w-14 sm:w-16 text-right">🍯 {entry.honeyReceived}</span>
            </Link>
          )
        })}
      </div>
    </div>
  )
}
