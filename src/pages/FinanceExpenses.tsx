import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import {
  deleteExpense, listAllExpenses, listEvents, listExpenseCategories, listPaymentMethods,
  listPendingProfilesForPicker, listProfiles, listSuppliers
} from '../lib/dataService'
import type {
  EventItem, Expense, ExpenseCategory, ExpenseStatus, PaymentMethodOption, PendingProfilePickerItem,
  Profile, Supplier
} from '../lib/types'
import { canAddExpense, canEditExpense, canReviewExpense, canViewFinancialSummary } from '../lib/permissions'
import { ArrowUpDown, Filter, LayoutGrid, List, Pencil, Plus, Trash2, X } from 'lucide-react'
import EditExpenseModal from '../components/finance/EditExpenseModal'
import CreateExpenseModal from '../components/finance/CreateExpenseModal'

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

type SortField = 'date' | 'event' | 'status' | 'value'
type SortDir = 'asc' | 'desc'

export default function FinanceExpenses() {
  const { accessRole, userId } = useAuth()
  const [loading, setLoading] = useState(true)
  const [expenses, setExpenses] = useState<Expense[]>([])
  const [events, setEvents] = useState<EventItem[]>([])
  const [profiles, setProfiles] = useState<Profile[]>([])
  const [pendingProfiles, setPendingProfiles] = useState<PendingProfilePickerItem[]>([])
  const [suppliers, setSuppliers] = useState<Supplier[]>([])
  const [categories, setCategories] = useState<ExpenseCategory[]>([])
  const [paymentMethods, setPaymentMethods] = useState<PaymentMethodOption[]>([])

  const [monthFilter, setMonthFilter] = useState('')
  const [producerFilter, setProducerFilter] = useState('')
  const [eventFilter, setEventFilter] = useState('')
  const [statusFilter, setStatusFilter] = useState('')

  const [viewMode, setViewMode] = useState<'cards' | 'table'>('cards')
  const [sortField, setSortField] = useState<SortField>('date')
  const [sortDir, setSortDir] = useState<SortDir>('desc')

  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [editingExpense, setEditingExpense] = useState<Expense | null>(null)
  const [creating, setCreating] = useState(false)
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null)
  const [deletingId, setDeletingId] = useState<string | null>(null)

  const canEdit = canEditExpense(accessRole)

  async function load() {
    setLoading(true)
    const [exp, evs, profs, pend, sups, cats, methods] = await Promise.all([
      listAllExpenses(), listEvents(), listProfiles(), listPendingProfilesForPicker(), listSuppliers(),
      listExpenseCategories(), listPaymentMethods()
    ])
    setExpenses(exp)
    setEvents(evs)
    setProfiles(profs)
    setPendingProfiles(pend)
    setSuppliers(sups)
    setCategories(cats)
    setPaymentMethods(methods)
    setLoading(false)
  }

  useEffect(() => { load() }, [])

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
    const list = expenses.filter((exp) => {
      const event = eventsById.get(exp.event_id)
      if (!event) return false
      if (monthFilter && event.event_date.slice(0, 7) !== monthFilter) return false
      if (producerFilter && event.producer_name !== producerFilter) return false
      if (eventFilter && event.id !== eventFilter) return false
      if (statusFilter && exp.status !== statusFilter) return false
      return true
    })
    const dir = sortDir === 'asc' ? 1 : -1
    return list.sort((a, b) => {
      const eventA = eventsById.get(a.event_id)
      const eventB = eventsById.get(b.event_id)
      switch (sortField) {
        case 'event':
          return dir * (eventA?.name ?? '').localeCompare(eventB?.name ?? '', 'pt-BR')
        case 'status':
          return dir * a.status.localeCompare(b.status, 'pt-BR')
        case 'value':
          return dir * (a.total - b.total)
        case 'date':
        default:
          return dir * ((eventA?.event_date ?? '') < (eventB?.event_date ?? '') ? -1 : 1)
      }
    })
  }, [expenses, eventsById, monthFilter, producerFilter, eventFilter, statusFilter, sortField, sortDir])

  const total = useMemo(() => filtered.reduce((sum, e) => sum + e.total, 0), [filtered])
  const hasFilters = !!(monthFilter || producerFilter || eventFilter || statusFilter)

  const selectedTotal = useMemo(
    () => filtered.filter((e) => selected.has(e.id)).reduce((sum, e) => sum + e.total, 0),
    [filtered, selected]
  )

  function clearFilters() {
    setMonthFilter('')
    setProducerFilter('')
    setEventFilter('')
    setStatusFilter('')
  }

  function toggleSort(field: SortField) {
    if (sortField === field) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'))
    } else {
      setSortField(field)
      setSortDir('asc')
    }
  }

  function toggleSelected(id: string) {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  function clearSelection() {
    setSelected(new Set())
  }

  async function handleDelete(id: string) {
    setDeletingId(id)
    try {
      await deleteExpense(id)
      setConfirmDeleteId(null)
      setSelected((prev) => {
        const next = new Set(prev)
        next.delete(id)
        return next
      })
      await load()
    } catch (err: any) {
      alert(err?.message ?? 'Erro ao apagar despesa.')
    } finally {
      setDeletingId(null)
    }
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
    <div className="space-y-6 pb-16">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl md:text-3xl font-extrabold">Financeiro</h1>
          <p className="text-beetz-dark/60 mt-1">Todas as despesas da colmeia, de todos os eventos, num só lugar.</p>
        </div>
        <div className="flex items-center gap-2">
          {canAddExpense(accessRole) && (
            <button
              onClick={() => setCreating(true)}
              className="flex items-center gap-2 honey-gradient text-beetz-dark font-bold px-4 py-2 rounded-xl text-sm"
            >
              <Plus size={16} /> Nova despesa
            </button>
          )}
          <div className="flex bg-white rounded-xl border border-beetz-dark/10 p-1">
          <button
            onClick={() => setViewMode('cards')}
            className={`flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-lg transition-colors ${viewMode === 'cards' ? 'bg-beetz-dark text-white' : 'text-beetz-dark/50 hover:bg-beetz-gray'}`}
          >
            <LayoutGrid size={14} /> Cards
          </button>
          <button
            onClick={() => setViewMode('table')}
            className={`flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-lg transition-colors ${viewMode === 'table' ? 'bg-beetz-dark text-white' : 'text-beetz-dark/50 hover:bg-beetz-gray'}`}
          >
            <List size={14} /> Tabela
          </button>
          </div>
        </div>
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
          ) : viewMode === 'cards' ? (
            <div className="space-y-2">
              {filtered.map((exp) => {
                const event = eventsById.get(exp.event_id)
                const supplier = exp.supplier_id ? suppliers.find((s) => s.id === exp.supplier_id) : null
                const person = personName(exp)
                const isSelected = selected.has(exp.id)
                return (
                  <div
                    key={exp.id}
                    className={`flex flex-wrap items-center gap-3 bg-white border rounded-xl p-4 transition-colors ${
                      isSelected ? 'border-beetz-yellow ring-2 ring-beetz-yellow/40' : 'border-beetz-dark/5'
                    } ${exp.status === 'Cancelado' ? 'opacity-50' : ''}`}
                  >
                    <input
                      type="checkbox"
                      checked={isSelected}
                      onChange={() => toggleSelected(exp.id)}
                      className="w-4 h-4 accent-beetz-yellow shrink-0"
                    />
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
                      ) : exp.event_id ? (
                        <span className="text-sm text-beetz-dark/40">Evento removido</span>
                      ) : (
                        // Sem event_id = despesa da EMPRESA (aluguel, estoque...)
                        // — não é erro, é a categoria nova de gasto.
                        <span className="inline-flex items-center gap-1 text-xs font-bold bg-beetz-dark text-white px-2 py-0.5 rounded-full">
                          Beetz · empresa{exp.stock_movement_id ? ' · estoque' : ''}
                        </span>
                      )}
                      <p className="text-xs text-beetz-dark/50">
                        {event ? formatDate(event.event_date) : ''}
                        {event?.producer_name ? ` · ${event.producer_name}` : ''}
                      </p>
                    </div>
                    <span className="font-bold text-sm w-28 text-right">{currency(exp.total)}</span>
                    {canEdit && (
                      <div className="flex items-center gap-1.5">
                        <button
                          onClick={() => setEditingExpense(exp)}
                          className="text-beetz-dark/40 hover:text-beetz-dark p-1.5 rounded-lg hover:bg-beetz-gray"
                        >
                          <Pencil size={14} />
                        </button>
                        {confirmDeleteId === exp.id ? (
                          <div className="flex items-center gap-1">
                            <button
                              onClick={() => handleDelete(exp.id)}
                              disabled={deletingId === exp.id}
                              className="text-xs font-semibold bg-red-600 text-white px-2.5 py-1.5 rounded-lg hover:bg-red-700 disabled:opacity-60"
                            >
                              {deletingId === exp.id ? '...' : 'Confirmar'}
                            </button>
                            <button
                              onClick={() => setConfirmDeleteId(null)}
                              className="text-xs font-semibold text-beetz-dark/50 px-2 py-1.5 rounded-lg hover:bg-beetz-gray"
                            >
                              Cancelar
                            </button>
                          </div>
                        ) : (
                          <button
                            onClick={() => setConfirmDeleteId(exp.id)}
                            className="text-red-400 hover:text-red-600 p-1.5 rounded-lg hover:bg-red-50"
                          >
                            <Trash2 size={14} />
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          ) : (
            <div className="bg-white rounded-2xl shadow-soft border border-beetz-dark/5 overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-beetz-dark/10 text-left">
                    <th className="p-3 w-8"></th>
                    <th className="p-3 cursor-pointer select-none" onClick={() => toggleSort('status')}>
                      <span className="flex items-center gap-1">Status <ArrowUpDown size={12} className="text-beetz-dark/30" /></span>
                    </th>
                    <th className="p-3">Categoria / Descrição</th>
                    <th className="p-3">Equipe / Fornecedor</th>
                    <th className="p-3 cursor-pointer select-none" onClick={() => toggleSort('event')}>
                      <span className="flex items-center gap-1">Evento <ArrowUpDown size={12} className="text-beetz-dark/30" /></span>
                    </th>
                    <th className="p-3 cursor-pointer select-none" onClick={() => toggleSort('date')}>
                      <span className="flex items-center gap-1">Data <ArrowUpDown size={12} className="text-beetz-dark/30" /></span>
                    </th>
                    <th className="p-3">Produtor</th>
                    <th className="p-3 text-right cursor-pointer select-none" onClick={() => toggleSort('value')}>
                      <span className="flex items-center gap-1 justify-end">Valor <ArrowUpDown size={12} className="text-beetz-dark/30" /></span>
                    </th>
                    {canEdit && <th className="p-3"></th>}
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((exp) => {
                    const event = eventsById.get(exp.event_id)
                    const supplier = exp.supplier_id ? suppliers.find((s) => s.id === exp.supplier_id) : null
                    const person = personName(exp)
                    const isSelected = selected.has(exp.id)
                    return (
                      <tr
                        key={exp.id}
                        className={`border-b border-beetz-dark/5 last:border-0 ${isSelected ? 'bg-beetz-yellow/10' : ''} ${exp.status === 'Cancelado' ? 'opacity-50' : ''}`}
                      >
                        <td className="p-3">
                          <input type="checkbox" checked={isSelected} onChange={() => toggleSelected(exp.id)} className="w-4 h-4 accent-beetz-yellow" />
                        </td>
                        <td className="p-3">
                          <span className={`text-xs font-semibold px-2 py-1 rounded-full ${statusColors[exp.status]}`}>{exp.status}</span>
                        </td>
                        <td className="p-3">
                          <p className="font-semibold">{exp.category || 'Sem categoria'}</p>
                          <p className="text-xs text-beetz-dark/50">{exp.description || '—'}</p>
                        </td>
                        <td className="p-3 text-xs text-beetz-dark/60">
                          {person && <p>{person}</p>}
                          {supplier && <p>{supplier.name}</p>}
                          {!person && !supplier && '—'}
                        </td>
                        <td className="p-3">
                          {event ? (
                            <Link to={`/eventos/${event.id}`} className="font-semibold hover:text-beetz-yellow transition-colors">{event.name}</Link>
                          ) : (
                            <span className="text-beetz-dark/40">Removido</span>
                          )}
                        </td>
                        <td className="p-3 text-xs text-beetz-dark/60 whitespace-nowrap">{event ? formatDate(event.event_date) : ''}</td>
                        <td className="p-3 text-xs text-beetz-dark/60">{event?.producer_name || '—'}</td>
                        <td className="p-3 text-right font-bold whitespace-nowrap">{currency(exp.total)}</td>
                        {canEdit && (
                          <td className="p-3">
                            <div className="flex items-center gap-1 justify-end">
                              <button onClick={() => setEditingExpense(exp)} className="text-beetz-dark/40 hover:text-beetz-dark p-1.5 rounded-lg hover:bg-beetz-gray">
                                <Pencil size={13} />
                              </button>
                              {confirmDeleteId === exp.id ? (
                                <>
                                  <button
                                    onClick={() => handleDelete(exp.id)}
                                    disabled={deletingId === exp.id}
                                    className="text-xs font-semibold bg-red-600 text-white px-2 py-1 rounded-lg hover:bg-red-700 disabled:opacity-60"
                                  >
                                    {deletingId === exp.id ? '...' : 'OK'}
                                  </button>
                                  <button onClick={() => setConfirmDeleteId(null)} className="text-xs text-beetz-dark/50 px-1.5">✕</button>
                                </>
                              ) : (
                                <button onClick={() => setConfirmDeleteId(exp.id)} className="text-red-400 hover:text-red-600 p-1.5 rounded-lg hover:bg-red-50">
                                  <Trash2 size={13} />
                                </button>
                              )}
                            </div>
                          </td>
                        )}
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}

      {selected.size > 0 && (
        <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-40 bg-beetz-dark text-white rounded-2xl shadow-glow px-5 py-3 flex items-center gap-4">
          <span className="text-sm">{selected.size} selecionada(s)</span>
          <span className="font-extrabold text-beetz-yellow">{currency(selectedTotal)}</span>
          <button onClick={clearSelection} className="text-xs font-semibold text-white/60 hover:text-white flex items-center gap-1">
            <X size={13} /> Limpar
          </button>
        </div>
      )}

      {creating && (
        <CreateExpenseModal
          events={events}
          categories={categories}
          paymentMethods={paymentMethods}
          profiles={profiles}
          pendingProfiles={pendingProfiles}
          suppliers={suppliers}
          userId={userId}
          canReview={canReviewExpense(accessRole)}
          onClose={() => setCreating(false)}
          onSaved={load}
        />
      )}

      {editingExpense && (
        <EditExpenseModal
          expense={editingExpense}
          events={events}
          categories={categories}
          paymentMethods={paymentMethods}
          profiles={profiles}
          pendingProfiles={pendingProfiles}
          suppliers={suppliers}
          onClose={() => setEditingExpense(null)}
          onSaved={load}
        />
      )}
    </div>
  )
}
