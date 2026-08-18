import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  Users, CalendarDays, Trophy, Clock, ClipboardList, ArrowRight, CalendarCheck, MapPin, Wallet
} from 'lucide-react'
import { useAuth } from '../contexts/AuthContext'
import {
  listProfilesLite, listEvents, listOpenStaffingSlots, getRanking, listDepartments,
  countPendingProfilesForDirectory, type RankingEntry
} from '../lib/dataService'
import { canViewFinancialSummary, canManageUsers, canViewRanking } from '../lib/permissions'
import type { Department, EventItem, OpenStaffingSlot, Profile } from '../lib/types'
import StatCard from '../components/ui/StatCard'
import MetricDrilldown from '../components/ui/MetricDrilldown'
import Avatar from '../components/ui/Avatar'

function formatDate(d: string) {
  return new Date(d + 'T00:00:00').toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', year: 'numeric' })
}

// "Hoje" no fuso do CELULAR — nunca em UTC: depois das 21h em São Luís o
// toISOString() já virou amanhã e o evento DESTA NOITE sumia da home bem
// na hora em que a equipe abre o app pra ir trabalhar nele.
function hojeISO() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

// "dom · 20 jul" — mesma língua do /eventos, pra home não destoar.
function dataCurta(dateISO: string) {
  const d = new Date(dateISO + 'T12:00:00')
  const semana = d.toLocaleDateString('pt-BR', { weekday: 'short' }).replace('.', '')
  const diaMes = d.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' }).replace('.', '')
  return `${semana} · ${diaMes}`
}

// Distância em palavras + cor do selo (o padrão da casa).
function distancia(dateISO: string, hoje: string) {
  const dias = Math.round((new Date(dateISO + 'T12:00:00').getTime() - new Date(hoje + 'T12:00:00').getTime()) / 86400000)
  if (dias === 0) return { label: 'É HOJE 🐝', tone: 'bg-beetz-yellow text-beetz-dark' }
  if (dias === 1) return { label: 'amanhã', tone: 'bg-amber-100 text-amber-800' }
  if (dias <= 7) return { label: `em ${dias} dias`, tone: 'bg-amber-100 text-amber-800' }
  return { label: `em ${dias} dias`, tone: 'bg-beetz-gray text-beetz-dark/60' }
}

