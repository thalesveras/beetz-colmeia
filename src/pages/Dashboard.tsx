import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  Users, CalendarDays, Trophy, Clock, ClipboardList, ArrowRight, CalendarCheck, MapPin, Wallet
} from 'lucide-react'
import { useAuth } from '../contexts/AuthContext'
import { listProfiles, listEvents, listOpenStaffingSlots, getRanking, type RankingEntry } from '../lib/dataService'
import { canViewFinancialSummary, canManageUsers } from '../lib/permissions'
import type { EventItem, OpenStaffingSlot, Profile } from '../lib/types'
import StatCard from '../components/ui/StatCard'
import Avatar from '../components/ui/Avatar'

function formatDate(d: string) {
  return new Date(d + 'T00:00:00').toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', year: 'numeric' })
}

// Dashboard pessoal: em vez de "0 líderes / 0 eventos ativos" (número
// institucional que não ajuda ninguém a decidir nada), abre com o que ESSA
// pessoa precisa fazer hoje — onde ela está escalada, o que está esperando
// resposta, e quais vagas ela ainda pode pegar.
export default function Dashboard() {
  const { profile, userId, accessRole } = useAuth()
  const [profiles, setProfiles] = useState<Profile[]>([])
  const [events, setEvents] = useState<EventItem[]>([])
  const [slots, setSlots] = useState<OpenStaffingSlot[]>([])
  const [ranking, setRanking] = useState<RankingEntry[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    Promise.all([listProfiles(), listEvents(), listOpenStaffingSlots(userId ?? null), getRanking()])
      .then(([p, e, s, r]) => {
        setProfiles(p)
        setEvents(e)
        setSlots(s)
        setRanking(r)
      })
      .finally(() => setLoading(false))
  }, [userId])

  if (loading) return <p className="text-beetz-dark/50 p-8">Carregando a colmeia...</p>

  const today = new Date().toISOString().slice(0, 10)
  const upcoming = events.filter((e) => e.event_date >= today).sort((a, b) => (a.event_date < b.event_date ? -1 : 1))
  const activeEvents = events.filter((e) => e.status === 'Confirmado' || e.status === 'Em andamento').length

  const myConfirmed = slots.filter((s) => s.myApplication?.status === 'Confirmado')
  const myWaiting = slots.filter((s) => s.myApplication?.status === 'Candidatado')
  const openForMe = slots.filter((s) => !s.myApplication && s.confirmedCount < s.requirement.quantity)
  const isDiretoria = canManageUsers(accessRole)

  return (
    <div className="space-y-8">
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
        <h1 className="text-2xl md:text-3xl font-extrabold">Oi, {profile?.first_name || 'abelha'}! 👋</h1>
        <p className="text-beetz-dark/60 mt-1">
          {myConfirmed.length > 0
            ? `Você tem ${myConfirmed.length} ${myConfirmed.length === 1 ? 'evento confirmado' : 'eventos confirmados'} pela frente.`
            : 'Aqui está o que está zumbindo na colmeia hoje.'}
        </p>
      </div>

      {/* ---- Meus próximos eventos: o que mais importa pra quem trabalha ---- */}
      <section>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-bold flex items-center gap-2"><CalendarCheck size={18} /> Meus próximos eventos</h2>
          <Link to="/escala" className="text-sm font-semibold text-beetz-dark/70 hover:text-beetz-dark">Ver escala →</Link>
        </div>
        {myConfirmed.length === 0 ? (
          <div className="bg-white rounded-2xl p-5 border border-beetz-dark/5 flex flex-wrap items-center gap-3">
            <p className="text-sm text-beetz-dark/50 flex-1 min-w-[200px]">
              Você ainda não está confirmado(a) em nenhum evento.
              {openForMe.length > 0 && ' Tem vaga aberta esperando você!'}
            </p>
            <Link to="/escala" className="honey-gradient text-beetz-dark font-bold px-4 py-2 rounded-xl text-sm">
              Ver vagas abertas
            </Link>
          </div>
        ) : (
          <div className="grid md:grid-cols-3 gap-4">
            {myConfirmed.slice(0, 3).map((s) => (
              <Link
                key={s.requirement.id}
                to={`/eventos/${s.event.id}`}
                className="bg-beetz-dark text-white rounded-2xl p-5 hover:shadow-glow transition-shadow"
              >
                <p className="text-xs font-semibold text-beetz-yellow mb-1">{formatDate(s.event.event_date)}</p>
                <h3 className="font-bold">{s.event.name}</h3>
                <p className="text-sm text-white/60 mt-1">{s.requirement.role_label}</p>
                {s.event.location && (
                  <p className="text-xs text-white/40 mt-2 flex items-center gap-1"><MapPin size={11} /> {s.event.location}</p>
                )}
              </Link>
            ))}
          </div>
        )}
      </section>

      {/* ---- Pendências: só aparece quando existe algo de fato ---- */}
      {(myWaiting.length > 0 || openForMe.length > 0) && (
        <section className="grid md:grid-cols-2 gap-4">
          {myWaiting.length > 0 && (
            <Link to="/escala" className="bg-white rounded-2xl p-5 shadow-soft border border-beetz-dark/5 flex items-center gap-4 hover:shadow-glow transition-shadow">
              <div className="w-12 h-12 rounded-xl bg-amber-100 text-amber-700 flex items-center justify-center shrink-0">
                <Clock size={20} />
              </div>
              <div className="flex-1">
                <p className="text-2xl font-extrabold leading-none">{myWaiting.length}</p>
                <p className="text-sm text-beetz-dark/60 mt-1">
                  {myWaiting.length === 1 ? 'candidatura aguardando' : 'candidaturas aguardando'} confirmação
                </p>
              </div>
              <ArrowRight size={16} className="text-beetz-dark/30" />
            </Link>
          )}
          {openForMe.length > 0 && (
            <Link to="/escala" className="bg-white rounded-2xl p-5 shadow-soft border border-beetz-dark/5 flex items-center gap-4 hover:shadow-glow transition-shadow">
              <div className="w-12 h-12 rounded-xl honey-gradient flex items-center justify-center shrink-0">
                <ClipboardList size={20} />
              </div>
              <div className="flex-1">
                <p className="text-2xl font-extrabold leading-none">{openForMe.length}</p>
                <p className="text-sm text-beetz-dark/60 mt-1">
                  {openForMe.length === 1 ? 'vaga aberta' : 'vagas abertas'} pra pegar
                </p>
              </div>
              <ArrowRight size={16} className="text-beetz-dark/30" />
            </Link>
          )}
        </section>
      )}

      {/* ---- Visão de gestão: só pra quem administra ---- */}
      {isDiretoria && (
        <section>
          <h2 className="text-lg font-bold mb-4">Visão geral da colmeia</h2>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <StatCard icon={<Users size={20} />} label="Colaboradores" value={profiles.length} />
            <StatCard icon={<CalendarDays size={20} />} label="Eventos ativos" value={activeEvents} />
            <StatCard icon={<Trophy size={20} />} label="Próximo evento" value={upcoming[0] ? formatDate(upcoming[0].event_date) : '—'} />
            {canViewFinancialSummary(accessRole) ? (
              <Link to="/financeiro" className="bg-white rounded-2xl p-5 shadow-soft border border-beetz-dark/5 flex items-center gap-4 hover:shadow-glow transition-shadow">
                <div className="w-12 h-12 rounded-xl honey-gradient flex items-center justify-center shrink-0"><Wallet size={20} /></div>
                <div>
                  <p className="font-extrabold leading-none">Financeiro</p>
                  <p className="text-sm text-beetz-dark/60 mt-1">Abrir painel</p>
                </div>
              </Link>
            ) : (
              <StatCard icon={<CalendarDays size={20} />} label="Eventos futuros" value={upcoming.length} />
            )}
          </div>
        </section>
      )}

      {/* ---- Próximos eventos da colmeia (todos, não só os meus) ---- */}
      <section>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-bold">Próximos eventos da colmeia</h2>
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

      {/* ---- Ranking: comunidade, fica por último ---- */}
      {ranking.length > 0 && (
        <section>
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-bold">Ranking da colmeia</h2>
            <Link to="/ranking" className="text-sm font-semibold text-beetz-dark/70 hover:text-beetz-dark">Ver completo →</Link>
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
      )}
    </div>
  )
}
