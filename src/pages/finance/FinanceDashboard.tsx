import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  AlertTriangle, BarChart3, CalendarDays, Filter, PieChart, Search, Users, Wallet, X
} from 'lucide-react'
import { useAuth } from '../../contexts/AuthContext'
import { canViewFinancialSummary } from '../../lib/permissions'
import { getFinanceDataset, type FinanceDataset, type FinanceRow } from '../../lib/dataService'
import { Donut, HorizontalBars, MonthlyBars, formatMoney, formatMoneyFull, monthLabel, type ChartDatum } from '../../components/finance/Charts'

const inputClass = 'rounded-xl border border-beetz-dark/15 text-sm px-3 py-2 focus:outline-none focus:ring-2 focus:ring-beetz-yellow'

// Por qual campo agrupar o gráfico principal. É o "filtro de visualização":
// a mesma pergunta ("onde foi o dinheiro?") respondida por ângulos diferentes.
type GroupBy = 'category' | 'eventName' | 'supplierName' | 'personName' | 'status' | 'paymentMethod'
type ChartKind = 'barras' | 'rosca'

const GROUP_OPTIONS: { key: GroupBy; label: string }[] = [
  { key: 'category', label: 'Categoria' },
  { key: 'eventName', label: 'Evento' },
  { key: 'supplierName', label: 'Fornecedor' },
  { key: 'personName', label: 'Colaborador' },
  { key: 'status', label: 'Status' },
  { key: 'paymentMethod', label: 'Forma de pagamento' }
]

const TOP_N = 8

function groupSum(rows: FinanceRow[], field: GroupBy): ChartDatum[] {
  const map = new Map<string, number>()
  for (const r of rows) {
    const k = String(r[field] ?? '—')
    map.set(k, (map.get(k) ?? 0) + r.total)
  }
  const all = [...map.entries()]
    .map(([key, value]) => ({ key, label: key, value }))
    .sort((a, b) => b.value - a.value)

  // Com muitas fatias o gráfico vira sopa de letrinha — mostra as maiores e
  // junta o resto em "Outros", sem esconder o valor total.
  if (all.length <= TOP_N) return all
  const top = all.slice(0, TOP_N)
  const restSum = all.slice(TOP_N).reduce((s, d) => s + d.value, 0)
  return [...top, { key: '__outros__', label: `Outros (${all.length - TOP_N})`, value: restSum }]
}

