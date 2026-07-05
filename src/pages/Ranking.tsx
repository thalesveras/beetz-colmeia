import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { getRanking, type RankingEntry } from '../lib/dataService'
import Avatar from '../components/ui/Avatar'
import LevelPill from '../components/ui/LevelPill'
import { getHiveLevel } from '../lib/levels'

const medals = ['🥇', '🥈', '🥉']

export default function Ranking() {
  const [ranking, setRanking] = useState<RankingEntry[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => { getRanking().then((r) => { setRanking(r); setLoading(false) }) }, [])

  return (
    <div className="space-y-6 max-w-3xl">
      <div>
        <h1 className="text-2xl md:text-3xl font-extrabold">Ranking da colmeia</h1>
        <p className="text-beetz-dark/60 mt-1">As abelhas mais reconhecidas pela turma — mel e elogios contam pontos.</p>
      </div>

      {loading ? (
        <p className="text-beetz-dark/50">Carregando ranking...</p>
      ) : (
        <div className="grid sm:grid-cols-3 gap-4">
          {ranking.slice(0, 3).map((entry, i) => (
            <div key={entry.profile.id} className={`rounded-2xl p-5 text-center border ${i === 0 ? 'bg-beetz-dark text-white border-beetz-dark shadow-glow order-2 sm:-translate-y-3' : 'bg-white border-beetz-dark/5 shadow-soft'} ${i === 1 ? 'order-1' : ''} ${i === 2 ? 'order-3' : ''}`}>
              <p className="text-3xl">{medals[i]}</p>
              <Avatar src={entry.profile.avatar_url} name={`${entry.profile.first_name} ${entry.profile.last_name}`} size="lg" />
              <p className="font-bold mt-2">{entry.profile.first_name} {entry.profile.last_name}</p>
              <p className={`text-sm mt-0.5 ${i === 0 ? 'text-white/60' : 'text-beetz-dark/50'}`}>🍯 {entry.honeyReceived} · 💛 {entry.complimentsReceived}</p>
            </div>
          ))}
        </div>
      )}

      <div className="bg-white rounded-2xl shadow-soft border border-beetz-dark/5 divide-y divide-beetz-dark/5">
        {ranking.map((entry, i) => (
          <Link key={entry.profile.id} to={`/perfil/${entry.profile.id}`} className="flex items-center gap-3 p-4 hover:bg-beetz-gray/60 transition-colors">
            <span className="w-6 text-center font-extrabold text-beetz-dark/40">{i + 1}</span>
            <Avatar src={entry.profile.avatar_url} name={`${entry.profile.first_name} ${entry.profile.last_name}`} size="sm" />
            <div className="flex-1 min-w-0">
              <p className="font-semibold text-sm truncate">{entry.profile.first_name} {entry.profile.last_name}</p>
              <p className="text-xs text-beetz-dark/50">{getHiveLevel(entry.eventsCount).icon} {entry.profile.role}</p>
            </div>
            <LevelPill eventsCount={entry.eventsCount} />
            <span className="text-sm font-bold text-beetz-dark/70 w-16 text-right">🍯 {entry.honeyReceived}</span>
          </Link>
        ))}
      </div>
    </div>
  )
}