// Flyer do evento; sem flyer, vira o "bilhete" com dia/mês (padrão da casa).
function FlyerThumb({ e }: { e: EventItem }) {
  return e.flyer_url ? (
    <img src={e.flyer_url} alt="" className="w-14 h-[72px] rounded-lg object-cover shrink-0 border border-beetz-dark/10" />
  ) : (
    <div className="w-14 h-[72px] rounded-lg dark-gradient flex flex-col items-center justify-center shrink-0">
      <span className="text-base font-extrabold text-white leading-none">{e.event_date.split('-')[2]}</span>
      <span className="text-[8px] uppercase tracking-widest text-beetz-yellow mt-0.5">
        {new Date(e.event_date + 'T12:00:00').toLocaleDateString('pt-BR', { month: 'short' }).replace('.', '')}
      </span>
    </div>
  )
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
  const [departments, setDepartments] = useState<Department[]>([])
  const [pendingCount, setPendingCount] = useState(0)
  // Qual métrica está aberta em detalhe. null = nenhuma.
  const [drill, setDrill] = useState<'colaboradores' | 'eventos' | 'proximo' | null>(null)
  const [loading, setLoading] = useState(true)
  // Carrossel do "É HOJE": qual slide está na janela + o trilho pra rolar via pontinhos.
  const [slideHoje, setSlideHoje] = useState(0)
  const trilhoHoje = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    Promise.all([
      // Versão LITE dos perfis: o Dashboard só conta e agrupa — não precisa
      // das fotos base64 que faziam o listProfiles cheio pesar 7,8 MB.
      listProfilesLite(), listEvents(), listOpenStaffingSlots(userId ?? null), getRanking(),
      listDepartments(),
      // Pré-cadastro é contexto do cartão de Colaboradores: falha aqui não pode
      // derrubar o dashboard inteiro, então cai pra 0 em silêncio.
      // Só a CONTAGEM (HEAD+count): antes baixava as ~1.700 fichas (2 MB) só
      // pra medir o length — o peso que segurava o Dashboard em conexão de
      // latência alta. Falha aqui não derruba o painel: cai pra 0.
      countPendingProfilesForDirectory().catch(() => 0)
    ])
      .then(([p, e, s, r, d, pend]) => {
        setProfiles(p)
        setEvents(e)
        setSlots(s)
        setRanking(r)
        setDepartments(d)
        setPendingCount(pend)
      })
      .finally(() => setLoading(false))
  }, [userId])

  if (loading) return <p className="text-beetz-dark/50 p-8">Carregando a colmeia...</p>

  const today = hojeISO()
  // Propostas de produtor ainda não aprovadas não aparecem pra turma como
  // evento de verdade — só entram aqui depois do aceite da Diretoria.
  const upcoming = events
    .filter((e) => e.event_date >= today && e.proposal_status !== 'Pendente' && e.proposal_status !== 'Recusada')
    .sort((a, b) => (a.event_date < b.event_date ? -1 : 1))
  const eventosDeHoje = upcoming.filter((e) => e.event_date === today && e.status !== 'Cancelado')
  const activeEvents = events.filter((e) => e.status === 'Confirmado' || e.status === 'Em andamento').length

  const myConfirmed = slots.filter((s) => s.myApplication?.status === 'Confirmado')
  const myWaiting = slots.filter((s) => s.myApplication?.status === 'Candidatado')
  const openForMe = slots.filter((s) => !s.myApplication && s.confirmedCount < s.requirement.quantity)
  const isDiretoria = canManageUsers(accessRole)

  // Composição dos números dos cartões. Fica aqui e não dentro do modal porque
  // o cartão mostra a prévia (hint) do mesmo dado — uma conta só, dois lugares.
  const byRole = Array.from(
    profiles.reduce((m, p) => {
      const d = departments.find((x) => x.id === p.department_id)?.name ?? 'Sem departamento'
      return m.set(d, (m.get(d) ?? 0) + 1)
    }, new Map<string, number>())
  ).sort((a, b) => b[1] - a[1])

  const byStatus = Array.from(
    events.reduce((m, e) => m.set(e.status, (m.get(e.status) ?? 0) + 1), new Map<string, number>())
  ).sort((a, b) => b[1] - a[1])

  function daysUntil(date: string) {
    const dias = Math.round((new Date(date + 'T00:00:00').getTime() - new Date(today + 'T00:00:00').getTime()) / 86400000)
    if (dias === 0) return 'é hoje'
    if (dias === 1) return 'amanhã'
    return `em ${dias} dias`
  }

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

      {/* ---- É HOJE: todos os eventos do dia num carrossel — arrasta pro
           lado no dedo (scroll com imã), pontinhos mostram onde está.
           Rolagem CONTIDA no trilho: nada vaza pra página. ---- */}
      {eventosDeHoje.length > 0 && (
        <section>
          <div
            ref={trilhoHoje}
            onScroll={(ev) => {
              const el = ev.currentTarget
              setSlideHoje(Math.round(el.scrollLeft / (el.clientWidth + 12)))
            }}
            className="flex gap-3 overflow-x-auto snap-x snap-mandatory no-scrollbar"
          >
            {eventosDeHoje.map((e) => (
              <Link
                key={e.id}
                to={`/eventos/${e.id}`}
                className="relative block overflow-hidden dark-gradient text-white rounded-2xl shadow-glow snap-center shrink-0 w-full"
              >
                {e.flyer_url && (
                  <img src={e.flyer_url} alt="" className="absolute inset-0 w-full h-full object-cover opacity-30" />
                )}
                <div className="relative p-4 sm:p-5 flex items-center gap-x-3 gap-y-1 flex-wrap">
                  <span className="text-[11px] font-extrabold px-2.5 py-1 rounded-full bg-beetz-yellow text-beetz-dark animate-pulse whitespace-nowrap">É HOJE 🐝</span>
                  <span className="font-bold min-w-0 flex-1 truncate">{e.name}</span>
                  {(e.location || e.city) && (
                    <span className="text-sm text-white/70 flex items-center gap-1 min-w-0">
                      <MapPin size={13} className="shrink-0" />
                      <span className="truncate">{[e.location, e.city].filter(Boolean).join(' · ')}</span>
                    </span>
                  )}
                </div>
              </Link>
            ))}
          </div>
          {eventosDeHoje.length > 1 && (
            <div className="flex justify-center items-center gap-1.5 mt-2.5">
              {eventosDeHoje.map((e, i) => (
                <button
                  key={e.id}
                  aria-label={`Ir para ${e.name}`}
                  onClick={() => {
                    const el = trilhoHoje.current
                    if (el) el.scrollTo({ left: i * (el.clientWidth + 12), behavior: 'smooth' })
                  }}
                  className={`h-2 rounded-full transition-all ${
                    i === slideHoje ? 'w-5 bg-beetz-dark' : 'w-2 bg-beetz-dark/25 hover:bg-beetz-dark/40'
                  }`}
                />
              ))}
            </div>
          )}
        </section>
      )}

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
          <div className="grid sm:grid-cols-2 md:grid-cols-3 gap-4">
            {myConfirmed.slice(0, 3).map((s) => {
              const dist = distancia(s.event.event_date, today)
              return (
                <Link
                  key={s.requirement.id}
                  to={`/eventos/${s.event.id}`}
                  className="relative overflow-hidden bg-beetz-dark text-white rounded-2xl p-5 hover:shadow-glow transition-shadow min-w-0"
                >
                  {/* o flyer é o fundo do compromisso — a pessoa reconhece a festa de longe */}
                  {s.event.flyer_url && (
                    <img src={s.event.flyer_url} alt="" className="absolute inset-0 w-full h-full object-cover opacity-25" />
                  )}
                  <div className="relative">
                    <div className="flex flex-wrap items-center justify-between gap-x-2 gap-y-1">
                      <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-beetz-yellow text-beetz-dark whitespace-nowrap">{dist.label}</span>
                      <span className="text-xs font-semibold text-beetz-yellow whitespace-nowrap">{dataCurta(s.event.event_date)}</span>
                    </div>
                    <h3 className="font-bold mt-2 leading-snug">{s.event.name}</h3>
                    <p className="text-sm text-white/70 mt-1">🐝 {s.requirement.role_label}</p>
                    {s.event.location && (
                      <p className="text-xs text-white/50 mt-2 flex items-center gap-1 min-w-0">
                        <MapPin size={11} className="shrink-0" /> <span className="truncate">{s.event.location}</span>
                      </p>
                    )}
                  </div>
                </Link>
              )
            })}
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
            <StatCard
              icon={<Users size={20} />} label="Colaboradores" value={profiles.length}
              hint={pendingCount > 0 ? `+${pendingCount} pré-cadastros` : undefined}
              onClick={() => setDrill('colaboradores')}
            />
            <StatCard
              icon={<CalendarDays size={20} />} label="Eventos ativos" value={activeEvents}
              hint={`${events.length} no total`}
              onClick={() => setDrill('eventos')}
            />
            <StatCard
              icon={<Trophy size={20} />} label="Próximo evento"
              value={upcoming[0] ? formatDate(upcoming[0].event_date) : '—'}
              hint={upcoming[0]?.name}
              onClick={() => setDrill('proximo')}
            />
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

      {/* ---- Detalhe das métricas ---- */}
      {drill === 'colaboradores' && (
        <MetricDrilldown
          title="Colaboradores" value={profiles.length}
          subtitle="Quem tem acesso à Colmeia hoje"
          breakdown={[
            ...byRole.map(([dept, n]) => ({ label: dept, value: n })),
            ...(pendingCount > 0
              ? [{ label: 'Pré-cadastros (sem login ainda)', value: pendingCount, highlight: true }]
              : [])
          ]}
          howItsMade={
            'Conta só perfis com cadastro completo e aprovados — são os que aparecem na Turma e podem ser escalados. ' +
            'Pré-cadastro importado do Zoho não entra: ele vira colaborador no dia que a pessoa entra com o mesmo e-mail.'
          }
          action={{ to: '/turma', label: 'Ver a turma' }}
          onClose={() => setDrill(null)}
        />
      )}

      {drill === 'eventos' && (
        <MetricDrilldown
          title="Eventos" value={activeEvents}
          subtitle="Ativos agora — confirmados ou em andamento"
          breakdown={byStatus.map(([status, n]) => ({
            label: status, value: n,
            highlight: status === 'Confirmado' || status === 'Em andamento'
          }))}
          howItsMade={
            '"Ativo" = status Confirmado ou Em andamento. Planejado ainda não fechou; Concluído e Cancelado saíram do radar. ' +
            'O total inclui todos, de qualquer data.'
          }
          action={{ to: '/eventos', label: 'Ver eventos' }}
          onClose={() => setDrill(null)}
        />
      )}

      {drill === 'proximo' && (
        <MetricDrilldown
          title={upcoming[0]?.name ?? 'Nenhum evento à frente'}
          subtitle={upcoming[0] ? `${formatDate(upcoming[0].event_date)} · ${daysUntil(upcoming[0].event_date)}` : undefined}
          breakdown={upcoming[0] ? [
            { label: 'Local', value: upcoming[0].location || '—' },
            { label: 'Cidade', value: upcoming[0].city || '—' },
            { label: 'Status', value: upcoming[0].status },
            { label: 'Vagas abertas', value: openForMe.length, highlight: openForMe.length > 0 }
          ] : []}
          howItsMade={
            'O evento com a data mais próxima entre os que ainda não passaram. Eventos de hoje continuam contando; ' +
            'os de ontem pra trás saem da lista, mesmo que ainda estejam como Planejado.'
          }
          action={upcoming[0] ? { to: `/eventos/${upcoming[0].id}`, label: 'Abrir evento' } : undefined}
          onClose={() => setDrill(null)}
        >
          {upcoming.length > 1 && (
            <div className="mb-5">
              <p className="text-[11px] font-bold uppercase tracking-wide text-beetz-dark/35 mb-2">Depois desse</p>
              <div className="space-y-1">
                {upcoming.slice(1, 4).map((e) => (
                  <Link key={e.id} to={`/eventos/${e.id}`}
                    className="flex items-center justify-between gap-3 bg-beetz-gray/60 hover:bg-beetz-yellow/20 rounded-xl px-3 py-2 transition-colors">
                    <span className="text-sm truncate">{e.name}</span>
                    <span className="text-xs text-beetz-dark/45 shrink-0">{formatDate(e.event_date)}</span>
                  </Link>
                ))}
              </div>
            </div>
          )}
        </MetricDrilldown>
      )}

      {/* ---- Próximos eventos da colmeia (todos, não só os meus) ---- */}
      <section>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-bold">Próximos eventos da colmeia</h2>
          <Link to="/eventos" className="text-sm font-semibold text-beetz-dark/70 hover:text-beetz-dark">Ver todos →</Link>
        </div>
        <div className="grid sm:grid-cols-2 md:grid-cols-3 gap-4">
          {upcoming.slice(0, 3).map((e) => {
            const dist = distancia(e.event_date, today)
            return (
              <Link
                key={e.id}
                to={`/eventos/${e.id}`}
                className="bg-white rounded-2xl p-4 shadow-soft border border-beetz-dark/5 hover:shadow-glow transition-shadow flex gap-3 items-start min-w-0 overflow-hidden"
              >
                <FlyerThumb e={e} />
                <div className="flex-1 min-w-0">
                  <div className="flex flex-wrap items-center justify-between gap-x-2 gap-y-1">
                    <span className={`text-[11px] font-bold px-2 py-0.5 rounded-full whitespace-nowrap ${dist.tone}`}>{dist.label}</span>
                    <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full whitespace-nowrap bg-beetz-yellow/30 text-beetz-dark">{e.status}</span>
                  </div>
                  <h3 className="font-bold leading-snug mt-1 line-clamp-2">{e.name}</h3>
                  <p className="text-xs text-beetz-dark/55 mt-1 truncate">
                    {dataCurta(e.event_date)}
                    {(e.location || e.city) ? ` · ${[e.location, e.city].filter(Boolean).join(' · ')}` : ''}
                  </p>
                </div>
              </Link>
            )
          })}
          {upcoming.length === 0 && <p className="text-sm text-beetz-dark/50">Nenhum evento futuro por enquanto.</p>}
        </div>
      </section>

      {/* ---- Ranking: comunidade, fica por último. Respeita a mesma
           permissão que mostra o Ranking no menu — se o cargo não vê lá,
           a home não vaza aqui. ---- */}
      {ranking.length > 0 && canViewRanking(accessRole) && (
        <section>
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-bold">Ranking da colmeia</h2>
            <Link to="/ranking" className="text-sm font-semibold text-beetz-dark/70 hover:text-beetz-dark">Ver completo →</Link>
          </div>
          <div className="bg-white rounded-2xl shadow-soft border border-beetz-dark/5 divide-y divide-beetz-dark/5">
            {ranking.slice(0, 5).map((entry, i) => {
              const souEu = entry.profile.id === userId
              return (
                <Link
                  key={entry.profile.id}
                  to={`/perfil/${entry.profile.id}`}
                  className={`flex items-center gap-3 p-4 transition-colors ${souEu ? 'bg-beetz-yellow/10 hover:bg-beetz-yellow/20' : 'hover:bg-beetz-gray/60'}`}
                >
                  {i < 3
                    ? <span className="w-7 text-center text-xl leading-none">{['🥇', '🥈', '🥉'][i]}</span>
                    : <span className="w-7 text-center font-extrabold text-beetz-dark/40">{i + 1}</span>}
                  <Avatar src={entry.profile.avatar_url} name={`${entry.profile.first_name} ${entry.profile.last_name}`} size="sm" />
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-sm truncate">
                      {entry.profile.first_name} {entry.profile.last_name}
                      {souEu && <span className="ml-2 text-[10px] font-bold uppercase tracking-wide text-beetz-dark/40">você</span>}
                    </p>
                  </div>
                  <span className="text-sm font-bold text-beetz-dark/70">🍯 {entry.honeyReceived}</span>
                </Link>
              )
            })}
          </div>
        </section>
      )}
    </div>
  )
}