export default function FinanceDashboard() {
  const { accessRole } = useAuth()
  const [data, setData] = useState<FinanceDataset | null>(null)
  const [loading, setLoading] = useState(true)

  // Filtros
  const [search, setSearch] = useState('')
  const [month, setMonth] = useState('')
  const [eventId, setEventId] = useState('')
  const [category, setCategory] = useState('')
  const [supplier, setSupplier] = useState('')
  const [person, setPerson] = useState('')
  const [status, setStatus] = useState('')
  const [showFilters, setShowFilters] = useState(false)

  // Visualização
  const [groupBy, setGroupBy] = useState<GroupBy>('category')
  const [chartKind, setChartKind] = useState<ChartKind>('barras')

  useEffect(() => {
    getFinanceDataset().then(setData).finally(() => setLoading(false))
  }, [])

  const rows = data?.rows ?? []

  const options = useMemo(() => {
    const uniq = (arr: string[]) => [...new Set(arr.filter(Boolean))].sort()
    return {
      months: [...new Set(rows.map((r) => r.month).filter(Boolean))].sort(),
      categories: uniq(rows.map((r) => r.category)),
      suppliers: uniq(rows.map((r) => r.supplierName)),
      people: uniq(rows.map((r) => r.personName)),
      statuses: uniq(rows.map((r) => r.status))
    }
  }, [rows])

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    return rows.filter((r) => {
      if (month && r.month !== month) return false
      if (eventId && r.eventId !== eventId) return false
      if (category && r.category !== category) return false
      if (supplier && r.supplierName !== supplier) return false
      if (person && r.personName !== person) return false
      if (status && r.status !== status) return false
      if (q && !`${r.description} ${r.eventName} ${r.supplierName} ${r.personName}`.toLowerCase().includes(q)) return false
      return true
    })
  }, [rows, month, eventId, category, supplier, person, status, search])

  const totals = useMemo(() => {
    const total = filtered.reduce((s, r) => s + r.total, 0)
    const pendente = filtered.filter((r) => r.status === 'Pendente').reduce((s, r) => s + r.total, 0)
    const eventos = new Set(filtered.map((r) => r.eventId)).size
    const pessoas = new Set(filtered.filter((r) => r.personId).map((r) => r.personId)).size
    const fornecedores = new Set(filtered.filter((r) => r.supplierId).map((r) => r.supplierId)).size
    return { total, pendente, eventos, pessoas, fornecedores, lancamentos: filtered.length }
  }, [filtered])

  const chartData = useMemo(() => groupSum(filtered, groupBy), [filtered, groupBy])
  const monthlyData = useMemo(() => {
    const map = new Map<string, number>()
    // Meses vêm de TODAS as linhas, não das filtradas — senão filtrar um mês
    // apagaria os outros do gráfico e você perderia a comparação.
    for (const m of options.months) map.set(m, 0)
    for (const r of filtered) {
      if (r.month) map.set(r.month, (map.get(r.month) ?? 0) + r.total)
    }
    return [...map.entries()].sort((a, b) => a[0].localeCompare(b[0]))
      .map(([key, value]) => ({ key, label: monthLabel(key), value }))
  }, [filtered, options.months])

  // Clicar numa barra aplica (ou tira) o filtro correspondente — é o
  // cruzamento: categoria "Equipe" -> vê só Equipe -> troca o agrupamento
  // pra Evento e descobre em qual festa a Equipe custou mais.
  function handleChartSelect(key: string) {
    if (key === '__outros__') return
    const setters: Record<GroupBy, (v: string) => void> = {
      category: setCategory, eventName: () => {}, supplierName: setSupplier,
      personName: setPerson, status: setStatus, paymentMethod: () => {}
    }
    if (groupBy === 'eventName') {
      const ev = data?.events.find((e) => e.name === key)
      setEventId((cur) => (ev && cur === ev.id ? '' : ev?.id ?? ''))
      return
    }
    if (groupBy === 'paymentMethod') return
    const current = { category, supplierName: supplier, personName: person, status }[groupBy as 'category' | 'supplierName' | 'personName' | 'status']
    setters[groupBy](current === key ? '' : key)
  }

  const selectedChartKey = useMemo(() => {
    if (groupBy === 'category') return category || null
    if (groupBy === 'supplierName') return supplier || null
    if (groupBy === 'personName') return person || null
    if (groupBy === 'status') return status || null
    if (groupBy === 'eventName') return data?.events.find((e) => e.id === eventId)?.name ?? null
    return null
  }, [groupBy, category, supplier, person, status, eventId, data])

  const activeFilters = [month, eventId, category, supplier, person, status, search.trim()].filter(Boolean).length

  function clearFilters() {
    setMonth(''); setEventId(''); setCategory(''); setSupplier(''); setPerson(''); setStatus(''); setSearch('')
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

  if (loading) return <p className="text-beetz-dark/50 p-8">Carregando o financeiro...</p>

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl md:text-3xl font-extrabold">Financeiro</h1>
          <p className="text-beetz-dark/60 mt-1">Para onde o dinheiro foi — por evento, categoria, fornecedor e pessoa.</p>
        </div>
        <Link to="/financeiro/despesas" className="text-sm font-semibold text-beetz-dark/70 hover:text-beetz-dark border border-beetz-dark/15 px-4 py-2 rounded-xl">
          Lançar despesas →
        </Link>
      </div>

      {/* A receita quase não é lançada — melhor dizer isso na cara do que
          mostrar um "lucro" calculado em cima de zero. */}
      {data && data.eventsWithoutRevenue > 0 && (
        <div className="flex items-start gap-3 bg-beetz-yellow/15 border border-beetz-yellow/40 rounded-2xl p-4">
          <AlertTriangle size={18} className="text-beetz-dark/70 shrink-0 mt-0.5" />
          <div>
            <p className="font-semibold text-sm">
              {data.eventsWithoutRevenue} {data.eventsWithoutRevenue === 1 ? 'evento concluído está' : 'eventos concluídos estão'} sem faturamento lançado
            </p>
            <p className="text-sm text-beetz-dark/60 mt-0.5">
              Por isso esse painel mostra custos, e não lucro. Preencha o faturamento no resumo de cada evento
              pra margem fazer sentido.
            </p>
          </div>
        </div>
      )}

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div className="bg-beetz-dark text-white rounded-2xl p-4">
          <p className="text-2xl font-extrabold leading-none">{formatMoney(totals.total)}</p>
          <p className="text-xs text-white/60 mt-1.5">Total em despesas</p>
        </div>
        <div className="bg-white rounded-2xl p-4 shadow-soft border border-beetz-dark/5">
          <p className="text-2xl font-extrabold leading-none">{formatMoney(totals.pendente)}</p>
          <p className="text-xs text-beetz-dark/50 mt-1.5">Ainda pendente</p>
        </div>
        <div className="bg-white rounded-2xl p-4 shadow-soft border border-beetz-dark/5">
          <p className="text-2xl font-extrabold leading-none">{totals.lancamentos}</p>
          <p className="text-xs text-beetz-dark/50 mt-1.5">Lançamentos · {totals.eventos} evento(s)</p>
        </div>
        <div className="bg-white rounded-2xl p-4 shadow-soft border border-beetz-dark/5">
          <p className="text-2xl font-extrabold leading-none">{totals.pessoas}</p>
          <p className="text-xs text-beetz-dark/50 mt-1.5">Pessoas · {totals.fornecedores} fornecedor(es)</p>
        </div>
      </div>

      {/* ---------- Filtros ---------- */}
      <div>
        <div className="flex flex-wrap items-center gap-2 mb-3">
          <div className="relative flex-1 min-w-[200px]">
            <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-beetz-dark/30" />
            <input
              placeholder="Buscar por descrição, evento, fornecedor ou pessoa"
              value={search} onChange={(e) => setSearch(e.target.value)}
              className={`${inputClass} w-full pl-9`}
            />
          </div>
          <button
            onClick={() => setShowFilters((v) => !v)}
            className={`flex items-center gap-1.5 text-sm font-semibold px-3.5 py-2 rounded-xl border transition-colors ${
              showFilters || activeFilters > 0
                ? 'bg-beetz-dark text-white border-beetz-dark'
                : 'bg-white text-beetz-dark/70 border-beetz-dark/10 hover:bg-beetz-gray'
            }`}
          >
            <Filter size={14} /> Filtros
            {activeFilters > 0 && (
              <span className="bg-beetz-yellow text-beetz-dark text-[10px] font-bold w-4 h-4 rounded-full flex items-center justify-center">
                {activeFilters}
              </span>
            )}
          </button>
        </div>

        {showFilters && (
          <div className="bg-white rounded-2xl p-4 border border-beetz-dark/5 shadow-soft grid sm:grid-cols-3 gap-3">
            <select value={month} onChange={(e) => setMonth(e.target.value)} className={inputClass}>
              <option value="">Todos os meses</option>
              {options.months.map((m) => <option key={m} value={m}>{monthLabel(m)}</option>)}
            </select>
            <select value={eventId} onChange={(e) => setEventId(e.target.value)} className={inputClass}>
              <option value="">Todos os eventos</option>
              {data?.events.map((e) => <option key={e.id} value={e.id}>{e.name}</option>)}
            </select>
            <select value={category} onChange={(e) => setCategory(e.target.value)} className={inputClass}>
              <option value="">Todas as categorias</option>
              {options.categories.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
            <select value={supplier} onChange={(e) => setSupplier(e.target.value)} className={inputClass}>
              <option value="">Todos os fornecedores</option>
              {options.suppliers.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
            <select value={person} onChange={(e) => setPerson(e.target.value)} className={inputClass}>
              <option value="">Todos os colaboradores</option>
              {options.people.map((p) => <option key={p} value={p}>{p}</option>)}
            </select>
            <select value={status} onChange={(e) => setStatus(e.target.value)} className={inputClass}>
              <option value="">Todos os status</option>
              {options.statuses.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
            {activeFilters > 0 && (
              <button onClick={clearFilters} className="sm:col-span-3 text-xs font-semibold text-beetz-dark/50 hover:text-beetz-dark flex items-center gap-1 justify-end">
                <X size={12} /> Limpar filtros
              </button>
            )}
          </div>
        )}
      </div>

      {/* ---------- Gráfico principal, com seletor de ângulo ---------- */}
      <div className="bg-white rounded-2xl p-5 shadow-soft border border-beetz-dark/5">
        <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
          <h2 className="font-bold flex items-center gap-2"><Wallet size={17} /> Despesas por</h2>
          <div className="flex flex-wrap items-center gap-2">
            <select value={groupBy} onChange={(e) => setGroupBy(e.target.value as GroupBy)} className={`${inputClass} font-semibold`}>
              {GROUP_OPTIONS.map((o) => <option key={o.key} value={o.key}>{o.label}</option>)}
            </select>
            <div className="flex bg-beetz-gray rounded-xl p-1">
              <button
                onClick={() => setChartKind('barras')}
                title="Barras"
                className={`p-1.5 rounded-lg ${chartKind === 'barras' ? 'bg-white shadow-sm' : 'text-beetz-dark/40'}`}
              >
                <BarChart3 size={15} />
              </button>
              <button
                onClick={() => setChartKind('rosca')}
                title="Rosca"
                className={`p-1.5 rounded-lg ${chartKind === 'rosca' ? 'bg-white shadow-sm' : 'text-beetz-dark/40'}`}
              >
                <PieChart size={15} />
              </button>
            </div>
          </div>
        </div>

        {chartKind === 'barras' ? (
          <HorizontalBars data={chartData} onSelect={handleChartSelect} selectedKey={selectedChartKey} />
        ) : (
          <Donut data={chartData} onSelect={handleChartSelect} selectedKey={selectedChartKey} />
        )}
        <p className="text-[11px] text-beetz-dark/35 mt-4">Clique numa barra pra filtrar o painel inteiro por ela.</p>
      </div>

      {/* ---------- Tempo ---------- */}
      <div className="bg-white rounded-2xl p-5 shadow-soft border border-beetz-dark/5">
        <h2 className="font-bold flex items-center gap-2 mb-1"><CalendarDays size={17} /> Por mês</h2>
        <p className="text-[11px] text-beetz-dark/40 mb-2">
          Agrupado pela data do evento — não pela data em que a despesa foi lançada no sistema.
        </p>
        <MonthlyBars data={monthlyData} onSelect={(k) => setMonth((cur) => (cur === k ? '' : k))} selectedKey={month || null} />
      </div>

      {/* ---------- Detalhe ---------- */}
      <div>
        <div className="flex items-center justify-between gap-2 mb-3">
          <h2 className="font-bold flex items-center gap-2"><Users size={17} /> Lançamentos</h2>
          <p className="text-xs text-beetz-dark/40">{filtered.length} de {rows.length}</p>
        </div>
        {filtered.length === 0 ? (
          <p className="text-sm text-beetz-dark/50 bg-white rounded-2xl p-6 text-center border border-beetz-dark/5">
            Nenhum lançamento com esses filtros.
          </p>
        ) : (
          <div className="bg-white rounded-2xl shadow-soft border border-beetz-dark/5 divide-y divide-beetz-dark/5 max-h-[420px] overflow-y-auto">
            {filtered.slice(0, 100).map((r) => (
              <div key={r.id} className="flex flex-wrap items-center gap-2 p-3">
                <div className="flex-1 min-w-[180px]">
                  <p className="text-sm font-semibold truncate">{r.description || '(sem descrição)'}</p>
                  <p className="text-[11px] text-beetz-dark/45 truncate">
                    {r.eventName} · {r.category}
                    {r.personName !== 'Sem pessoa' && ` · ${r.personName}`}
                    {r.supplierName !== 'Sem fornecedor' && ` · ${r.supplierName}`}
                  </p>
                </div>
                <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${
                  r.status === 'Pendente' ? 'bg-amber-100 text-amber-700'
                    : r.status === 'Aprovado' ? 'bg-green-100 text-green-700'
                    : 'bg-beetz-dark/10 text-beetz-dark/50'
                }`}>
                  {r.status}
                </span>
                <span className="text-sm font-bold w-24 text-right">{formatMoneyFull(r.total)}</span>
              </div>
            ))}
            {filtered.length > 100 && (
              <p className="text-xs text-beetz-dark/40 p-3 text-center">
                Mostrando os 100 primeiros. Use os filtros pra afunilar.
              </p>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
