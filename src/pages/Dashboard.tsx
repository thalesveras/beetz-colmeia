import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Users, Sparkles, Crown, CalendarDays, Trophy, Clock } from 'lucide-react'
import { useAuth } from '../contexts/AuthContext'
import { listProfiles, listEvents, getRanking, type RankingEntry } from '../lib/dataService'
import type { EventItem, Profile } from '../lib/types'
import StatCard from '../components/ui/StatCard'
import ProfileCard from '../components/ui/ProfileCard'
import Avatar from '../components/ui/Avatar'

function formatDate(d: string) {
  return new Date(d + 'T00:00:00').toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', year: 'numeric' })
}

export default function Dashboard() {
  const { profile } = useAuth()
  const [profiles, setProfiles] = useState<Profile[]>([])
  const [events, setEvents] = useState<EventItem[]>([])
  const [ranking, setRanking] = useState<RankingEntry[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    Promise.all([listProfiles(), listEvents(), getRanking()]).then(([p, e, r]) => {
      setProfiles(p)
      setEvents(e)
      setRanking(r)
      setLoading(false)
    })
  }, [])

  if (loading) return <p className="text-beetz-dark/50 p-8">Carregando a colmeia...</p>

  const newBees = profiles.filter((p) => p.experience_level === 'Nova abelha').length
  const leaders = profiles.filter((p) => p.experience_level === 'Líder de bar').length
  const today = new Date().toISOString().slice(0, 10)
  const upcoming = events.filter((e) => e.event_date >= today).sort((a, b) => a.event_date < b.event_date ? -1 : 1)
  const activeEvents = events.filter((e) => e.status === 'Confirmado' || e.status === 'Em andamento').length
  const nextEvent = upcoming[0]
  const myTeam = profile ? profiles.filter((p) => p.department_id === profile.department_id && p.id !== profile.id) : []

  return (
    <div className="space-y-10">
      {profile?.approval_status === 'Pendente' && (
        <div className="flex items-start gap-3 bg-beetz-yellow/20 border border-beetz-yellow/40 rounded-2xl p-4">
          <Clock size={20} className="text-beetz-dark/70 shrink-0 mt-0.5" />
          <div>
            <p className="font-semibold text-sm">Seu cadastro está aguardando aprovação da Diretoria</p>
            <p className="text-sm text-beetz-dark/60 mt-0.5">
              Você já pode navegar e completar seu perfil, mas ainda não aparece na Turma nem pode ser
              escalado(a) para eventos até a aprovação sair.
            </p>
          </div>
        </div>
      )}

      <div>
        <h1 className="text-2xl md:text-3xl font-extrabold">
          Oi, {profile?.first_name || 'abelha'}! 👋
        </h1>
        <p className="text-beetz-dark/60 mt-1">Aqui está o que está zumbindo na colmeia hoje.</p>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        <StatCard icon={<Users size={20} />} label="Colaboradores" value={profiles.length} />
        <StatCard icon={<Sparkles size={20} />} label="Novas abelhas" value={newBees} />
        <StatCard icon={<Crown size={20} />} label="Líderes" value={leaders} />
        <StatCard icon={<CalendarDays size={20} />} label="Eventos ativos" value={activeEvents} />
        <StatCard icon={<Trophy size={20} />} label="Próximo evento" value={nextEvent ? formatDate(nextEvent.event_date) : '—'} />
      </div>

      <section>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-bold">Conheça a turma</h2>
          <Link to="/turma" className="text-sm font-semibold text-beetz-dark/70 hover:text-beetz-dark">Ver todos →</Link>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {profiles.slice(0, 4).map((p) => <ProfileCard key={p.id} profile={p} />)}
        </div>
      </section>

      <section>
        <h2 className="text-lg font-bold mb-4">Minha equipe</h2>
        {myTeam.length === 0 ? (
          <p className="text-sm text-beetz-dark/50 bg-white rounded-2xl p-5 border border-beetz-dark/5">
            Complete seu perfil para vermos quem mais está no seu departamento.
          </p>
        ) : (
          <div className="bg-white rounded-2xl p-5 shadow-soft border border-beetz-dark/5 flex flex-wrap gap-4">
            {myTeam.map((p) => (
              <Link key={p.id} to={`/perfil/${p.id}`} className="flex flex-col items-center gap-1 w-20 text-center">
                <Avatar src={p.avatar_url} name={`${p.first_name} ${p.last_name}`} size="lg" />
                <span className="text-xs font-medium truncate w-full">{p.first_name}</span>
              </Link>
            ))}
          </div>
        )}
      </section>

      <section>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-bold">Próximos eventos</h2>
          <Link to="/eventos" className="text-sm font-semibold text-beetz-dark/70 hover:text-beetz-dark">Ver todos →</Link>
        </div>
        <div className="grid md:grid-cols-3 gap-4">
          {upcoming.slice(0, 3).map((e) => (
            <Link key={e.id} to={`/eventos/${e.id}`} className="bg-white rounded-2xl p-5 shadow-soft border border-beetz-dark/5 hover:shadow-glow transition-shadow">
              <p className="text-xs font-semibold text-beetz-dark/50 mb-1">{formatDate(e.event_date)}</p>
              <h3 className="font-bold">{e.name}</h3>
              <p className="text-sm text-beetz-dark/60 mt-1">📍 {e.location} · {e.city}</p>
              <span className="inline-block mt-3 text-xs font-semibold bg-beetz-yellow/30 text-beetz-dark px-2.5 py-1 rounded-full">{e.status}</span>
            </Link>
          ))}
          {upcoming.length === 0 && <p className="text-sm text-beetz-dark/50">Nenhum evento futuro por enquanto.</p>}
        </div>
      </section>

      <section>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-bold">Ranking da colmeia</h2>
          <Link to="/ranking" className="text-sm font-semibold text-beetz-dark/70 hover:text-beetz-dark">Ver ranking completo →</Link>
        </div>
        <div className="bg-white rounded-2xl shadow-soft border border-beetz-dark/5 divide-y divide-beetz-dark/5">
          {ranking.slice(0, 5).map((entry, i) => (
            <Link key={entry.profile.id} to={`/perfil/${entry.profile.id}`} className="flex items-center gap-3 p-4 hover:bg-beetz-gray/60 transition-colors">
              <span className="w-6 text-center font-extrabold text-beetz-dark/40">{i + 1}</span>
              <Avatar src={entry.profile.avatar_url} name={`${entry.profile.first_name} ${entry.profile.last_name}`} size="sm" />
              <div className="flex-1 min-w-0">
                <p className="font-semibold text-sm truncate">{entry.profile.first_name} {entry.profile.last_name}</p>
              </div>
              <span className="text-sm font-bold text-beetz-dark/70">🍯 {entry.honeyReceived}</span>
            </Link>
          ))}
        </div>
      </section>
    </div>
  )
}
