import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import {
  listAllExpenses, listEvents, listPendingProfilesForPicker, listProfiles, listSuppliers
} from '../lib/dataService'
import type { EventItem, Expense, ExpenseStatus, PendingProfilePickerItem, Profile, Supplier } from '../lib/types'
import { canViewFinancialSummary } from '../lib/permissions'
import { Filter, X } from 'lucide-react'

const statusColors: Record<ExpenseStatus, string> = {
  Pendente: 'bg-beetz-yellow/30 text-beetz-dark',
  Aprovado: 'bg-blue-100 text-blue-700',
  Pago: 'bg-green-100 text-green-700',
  Rejeitado: 'bg-red-100 text-red-700',
  Cancelado: 'bg-beetz-dark/10 text-beetz-dark/50'
}

function currency(v: number) {
  return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

function formatDate(d: string) {
  return new Date(d + 'T00:00:00').toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', year: 'numeric' })
}

function monthLabel(key: string) {
  const [year, month] = key.split('-')
  const date = new Date(Number(year), Number(month) - 1, 1)
  const label = date.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' })
  return label.charAt(0).toUpperCase() + label.slice(1)
}

const selectClass = 'rounded-xl border border-beetz-dark/15 text-sm px-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-beetz-yellow bg-white'

export default function FinanceExpenses() {
  const { accessRole } = useAuth()
  const [loading, setLoading] = useState(true)
  const [expenses, setExpenses] = useState<Expense[]>([])
  const [events, setEvents] = useState<EventItem[]>([])
  const [profiles, setProfiles] = useState<Profile[]>([])
  const [pendingProfiles, setPendingProfiles] = useState<PendingProfilePickerItem[]>([])
  const [suppliers, setSuppliers] = useState<Supplier[]>([])

  const [monthFilter, setMonthFilter] = useState('')
  const [producerFilter, setProducerFilter] = useState('')
  const [eventFilter, setEventFilter] = useState('')
  const [statusFilter, setStatusFilter] = useState('')

  useEffect(() => {
    async function load() {
      setLoading(true)
      const [exp, evs, profs, pend, sups] = await Promise.all([
        listAllExpenses(), listEvents(), listProfiles(), listPendingProfilesForPicker(), listSuppliers()
      ])
      setExpenses(exp)
      setEvents(evs)
      setProfiles(profs)
      setPendingProfiles(pend)
      setSuppliers(sups)
      setLoading(false)
    }
    load()
  }, [])

  const eventsById = useMemo(() => {
    const map = new Map<string, EventItem>()
    for (const ev of events) map.set(ev.id, ev)
    return map
  }, [events])

  const months = useMemo(() => {
    const set = new Set(events.map((ev) => ev.event_date.slice(0, 7)))
    return Array.from(set).sort().reverse()
  }, [events])

  const producers = useMemo(() => {
    const set = new Set(events.map((ev) => ev.producer_name).filter((p): p is string => !!p))
    return Array.from(set).sort((a, b) => a.localeCompare(b, 'pt-BR'))
  }, [events])

  const eventOptions = useMemo(() => {
    return events
      .filter((ev) => !producerFilter || ev.producer_name === producerFilter)
      .slice()
      .sort((a, b) => (a.event_date < b.event_date ? 1 : -1))
  }, [events, producerFilter])

  const filtered = useMemo(() => {
    return expenses
      .filter((exp) => {
        const event = eventsById.get(exp.event_id)
        if (!event) return false
        if (monthFilter && event.event_date.slice(0, 7) !== monthFilter) return false
        if (producerFilter && event.producer_name !== producerFilter) return false
        if (eventFilter && event.id !== eventFilter) return false
        if (statusFilter && exp.status !== statusFilter) return false
        return true
      })
      .sort((a, b) => {
        const eventA = eventsById.get(a.event_id)
        const eventB = eventsById.get(b.event_id)
        return (eventB?.event_date ?? '') < (eventA?.event_date ?? '') ? -1 : 1
      })
  }, [expenses, eventsById, monthFilter, producerFilter, eventFilter, statusFilter])

  const total = useMemo(() => filtered.reduce((sum, e) => sum + e.total, 0), [filtered])
  const hasFilters = !!(monthFilter || producerFilter || eventFilter || statusFilter)

  function clearFilters() {
    setMonthFilter('')
    setProducerFilter('')
    setEventFilter('')
    setStatusFilter('')
  }

  function personName(exp: Expense) {
    if (exp.team_member_id) {
      const p = profiles.find((m) => m.id === exp.team_member_id)
      return p ? `${p.first_name} ${p.last_name}` : '—'
    }
    if (exp.pending_team_member_id) {
      const p = pendingProfiles.find((m) => m.id === exp.pending_team_member_id)
      return p ? `${p.first_name ?? ''} ${p.last_name ?? ''} (pré-cadastro)`.trim() : '—'
    }
    return null
  }

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
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl md:text-3xl font-extrabold">Financeiro</h1>
        <p className="text-beetz-dark/60 mt-1">Todas as despesas da colmeia, de todos os eventos, num só lugar.</p>
      </div>

      <div className="bg-white rounded-2xl p-4 shadow-soft border border-beetz-dark/5">
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2 text-sm font-semibold text-beetz-dark/70">
            <Filter size={16} /> Filtros
          </div>
          <select value={monthFilter} onChange={(e) => setMonthFilter(e.target.value)} className={selectClass}>
            <option value="">Todos os meses</option>
            {months.map((m) => <option key={m} value={m}>{monthLabel(m)}</option>)}
          </select>
          <select
            value={producerFilter}
            onChange={(e) => { setProducerFilter(e.target.value); setEventFilter('') }}
            className={selectClass}
          >
            <option value="">Todos os produtores</option>
            {producers.map((p) => <option key={p} value={p}>{p}</option>)}
          </select>
          <select value={eventFilter} onChange={(e) => setEventFilter(e.target.value)} className={selectClass}>
            <option value="">Todos os eventos</option>
            {eventOptions.map((ev) => <option key={ev.id} value={ev.id}>{ev.name}</option>)}
          </select>
          <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className={selectClass}>
            <option value="">Todos os status</option>
            {Object.keys(statusColors).map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
          {hasFilters && (
            <button
              onClick={clearFilters}
              className="flex items-center gap-1 text-sm text-beetz-dark/50 hover:text-beetz-dark px-2 py-2"
            >
              <X size={14} /> Limpar
            </button>
          )}
        </div>
      </div>

      {loading ? (
        <p className="text-beetz-dark/50 text-sm">Carregando despesas...</p>
      ) : (
        <>
          <div className="flex flex-wrap items-center justify-between gap-3 bg-beetz-dark text-white rounded-2xl p-5">
            <div>
              <p className="text-white/60 text-xs uppercase tracking-wide font-semibold">Total no filtro aplicado</p>
              <p className="text-2xl font-extrabold">{currency(total)}</p>
            </div>
            <p className="text-white/60 text-sm">{filtered.length} despesa(s)</p>
          </div>

          {filtered.length === 0 ? (
            <div className="bg-white rounded-2xl p-8 shadow-soft border border-beetz-dark/5 text-center text-beetz-dark/50 text-sm">
              Nenhuma despesa encontrada com esses filtros.
            </div>
          ) : (
            <div className="space-y-2">
              {filtered.map((exp) => {
                const event = eventsById.get(exp.event_id)
                const supplier = exp.supplier_id ? suppliers.find((s) => s.id === exp.supplier_id) : null
                const person = personName(exp)
                return (
                  <div
                    key={exp.id}
                    className={`flex flex-wrap items-center gap-3 bg-white border border-beetz-dark/5 rounded-xl p-4 ${exp.status === 'Cancelado' ? 'opacity-50' : ''}`}
                  >
                    <span className={`text-xs font-semibold px-2.5 py-1 rounded-full ${statusColors[exp.status]}`}>
                      {exp.status}
                    </span>
                    <div className="flex-1 min-w-[220px]">
                      <p className="font-semibold text-sm">{exp.category || 'Sem categoria'}</p>
                      <p className="text-xs text-beetz-dark/50">
                        {exp.description || '—'} {exp.payment_method ? `· ${exp.payment_method}` : ''}
                        {person ? ` · Equipe: ${person}` : ''}
                        {supplier ? ` · Fornecedor: ${supplier.name}` : ''}
                      </p>
                    </div>
                    <div className="text-right min-w-[160px]">
                      {event ? (
                        <Link to={`/eventos/${event.id}`} className="text-sm font-semibold hover:text-beetz-yellow transition-colors">
                          {event.name}
                        </Link>
                      ) : (
                        <span className="text-sm text-beetz-dark/40">Evento removido</span>
                      )}
                      <p className="text-xs text-beetz-dark/50">
                        {event ? formatDate(event.event_date) : ''}
                        {event?.producer_name ? ` · ${event.producer_name}` : ''}
                      </p>
                    </div>
                    <span className="font-bold text-sm w-28 text-right">{currency(exp.total)}</span>
                  </div>
                )
              })}
            </div>
          )}
        </>
      )}
    </div>
  )
}
