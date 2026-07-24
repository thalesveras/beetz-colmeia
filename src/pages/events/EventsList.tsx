import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { CalendarDays, Clock3, MapPin, Plus } from 'lucide-react'
import { listEvents } from '../../lib/dataService'
import type { EventItem, EventStatus } from '../../lib/types'

// A tela-mãe do sistema, desenhada pela régua de uma casa de eventos:
//   1. O PRÓXIMO evento é rei — vira um herói no topo, com contagem regressiva.
//   2. O corte que a cabeça faz é temporal (o que vem aí × o que já foi),
//      não por status — as pills refletem isso; status virou filtro auxiliar.
//   3. Ninguém rola por eventos passados pra achar o de amanhã: "Próximos"
//      é o padrão, ordenado do mais perto pro mais longe; "Passados" inverte.
//   4. Datas falam a língua do polegar: "É HOJE", "amanhã", "em 5 dias".

const statusColors: Record<EventStatus, string> = {
  'Planejado': 'bg-gray-100 text-gray-700',
  'Confirmado': 'bg-blue-100 text-blue-700',
  'Em andamento': 'bg-beetz-yellow/40 text-beetz-dark',
  'Concluído': 'bg-green-100 text-green-700',
  'Cancelado': 'bg-red-100 text-red-700'
}

