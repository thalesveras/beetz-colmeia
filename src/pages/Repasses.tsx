import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { HandCoins } from 'lucide-react'
import { useAuth } from '../contexts/AuthContext'
import { listAllEventRepasses, listEvents, listProfiles } from '../lib/dataService'
import type { EventItem, EventRepasse, Profile } from '../lib/types'
import { canViewFinancialSummary } from '../lib/permissions'

const selectClass = 'rounded-xl border border-beetz-dark/15 text-sm px-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-beetz-yellow bg-white'

function currency(v: number) {
  return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

function formatDate(d: string) {
  return new Date(d + 'T00:00:00').toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', year: 'numeric' })
}

export default function Repasses() {
  const { accessRole } = useAuth()
  const [loading, setLoading] = useState(true)
  const [repasses, setRepasses] = useState<EventRepasse[]>([])
  const [events, setEvents] = useState<EventItem[]>([])
  const [profiles, setProfiles] = useState<Profile[]>([])
  const [eventFilter, setEventFilter] = useState('')

  async function load() {
    setLoading(true)
    const [rep, evs, profs] = await Promise.all([listAllEventRepasses(), listEvents(), listProfiles()])
    setRepasses(rep)
    setEvents(evs)
    setProfiles(profs)
    setLoading(false)
  }

  useEffect(() => { load() }, [])

  const eventsById = useMemo(() => {
    const map = new Map<string, EventItem>()
    for (const ev of events) map.set(ev.id, ev)
    return map
  }, [events])

  const profileName = (id: string | null) => {
    if (!id) return '—'
    const p = profiles.find((pr) => pr.id === id)
    return p ? `${p.first_name} ${p.last_name}` : '—'
  }

  const filtered = useMemo(() => {
    return repasses
      .filter((r) => !eventFilter || r.event_id === eventFilter)
      .sort((a, b) => (a.paid_at < b.paid_at ? 1 : -1))
  }, [repasses, eventFilter])

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
        <p className="text-beetz-dark/60 mt-1">Todos os lançamentos de repasse à produtora, de todos os eventos.</p>
      </div>

      <div className="bg-white rounded-2xl p-4 shadow-soft border border-beetz-dark/5">
        <div className="flex flex-wrap items-center gap-3">
          <select value={eventFilter} onChange={(e) => setEventFilter(e.target.value)} className={selectClass}>
            <option value="">Todos os eventos</option>
            {events.map((ev) => <option key={ev.id} value={ev.id}>{ev.name}</option>)}
          </select>
        </div>
      </div>

      {loading ? (
        <p className="text-beetz-dark/50 text-sm">Carregando repasses...</p>
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
                        <td className="p-3 text-right font-bold whitespace-nowrap">{currency(r.amount)}</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </div>
  )
}
