import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { HandCoins, X } from 'lucide-react'
import { useAuth } from '../contexts/AuthContext'
import { listAllEventRepasses, listEvents, listProfilesLite } from '../lib/dataService'
import { eventLabel } from '../lib/eventLabel'
import type { EventItem, EventRepasse, Profile } from '../lib/types'
import { canViewFinancialSummary } from '../lib/permissions'

// Padrão das telas financeiras: a rota abre ZERADA (só os filtros), e o
// Aplicar busca os repasses — recortados por evento no banco e sem os
// comprovantes base64. Mês, busca e "registrado por" filtram na hora.

const selectClass = 'rounded-xl border border-beetz-dark/15 text-sm px-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-beetz-yellow bg-white'

function currency(v: number) {
  return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

function formatDate(d: string) {
  return new Date(d + 'T00:00:00').toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', year: 'numeric' })
}

function monthLabelOf(m: string) {
  const [y, mo] = m.split('-')
  return new Date(Number(y), Number(mo) - 1, 1).toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' })
}

export default function Repasses() {
  const { accessRole } = useAuth()
  const [loading, setLoading] = useState(false)
  const [loaded, setLoaded] = useState(false)
  const [repasses, setRepasses] = useState<EventRepasse[]>([])
  const [events, setEvents] = useState<EventItem[]>([])
  const [profiles, setProfiles] = useState<Profile[]>([])
  // Multi-seleção de eventos: o select acumula; os marcados viram chips.
  const [eventFilter, setEventFilter] = useState<string[]>([])
  const [monthFilter, setMonthFilter] = useState('')
  const [authorFilter, setAuthorFilter] = useState('')
  const [search, setSearch] = useState('')

  // Rota abre LEVE: só a lista de eventos pro filtro.
  useEffect(() => { listEvents().then(setEvents).catch(() => setEvents([])) }, [])

  async function aplicar() {
    setLoading(true)
    try {
      const [rep, profs] = await Promise.all([
        listAllEventRepasses(eventFilter),
        listProfilesLite().catch(() => [] as Profile[])
      ])
      setRepasses(rep)
      setProfiles(profs)
      setLoaded(true)
    } finally {
      setLoading(false)
    }
  }

  const eventsById = useMemo(() => new Map(events.map((ev) => [ev.id, ev] as [string, EventItem])), [events])

  const profileName = (id: string | null) => {
    if (!id) return '—'
    const p = profiles.find((pr) => pr.id === id)
    const nome = p ? [p.first_name, p.last_name].filter(Boolean).join(' ').trim() : ''
    return nome || '—'
  }

  // Meses e autores existentes no recorte carregado — os selects se montam
  // do que veio, sem opção morta.
  const meses = useMemo(() => [...new Set(repasses.map((r) => r.paid_at.slice(0, 7)))].sort().reverse(), [repasses])
  const autores = useMemo(() => {
    const ids = [...new Set(repasses.map((r) => r.created_by).filter(Boolean))] as string[]
    return ids.map((id) => ({ id, nome: profileName(id) })).sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [repasses, profiles])

  const norm = (s: string) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')

  const filtered = useMemo(() => {
    const q = norm(search.trim())
    return repasses
      .filter((r) => !monthFilter || r.paid_at.slice(0, 7) === monthFilter)
      .filter((r) => !authorFilter || r.created_by === authorFilter)
      .filter((r) => {
        if (!q) return true
        const ev = eventsById.get(r.event_id)
        return norm(`${r.notes ?? ''} ${ev?.name ?? ''} ${profileName(r.created_by)}`).includes(q)
      })
      .sort((a, b) => (a.paid_at < b.paid_at ? 1 : -1))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [repasses, monthFilter, authorFilter, search, eventsById, profiles])

  const total = useMemo(() => filtered.reduce((sum, r) => sum + r.amount, 0), [filtered])

  if (!canViewFinancialSummary(accessRole)) {
    return (
      <div className="bg-white rounded-2xl p-8 shadow-soft border border-beetz-dark/5 text-center">
        <p className="text-4xl mb-3">🔒</p>
        <h1 className="text-xl font-bold mb-1">Acesso restrito</h1>
        <p className="text-sm text-beetz-dark/60">Essa área é exclusiva para a Diretoria.</p>
      </div>
    )
  }

  return (
    <div className="space-y-6 pb-16">
      <div>
        <h1 className="text-2xl md:text-3xl font-extrabold flex items-center gap-2">
          <HandCoins size={26} /> Repasses
        </h1>
        <p className="text-beetz-dark/60 mt-1">Lançamentos de repasse à produtora — no recorte que você escolher.</p>
      </div>

      <div className="bg-white rounded-2xl p-4 shadow-soft border border-beetz-dark/5 space-y-3">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:flex lg:flex-wrap lg:items-center gap-2 lg:gap-3">
          <select
            value=""
            onChange={(e) => {
              const id = e.target.value
              if (id && !eventFilter.includes(id)) setEventFilter((prev) => [...prev, id])
            }}
            className={`${selectClass} w-full lg:w-auto`}
          >
            <option value="">{eventFilter.length > 0 ? `+ Adicionar evento (${eventFilter.length})` : 'Todos os eventos'}</option>
            {events.filter((ev) => !eventFilter.includes(ev.id)).map((ev) => <option key={ev.id} value={ev.id}>{eventLabel(ev)}</option>)}
          </select>
          <select value={monthFilter} onChange={(e) => setMonthFilter(e.target.value)} className={`${selectClass} w-full lg:w-auto`} disabled={!loaded}>
            <option value="">{loaded ? 'Todos os meses' : 'Meses (após aplicar)'}</option>
            {meses.map((m) => <option key={m} value={m}>{monthLabelOf(m)}</option>)}
          </select>
          <select value={authorFilter} onChange={(e) => setAuthorFilter(e.target.value)} className={`${selectClass} w-full lg:w-auto`} disabled={!loaded}>
            <option value="">{loaded ? 'Registrado por (todos)' : 'Registrado por (após aplicar)'}</option>
            {autores.map((a) => <option key={a.id} value={a.id}>{a.nome}</option>)}
          </select>
          <input
            className={`${selectClass} w-full lg:w-56`}
            placeholder="Buscar em observações, evento..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>

        {eventFilter.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {eventFilter.map((id) => {
              const ev = eventsById.get(id)
              return (
                <span key={id} className="flex items-center gap-1.5 text-xs font-semibold bg-beetz-yellow/25 border border-beetz-yellow/60 px-2.5 py-1 rounded-full">
                  {ev ? eventLabel(ev) : 'Evento'}
                  <button onClick={() => setEventFilter((prev) => prev.filter((x) => x !== id))} className="text-beetz-dark/40 hover:text-beetz-dark">
                    <X size={12} />
                  </button>
                </span>
              )
            })}
          </div>
        )}

        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={aplicar}
            disabled={loading}
            className="w-full sm:w-auto honey-gradient text-beetz-dark font-bold px-6 py-2.5 rounded-xl text-sm disabled:opacity-60 active:scale-[0.99] transition-transform"
          >
            {loading ? 'Carregando...' : loaded ? '🔎 Aplicar filtro' : '🔎 Aplicar e carregar'}
          </button>
          {!loaded && !loading && (
            <p className="text-xs text-beetz-dark/45">
              Nada carrega sozinho: marque os eventos (ou nenhum, pra todos) e aplique.
            </p>
          )}
          {(eventFilter.length > 0 || monthFilter || authorFilter || search.trim()) && (
            <button
              onClick={() => { setEventFilter([]); setMonthFilter(''); setAuthorFilter(''); setSearch('') }}
              className="text-xs font-semibold text-beetz-dark/50 hover:text-red-600 px-2 py-2"
            >
              Limpar filtros
            </button>
          )}
        </div>
      </div>

      {loading ? (
        <p className="text-beetz-dark/50 text-sm">Carregando repasses...</p>
      ) : !loaded ? (
        <div className="bg-white rounded-2xl p-10 shadow-soft border border-beetz-dark/5 text-center">
          <p className="text-4xl mb-3">🔎</p>
          <p className="font-bold">Escolha o recorte e toque em Aplicar</p>
          <p className="text-sm text-beetz-dark/50 mt-1 max-w-md mx-auto">
            A tela abre zerada de propósito — marque um ou mais eventos (ou nenhum, pra ver todos) e aplique o filtro.
          </p>
        </div>
      ) : (
        <>
          <div className="flex flex-wrap items-center justify-between gap-3 bg-beetz-dark text-white rounded-2xl p-5">
            <div>
              <p className="text-white/60 text-xs uppercase tracking-wide font-semibold">Total no filtro aplicado</p>
              <p className="text-2xl font-extrabold">{currency(total)}</p>
            </div>
            <p className="text-white/60 text-sm">{filtered.length} lançamento(s)</p>
          </div>

          {filtered.length === 0 ? (
            <div className="bg-white rounded-2xl p-8 shadow-soft border border-beetz-dark/5 text-center text-beetz-dark/50 text-sm">
              Nenhum repasse encontrado com esses filtros.
            </div>
          ) : (
            <div className="bg-white rounded-2xl shadow-soft border border-beetz-dark/5 overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-beetz-dark/10 text-left">
                    <th className="p-3">Data</th>
                    <th className="p-3">Evento</th>
                    <th className="p-3">Observações</th>
                    <th className="p-3">Registrado por</th>
                    <th className="p-3 text-right">Valor</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((r) => {
                    const event = eventsById.get(r.event_id)
                    return (
                      <tr key={r.id} className="border-b border-beetz-dark/5 last:border-0">
                        <td className="p-3 whitespace-nowrap">{formatDate(r.paid_at)}</td>
                        <td className="p-3">
                          {event ? (
                            <Link to={`/eventos/${event.id}`} className="font-semibold hover:text-beetz-yellow transition-colors">{event.name}</Link>
                          ) : (
                            <span className="text-beetz-dark/40">Evento removido</span>
                          )}
                        </td>
                        <td className="p-3 text-xs text-beetz-dark/60">{r.notes || '—'}</td>
                        <td className="p-3 text-xs text-beetz-dark/60">{profileName(r.created_by)}</td>
                        <td className="p-3 text-right font-bold whitespace-nowrap">
                          {r.paid_in_cash && <span className="mr-1.5 text-[10px] font-bold uppercase tracking-wide bg-beetz-yellow/40 text-beetz-dark px-1.5 py-0.5 rounded-full">💵</span>}
                          {currency(r.amount)}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
                <tfoot>
                  <tr className="border-t-2 border-beetz-dark/10 bg-beetz-gray/50 font-bold">
                    <td className="p-3" colSpan={4}>Total ({filtered.length})</td>
                    <td className="p-3 text-right whitespace-nowrap">{currency(total)}</td>
                  </tr>
                </tfoot>
              </table>
            </div>
          )}
        </>
      )}
    </div>
  )
}