function hojeISO(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function diasAte(dateISO: string): number {
  const um = 24 * 60 * 60 * 1000
  return Math.round((new Date(dateISO + 'T12:00:00').getTime() - new Date(hojeISO() + 'T12:00:00').getTime()) / um)
}

// "dom · 20 jul" — dia da semana incluso: escala se combina por dia da semana.
function dataCurta(dateISO: string): string {
  const d = new Date(dateISO + 'T12:00:00')
  const semana = d.toLocaleDateString('pt-BR', { weekday: 'short' }).replace('.', '')
  const diaMes = d.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' }).replace('.', '')
  return `${semana} · ${diaMes}`
}

function mesAno(dateISO: string): string {
  const s = new Date(dateISO + 'T12:00:00').toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' })
  return s.charAt(0).toUpperCase() + s.slice(1)
}

// A distância no tempo, em palavras — leitura instantânea, zero conta mental.
function distancia(dias: number): { label: string; tone: 'hoje' | 'perto' | 'futuro' | 'passado' } {
  if (dias === 0) return { label: 'É HOJE 🐝', tone: 'hoje' }
  if (dias === 1) return { label: 'amanhã', tone: 'perto' }
  if (dias > 1 && dias <= 7) return { label: `em ${dias} dias`, tone: 'perto' }
  if (dias > 7) return { label: `em ${dias} dias`, tone: 'futuro' }
  if (dias === -1) return { label: 'ontem', tone: 'passado' }
  return { label: `há ${-dias} dias`, tone: 'passado' }
}

const TONE_STYLES: Record<string, string> = {
  hoje: 'bg-beetz-yellow text-beetz-dark',
  perto: 'bg-amber-100 text-amber-800',
  futuro: 'bg-beetz-gray text-beetz-dark/60',
  passado: 'bg-beetz-gray text-beetz-dark/40'
}

type Recorte = 'proximos' | 'hoje' | 'passados' | 'todos'

export default function EventsList() {
  const [events, setEvents] = useState<EventItem[]>([])
  const [loading, setLoading] = useState(true)
  const [recorte, setRecorte] = useState<Recorte>('proximos')
  const [statusFilter, setStatusFilter] = useState('')
  const [search, setSearch] = useState('')

  useEffect(() => { listEvents().then((e) => { setEvents(e); setLoading(false) }) }, [])

  const hoje = hojeISO()
  const norm = (s: string) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')

  const futuros = useMemo(
    () => events.filter((e) => e.event_date >= hoje).sort((a, b) => a.event_date.localeCompare(b.event_date)),
    [events, hoje]
  )
  const passados = useMemo(
    () => events.filter((e) => e.event_date < hoje).sort((a, b) => b.event_date.localeCompare(a.event_date)),
    [events, hoje]
  )
  const deHoje = useMemo(() => futuros.filter((e) => e.event_date === hoje), [futuros, hoje])

  // O herói: o evento de hoje (ou o próximo vivo). Some quando a pessoa está
  // buscando ou em outro recorte — herói é boas-vindas, não obstáculo.
  const heroi = useMemo(
    () => futuros.find((e) => e.status !== 'Cancelado') ?? null,
    [futuros]
  )

  const lista = useMemo(() => {
    let base: EventItem[]
    switch (recorte) {
      case 'proximos': base = futuros; break
      case 'hoje': base = deHoje; break
      case 'passados': base = passados; break
      default: base = [...futuros, ...passados]
    }
    if (statusFilter) base = base.filter((e) => e.status === statusFilter)
    if (search.trim()) {
      const q = norm(search)
      base = base.filter((e) => norm(`${e.name} ${e.location ?? ''} ${e.city ?? ''}`).includes(q))
    }
    return base
  }, [recorte, futuros, passados, deHoje, statusFilter, search])

  // Âncoras de mês: a lista ganha marcos ("Julho 2026") pra rolagem com rumo.
  const grupos = useMemo(() => {
    const g: { mes: string; items: EventItem[] }[] = []
    for (const e of lista) {
      const mes = mesAno(e.event_date)
      const ultimo = g[g.length - 1]
      if (ultimo && ultimo.mes === mes) ultimo.items.push(e)
      else g.push({ mes, items: [e] })
    }
    return g
  }, [lista])

  const mostrarHeroi = heroi && recorte === 'proximos' && !search.trim() && !statusFilter

  const pills: { key: Recorte; label: string; count: number; destaque?: boolean }[] = [
    { key: 'proximos', label: 'Próximos', count: futuros.length },
    ...(deHoje.length > 0 ? [{ key: 'hoje' as Recorte, label: '🐝 Hoje', count: deHoje.length, destaque: true }] : []),
    { key: 'passados', label: 'Passados', count: passados.length },
    { key: 'todos', label: 'Todos', count: events.length }
  ]

  return (
    <div className="space-y-5 max-w-full overflow-x-clip">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-2xl md:text-3xl font-extrabold">Eventos</h1>
          <p className="text-sm text-beetz-dark/60 mt-0.5 hidden sm:block">Onde a colmeia coloca a mão na massa.</p>
        </div>
        <Link to="/eventos/novo" className="shrink-0 flex items-center gap-1.5 honey-gradient text-beetz-dark font-bold px-4 py-2.5 rounded-xl hover:brightness-105 transition text-sm">
          <Plus size={17} /> Novo<span className="hidden sm:inline"> evento</span>
        </Link>
      </div>

      {/* O herói: o próximo compromisso da colmeia, impossível de não ver. */}
      {!loading && mostrarHeroi && heroi && (() => {
        const dias = diasAte(heroi.event_date)
        const dist = distancia(dias)
        return (
          <Link
            to={`/eventos/${heroi.id}`}
            className="block rounded-3xl overflow-hidden relative dark-gradient text-white shadow-glow"
          >
            {heroi.flyer_url && (
              <img src={heroi.flyer_url} alt="" className="absolute inset-0 w-full h-full object-cover opacity-35" />
            )}
            <div className="relative p-5 sm:p-6">
              <span className={`inline-block text-xs font-extrabold px-3 py-1 rounded-full ${dias === 0 ? 'bg-beetz-yellow text-beetz-dark animate-pulse' : 'bg-white/15 text-beetz-yellow'}`}>
                {dias === 0 ? 'É HOJE 🐝' : `Próximo evento · ${dist.label}`}
              </span>
              <h2 className="text-xl sm:text-2xl font-extrabold mt-2 leading-tight">{heroi.name}</h2>
              <div className="flex flex-wrap gap-x-4 gap-y-1 mt-2 text-sm text-white/70">
                <span className="flex items-center gap-1.5"><CalendarDays size={14} /> {dataCurta(heroi.event_date)}</span>
                {heroi.start_time && <span className="flex items-center gap-1.5"><Clock3 size={14} /> {heroi.start_time}</span>}
                {(heroi.location || heroi.city) && (
                  <span className="flex items-center gap-1.5"><MapPin size={14} /> {[heroi.location, heroi.city].filter(Boolean).join(' · ')}</span>
                )}
              </div>
            </div>
          </Link>
        )
      })()}

      {/* Recortes temporais: deslizam de lado no celular, uma linha só —
          rolagem CONTIDA na própria fileira (sem margens negativas: o
          container da página é p-4 no mobile e qualquer sangria além dele
          cria rolagem lateral na tela inteira). */}
      {!loading && (
        <div className="flex gap-1.5 overflow-x-auto pb-1 md:flex-wrap md:overflow-visible md:pb-0">
          {pills.map((p) => (
            <button
              key={p.key}
              onClick={() => setRecorte(p.key)}
              className={`shrink-0 text-sm font-semibold px-3.5 py-2 rounded-xl transition-colors ${
                recorte === p.key
                  ? p.destaque ? 'bg-beetz-yellow text-beetz-dark' : 'bg-beetz-dark text-white'
                  : 'bg-white text-beetz-dark/60 border border-beetz-dark/10'
              }`}
            >
              {p.label} ({p.count})
            </button>
          ))}
        </div>
      )}

      {/* Busca + status: os filtros auxiliares, numa linha só. */}
      {!loading && events.length > 0 && (
        <div className="flex gap-2">
          <input
            className="flex-1 min-w-0 rounded-xl border border-beetz-dark/15 text-sm px-3.5 py-2.5 focus:outline-none focus:ring-2 focus:ring-beetz-yellow bg-white"
            placeholder="Buscar por nome, local ou cidade..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="shrink-0 rounded-xl border border-beetz-dark/15 text-sm px-3 py-2.5 bg-white max-w-[130px]"
          >
            <option value="">Status</option>
            {Object.keys(statusColors).map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
        </div>
      )}

      {loading ? (
        <p className="text-beetz-dark/50">Carregando...</p>
      ) : lista.length === 0 ? (
        <div className="bg-white rounded-2xl p-8 text-center border border-beetz-dark/5">
          <p className="text-sm text-beetz-dark/50">
            {search.trim() || statusFilter
              ? 'Nenhum evento com esses filtros.'
              : recorte === 'proximos' || recorte === 'hoje'
                ? 'Nenhum evento por vir — hora de fechar o próximo! 🐝'
                : 'Nenhum evento por aqui.'}
          </p>
        </div>
      ) : (
        <div className="space-y-5">
          {grupos.map((grupo) => (
            <div key={grupo.mes}>
              <p className="text-xs font-bold uppercase tracking-wider text-beetz-dark/40 mb-2">{grupo.mes}</p>
              <div className="grid sm:grid-cols-2 xl:grid-cols-3 gap-3">
                {grupo.items.map((e) => {
                  const dias = diasAte(e.event_date)
                  const dist = distancia(dias)
                  const passado = dias < 0
                  return (
                    <Link
                      key={e.id}
                      to={`/eventos/${e.id}`}
                      className="bg-white rounded-2xl p-4 shadow-soft border border-beetz-dark/5 hover:shadow-glow transition-shadow flex gap-3 items-start min-w-0 overflow-hidden"
                    >
                      {e.flyer_url ? (
                        <img
                          src={e.flyer_url}
                          alt=""
                          className={`w-16 h-16 rounded-xl object-cover shrink-0 border border-beetz-dark/5 ${passado ? 'opacity-60 saturate-50' : ''}`}
                        />
                      ) : (
                        <div className={`w-16 h-16 rounded-xl dark-gradient flex flex-col items-center justify-center shrink-0 ${passado ? 'opacity-60' : ''}`}>
                          <span className="text-lg font-extrabold text-white leading-none">{e.event_date.split('-')[2]}</span>
                          <span className="text-[9px] uppercase tracking-widest text-beetz-yellow mt-0.5">
                            {new Date(e.event_date + 'T12:00:00').toLocaleDateString('pt-BR', { month: 'short' }).replace('.', '')}
                          </span>
                        </div>
                      )}
                      <div className="flex-1 min-w-0">
                        {/* flex-wrap: quando os dois selos não cabem lado a
                            lado, quebram linha — nunca empurram o card pra
                            fora da tela (nowrap + justify-between era a
                            receita do vazamento lateral no celular). */}
                        <div className="flex flex-wrap items-center justify-between gap-x-2 gap-y-1 min-w-0">
                          <span className={`text-[11px] font-bold px-2 py-0.5 rounded-full whitespace-nowrap ${TONE_STYLES[dist.tone]}`}>
                            {dist.label}
                          </span>
                          <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full whitespace-nowrap ${statusColors[e.status]}`}>{e.status}</span>
                        </div>
                        <h3 className="font-bold text-base leading-snug mt-1 line-clamp-2">{e.name}</h3>
                        <p className="text-xs text-beetz-dark/55 mt-1 truncate flex items-center gap-1">
                          <CalendarDays size={11} className="shrink-0" /> {dataCurta(e.event_date)}
                          {e.start_time ? ` · ${e.start_time}` : ''}
                          {(e.location || e.city) ? ` · ${[e.location, e.city].filter(Boolean).join(' · ')}` : ''}
                        </p>
                      </div>
                    </Link>
                  )
                })}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
