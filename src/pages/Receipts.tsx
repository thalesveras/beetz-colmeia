import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { Receipt } from 'lucide-react'
import { useAuth } from '../contexts/AuthContext'
import { listAllCashierSettlements, listEvents, listProfiles } from '../lib/dataService'
import type { CashierSettlement, CashierStatus, EventItem, Profile } from '../lib/types'
import { canViewFinancialSummary } from '../lib/permissions'

const selectClass = 'rounded-xl border border-beetz-dark/15 text-sm px-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-beetz-yellow bg-white'

const statusColors: Record<CashierStatus, string> = {
  Pendente: 'bg-beetz-yellow/30 text-beetz-dark',
  Aprovado: 'bg-green-100 text-green-700',
  Rejeitado: 'bg-red-100 text-red-700'
}

function currency(v: number) {
  return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

function formatDateTime(iso: string) {
  return new Date(iso).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' })
}

export default function Receipts() {
  const { accessRole } = useAuth()
  const [loading, setLoading] = useState(true)
  const [settlements, setSettlements] = useState<CashierSettlement[]>([])
  const [events, setEvents] = useState<EventItem[]>([])
  const [profiles, setProfiles] = useState<Profile[]>([])
  const [eventFilter, setEventFilter] = useState('')

  async function load() {
    setLoading(true)
    const [s, evs, profs] = await Promise.all([listAllCashierSettlements(), listEvents(), listProfiles()])
    setSettlements(s)
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
    if (!id) return 'Colaborador(a)'
    const p = profiles.find((pr) => pr.id === id)
    return p ? `${p.first_name} ${p.last_name}` : 'Colaborador(a)'
  }

  const filtered = useMemo(() => {
    return settlements
      .filter((s) => !eventFilter || s.event_id === eventFilter)
      .sort((a, b) => (a.created_at < b.created_at ? 1 : -1))
  }, [settlements, eventFilter])

  const total = useMemo(() => filtered.reduce((sum, s) => sum + s.total, 0), [filtered])
  const totalCommission = useMemo(() => filtered.reduce((sum, s) => sum + s.commission_amount, 0), [filtered])

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
          <Receipt size={26} /> Recebimentos
        </h1>
        <p className="text-beetz-dark/60 mt-1">Todos os fechamentos de caixa (vendas), de todos os eventos.</p>
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
        <p className="text-beetz-dark/50 text-sm">Carregando recebimentos...</p>
      ) : (
        <>
          <div className="flex flex-wrap items-center justify-between gap-3 bg-beetz-dark text-white rounded-2xl p-5">
            <div>
              <p className="text-white/60 text-xs uppercase tracking-wide font-semibold">Total no filtro aplicado</p>
              <p className="text-2xl font-extrabold">{currency(total)}</p>
              <p className="text-white/50 text-xs mt-1">Comissões de garçom: {currency(totalCommission)}</p>
            </div>
            <p className="text-white/60 text-sm">{filtered.length} recebimento(s)</p>
          </div>

          {filtered.length === 0 ? (
            <div className="bg-white rounded-2xl p-8 shadow-soft border border-beetz-dark/5 text-center text-beetz-dark/50 text-sm">
              Nenhum recebimento encontrado com esses filtros.
            </div>
          ) : (
            <div className="bg-white rounded-2xl shadow-soft border border-beetz-dark/5 overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-beetz-dark/10 text-left">
                    <th className="p-3">Status</th>
                    <th className="p-3">Evento</th>
                    <th className="p-3">Colaborador(a)</th>
                    <th className="p-3">Tipo</th>
                    <th className="p-3 text-right">Dinheiro</th>
                    <th className="p-3 text-right">Débito</th>
                    <th className="p-3 text-right">Crédito</th>
                    <th className="p-3 text-right">Pix</th>
                    <th className="p-3 text-right">Total</th>
                    <th className="p-3 text-right">Comissão</th>
                    <th className="p-3">Data</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((s) => {
                    const event = eventsById.get(s.event_id)
                    return (
                      <tr key={s.id} className="border-b border-beetz-dark/5 last:border-0">
                        <td className="p-3">
                          <span className={`text-xs font-semibold px-2 py-1 rounded-full ${statusColors[s.status]}`}>{s.status}</span>
                        </td>
                        <td className="p-3">
                          {event ? (
                            <Link to={`/eventos/${event.id}`} className="font-semibold hover:text-beetz-yellow transition-colors">{event.name}</Link>
                          ) : (
                            <span className="text-beetz-dark/40">Evento removido</span>
                          )}
                        </td>
                        <td className="p-3 text-xs text-beetz-dark/60">{profileName(s.profile_id)}</td>
                        <td className="p-3 text-xs text-beetz-dark/60">{s.role_type}</td>
                        <td className="p-3 text-right whitespace-nowrap">{currency(s.cash_amount)}</td>
                        <td className="p-3 text-right whitespace-nowrap">{currency(s.debit_amount)}</td>
                        <td className="p-3 text-right whitespace-nowrap">{currency(s.credit_amount)}</td>
                        <td className="p-3 text-right whitespace-nowrap">{currency(s.pix_amount)}</td>
                        <td className="p-3 text-right font-bold whitespace-nowrap">{currency(s.total)}</td>
                        <td className="p-3 text-right whitespace-nowrap">{s.role_type === 'Garçom' ? currency(s.commission_amount) : '—'}</td>
                        <td className="p-3 text-xs text-beetz-dark/60 whitespace-nowrap">{formatDateTime(s.created_at)}</td>
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
