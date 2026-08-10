import { eventLabel } from '../lib/eventLabel'
import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import {
  addExpensePayment, deleteExpense, getExpenseAttachments, listAllExpenses, listEvents, listExpenseCategories, listExpensePaymentTotals, listPaymentMethods, updateExpense,
  listPendingProfilesForPicker, listProfiles, listSuppliers
} from '../lib/dataService'
import type {
  EventItem, Expense, ExpenseCategory, ExpenseStatus, PaymentMethodOption, PendingProfilePickerItem,
  Profile, Supplier
} from '../lib/types'
import { canAddExpense, canEditExpense, canReviewExpense, canViewFinancialSummary } from '../lib/permissions'
import { ArrowUpDown, Bookmark, Filter, LayoutGrid, List, Pencil, Plus, Search, Trash2, X } from 'lucide-react'
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

const selectClass = 'w-[calc(50%-0.375rem)] sm:w-auto rounded-xl border border-beetz-dark/15 text-sm px-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-beetz-yellow bg-white'

type SortField = 'date' | 'event' | 'status' | 'value'
type SortDir = 'asc' | 'desc'

export default function FinanceExpenses() {
  const { accessRole, userId } = useAuth()
  // A rota abre LEVE (só listas dos filtros/modais). As despesas descem no
  // Aplicar — recortadas por evento no banco e SEM os anexos base64 (16 MB
  // no select antigo). Anexo de UMA despesa vem na hora de editar.
  const [loading, setLoading] = useState(false)
  const [loaded, setLoaded] = useState(false)
  const [abrindoId, setAbrindoId] = useState<string | null>(null)
  // Paginação (vale pras duas visões).
  const [pageSize, setPageSize] = useState<50 | 200>(50)
  const [page, setPage] = useState(0)
  const [expenses, setExpenses] = useState<Expense[]>([])
  // Soma dos pagamentos parciais por despesa (view leve, sem comprovantes):
  // alimenta o chip "falta R$ X" de quem já começou a ser paga.
  const [payTotals, setPayTotals] = useState<{ expense_id: string; total_pago: number }[]>([])
  const [events, setEvents] = useState<EventItem[]>([])
  const [profiles, setProfiles] = useState<Profile[]>([])
  const [pendingProfiles, setPendingProfiles] = useState<PendingProfilePickerItem[]>([])
  const [suppliers, setSuppliers] = useState<Supplier[]>([])
  const [categories, setCategories] = useState<ExpenseCategory[]>([])
  const [paymentMethods, setPaymentMethods] = useState<PaymentMethodOption[]>([])

  const [searchFilter, setSearchFilter] = useState('')
  const [monthFilter, setMonthFilter] = useState('')
  const [producerFilter, setProducerFilter] = useState('')
  // VÁRIOS eventos de uma vez: CAMAROTE + PISTA do mesmo dia dividem
  // despesas em comum — filtra os dois juntos e quita com um comprovante.
  const [eventFilter, setEventFilter] = useState<string[]>([])
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

  // ---------- Filtros salvos ----------
  // localStorage por navegador: filtro salvo é atalho pessoal de trabalho
  // ("Pendentes da Vaquejada"), não configuração da empresa — não precisa de
  // tabela nem de sincronizar entre aparelhos.
  interface FilterPreset {
    name: string
    search: string
    month: string
    producer: string
    // Antigamente 1 evento (string); agora vários. Presets salvos no formato
    // velho continuam abrindo — a leitura normaliza pra lista.
    event: string | string[]
    status: string
  }
  const PRESETS_KEY = 'beetz-finance-filter-presets'
  const [presets, setPresets] = useState<FilterPreset[]>(readPresets())
  function readPresets(): FilterPreset[] {
    try { return JSON.parse(localStorage.getItem(PRESETS_KEY) ?? '[]') } catch { return [] }
  }
  const [presetName, setPresetName] = useState('')
  const [savingPreset, setSavingPreset] = useState(false)

  function persistPresets(next: FilterPreset[]) {
    setPresets(next)
    try { localStorage.setItem(PRESETS_KEY, JSON.stringify(next)) } catch { /* modo privado: paciência */ }
  }

  

  function savePreset() {
    const name = presetName.trim()
    if (!name || !hasFilters) return
    // Mesmo nome = sobrescreve: é o comportamento que quem salva de novo espera.
    const next = [
      ...presets.filter((f) => f.name !== name),
      { name, search: searchFilter, month: monthFilter, producer: producerFilter, event: eventFilter, status: statusFilter }
    ]
    persistPresets(next)
    setPresetName('')
    setSavingPreset(false)
  }

  function applyPreset(f: FilterPreset) {
    setSearchFilter(f.search); setMonthFilter(f.month); setProducerFilter(f.producer)
    setEventFilter(Array.isArray(f.event) ? f.event : f.event ? [f.event] : [])
    setStatusFilter(f.status)
  }

  function removePreset(name: string) {
    persistPresets(presets.filter((f) => f.name !== name))
  }

  function clearFilters() {
    setSearchFilter(''); setMonthFilter(''); setProducerFilter(''); setEventFilter([]); setStatusFilter('')
  }

  // ---- Quitação em lote com UM comprovante, CRUZANDO eventos: o mesmo
  // fluxo da aba do evento, aqui na macro. Cada selecionada em aberto
  // recebe o pagamento do restante com a mesma imagem; o trigger quita e o
  // meio vira Repasse quando estava vazio. Falha não desfaz as que entraram.
  const [quitandoLote, setQuitandoLote] = useState(false)
  function hojePagISO() {
    const d = new Date()
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
  }
  function encolherComprovante(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
      const url = URL.createObjectURL(file)
      const img = new Image()
      img.onload = () => {
        const max = 1200
        const escala = Math.min(1, max / Math.max(img.width, img.height))
        const c = document.createElement('canvas')
        c.width = Math.round(img.width * escala)
        c.height = Math.round(img.height * escala)
        c.getContext('2d')?.drawImage(img, 0, 0, c.width, c.height)
        URL.revokeObjectURL(url)
        resolve(c.toDataURL('image/jpeg', 0.8))
      }
      img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('Não consegui ler a imagem.')) }
      img.src = url
    })
  }
  async function handleBulkQuitar(file: File) {
    const quitavel = (e2: Expense) => e2.status !== 'Pago' && e2.status !== 'Cancelado' && e2.status !== 'Rejeitado'
    const alvos = expenses.filter((e2) => selected.has(e2.id) && quitavel(e2) && (e2.total - (pagoPorDespesa.get(e2.id) ?? 0)) > 0.009)
    if (alvos.length === 0) { window.alert('Nenhuma das selecionadas está em aberto pra quitar.'); return }
    const eventosDosAlvos = new Set(alvos.map((e2) => e2.event_id).filter(Boolean))
    const totalRestante = alvos.reduce((s, e2) => s + Math.max(0, e2.total - (pagoPorDespesa.get(e2.id) ?? 0)), 0)
    const puladas = selected.size - alvos.length
    if (!window.confirm(
      `Quitar ${alvos.length} despesa${alvos.length > 1 ? 's' : ''} de ${eventosDosAlvos.size} evento${eventosDosAlvos.size > 1 ? 's' : ''} (${currency(totalRestante)} no total) com ESTE comprovante? Ele fica anexado em cada uma.${puladas > 0 ? ` ${puladas} já resolvida${puladas > 1 ? 's' : ''} fica${puladas > 1 ? 'm' : ''} de fora.` : ''}`
    )) return
    setQuitandoLote(true)
    try {
      const img = await encolherComprovante(file)
      const falhas: string[] = []
      for (const e2 of alvos) {
        const restante = Math.round((e2.total - (pagoPorDespesa.get(e2.id) ?? 0)) * 100) / 100
        try {
          // Meio Repasse quando estava vazio — nunca sobrescreve o que existe.
          if (!e2.payment_method) await updateExpense(e2.id, { payment_method: 'Repasse' })
          await addExpensePayment({
            expense_id: e2.id,
            amount: restante,
            paid_at: hojePagISO(),
            receipt_data: img,
            notes: `Comprovante único — quitação em lote de ${alvos.length} despesa${alvos.length > 1 ? 's' : ''} (${eventosDosAlvos.size} evento${eventosDosAlvos.size > 1 ? 's' : ''})`,
            created_by: userId ?? null
          })
        } catch {
          falhas.push(e2.description || e2.category || 'despesa')
        }
      }
      if (falhas.length > 0) window.alert(`Não consegui quitar: ${falhas.join('; ')} — o resto entrou.`)
      clearSelection()
      await load()
    } catch (err) {
      window.alert(err instanceof Error ? err.message : 'Não deu pra ler o comprovante.')
    } finally {
      setQuitandoLote(false)
    }
  }

  // Mount: só o que os FILTROS e os modais precisam pra existir — leve.
  useEffect(() => {
    Promise.all([
      listEvents().catch(() => [] as EventItem[]),
      listExpenseCategories().catch(() => [] as ExpenseCategory[]),
      listPaymentMethods().catch(() => [] as PaymentMethodOption[])
    ]).then(([evs, cats, methods]) => {
      setEvents(evs)
      setCategories(cats)
      setPaymentMethods(methods)
    })
  }, [])

  async function load() {
    setLoading(true)
    try {
      const [exp, profs, pend, sups, pagos] = await Promise.all([
        // Recortada por evento JÁ NO BANCO (nenhum marcado = todos), magra.
        listAllExpenses(eventFilter),
        listProfiles(), listPendingProfilesForPicker(), listSuppliers(),
        // Se a view falhar, a página vive sem os chips — nunca derruba a lista.
        listExpensePaymentTotals().catch(() => [])
      ])
      setExpenses(exp)
      setPayTotals(pagos)
      setProfiles(profs)
      setPendingProfiles(pend)
      setSuppliers(sups)
      setLoaded(true)
      setPage(0)
    } finally {
      setLoading(false)
    }
  }

  const pagoPorDespesa = useMemo(() => new Map(payTotals.map((t) => [t.expense_id, t.total_pago])), [payTotals])
  // Chip de pagamento parcial: só aparece quando a despesa já recebeu algum
  // pagamento e ainda não está Paga — "falta R$ X" direto na lista.
  const chipParcial = (e2: { id: string; status: ExpenseStatus; total: number }) => {
    const pago = pagoPorDespesa.get(e2.id) ?? 0
    if (pago <= 0 || e2.status === 'Pago') return null
    return (
      <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full shrink-0 bg-amber-100 text-amber-700" title={`Já pago: ${currency(pago)}`}>
        falta {currency(Math.max(0, e2.total - pago))}
      </span>
    )
  }

  // Pagamento sem fricção, igual à aba Despesas do evento: chave Pix,
  // favorecido, nome do colaborador e valor — tudo copiável do card.
  const [copiadoKey, setCopiadoKey] = useState<string | null>(null)
  async function copiarTexto(key: string, texto: string) {
    try {
      await navigator.clipboard.writeText(texto)
      setCopiadoKey(key)
      setTimeout(() => setCopiadoKey((cur) => (cur === key ? null : cur)), 2000)
    } catch {
      window.alert(texto)
    }
  }
  function pagarInfo(exp: Expense): { rotulo: string; chave: string | null; tipo: string | null; favorecido: string | null; colaborador: string | null } | null {
    if (exp.supplier_id) {
      const s = suppliers.find((x) => x.id === exp.supplier_id)
      if (!s) return null
      return { rotulo: 'Pix do fornecedor', chave: s.pix_key ?? null, tipo: s.pix_key_type ?? null, favorecido: s.pix_key ? s.name : null, colaborador: null }
    }
    if (exp.team_member_id) {
      const p = profiles.find((x) => x.id === exp.team_member_id)
      if (!p) return null
      const nome = `${p.first_name ?? ''} ${p.last_name ?? ''}`.trim() || null
      return { rotulo: 'Pix do colaborador', chave: p.pix_key ?? null, tipo: p.pix_key_type ?? null, favorecido: p.pix_owner_name ?? null, colaborador: nome }
    }
    if (exp.pending_team_member_id) {
      const z = pendingProfiles.find((x) => x.id === exp.pending_team_member_id)
      const nome = z ? `${z.first_name ?? ''} ${z.last_name ?? ''}`.trim() || null : null
      return nome ? { rotulo: 'Colaborador (pré-cadastro)', chave: null, tipo: null, favorecido: null, colaborador: nome } : null
    }
    return null
  }

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
    const q = searchFilter.trim().toLowerCase()
    const list = expenses.filter((exp) => {
      const event = exp.event_id ? eventsById.get(exp.event_id) : undefined
      // BUG CORRIGIDO: `if (!event) return false` escondia toda despesa da
      // EMPRESA (sem evento) — a página fingia que elas não existiam. Agora:
      // sem evento, o mês usa a data de lançamento; filtros de produtor/evento
      // naturalmente a excluem (ela não pertence a nenhum).
      const refDate = event?.event_date ?? exp.created_at.slice(0, 10)
      if (monthFilter && refDate.slice(0, 7) !== monthFilter) return false
      if (producerFilter && event?.producer_name !== producerFilter) return false
      if (eventFilter.length > 0 && (!event || !eventFilter.includes(event.id))) return false
      if (statusFilter && exp.status !== statusFilter) return false
      if (q) {
        const supplier = exp.supplier_id ? suppliers.find((sp) => sp.id === exp.supplier_id) : null
        const person = exp.team_member_id
          ? profiles.find((pr) => pr.id === exp.team_member_id)
          : null
        const pend = exp.pending_team_member_id
          ? pendingProfiles.find((pp) => pp.id === exp.pending_team_member_id)
          : null
        const haystack = [
          exp.description, exp.category, event?.name ?? 'empresa beetz',
          supplier?.name,
          person ? `${person.first_name} ${person.last_name}` : '',
          pend ? `${pend.first_name ?? ''} ${pend.last_name ?? ''}` : ''
        ].filter(Boolean).join(' ').toLowerCase()
        if (!haystack.includes(q)) return false
      }
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
  }, [expenses, eventsById, searchFilter, monthFilter, producerFilter, eventFilter, statusFilter, sortField, sortDir, suppliers, profiles, pendingProfiles])

  const total = useMemo(() => filtered.reduce((sum, e) => sum + e.total, 0), [filtered])
  const hasFilters = !!(searchFilter || monthFilter || producerFilter || eventFilter.length > 0 || statusFilter)

  // Paginação: fatia o recorte pras duas visões. Totais, "Selecionar todas"
  // e ações em lote continuam sobre o recorte INTEIRO, não só a página.
  useEffect(() => { setPage(0) }, [searchFilter, monthFilter, producerFilter, statusFilter, pageSize, sortField, sortDir])
  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize))
  const pageClamped = Math.min(page, totalPages - 1)
  const paginated = useMemo(
    () => filtered.slice(pageClamped * pageSize, (pageClamped + 1) * pageSize),
    [filtered, pageClamped, pageSize]
  )

  // Editar busca os anexos pesados (comprovante/assinatura/repasse) SÓ da
  // despesa aberta — a lista vem sem eles. Sem essa busca, o salvar do modal
  // apagaria os anexos existentes.
  async function abrirEdicao(exp: Expense) {
    setAbrindoId(exp.id)
    try {
      const anexos = await getExpenseAttachments(exp.id).catch(() => ({ receipt_data: null, signature_data: null, repasse_data: null }))
      setEditingExpense({ ...exp, ...anexos })
    } finally {
      setAbrindoId(null)
    }
  }

  const selectedTotal = useMemo(
    () => filtered.filter((e) => selected.has(e.id)).reduce((sum, e) => sum + e.total, 0),
    [filtered, selected]
  )



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

  // Card de despesa pensado pro celular: valor e status na primeira linha,
  // detalhe truncável no meio, origem e ações na base — nada disputa espaço
  // com nada, em qualquer largura. A tabela usa este mesmo bloco em telas
  // pequenas, porque tabela de 8 colunas em celular é scroll infinito.
  const cardsList = (
    <div className="space-y-2">
      {paginated.map((exp) => {
        const event = eventsById.get(exp.event_id)
        const supplier = exp.supplier_id ? suppliers.find((s) => s.id === exp.supplier_id) : null
        const person = personName(exp)
        const isSelected = selected.has(exp.id)
        return (
          <div
            key={exp.id}
            className={`bg-white border rounded-xl p-4 transition-colors ${
              isSelected ? 'border-beetz-yellow ring-2 ring-beetz-yellow/40' : 'border-beetz-dark/5'
            } ${exp.status === 'Cancelado' ? 'opacity-50' : ''}`}
          >
            <div className="flex items-start gap-3">
              <input
                type="checkbox"
                checked={isSelected}
                onChange={() => toggleSelected(exp.id)}
                className="w-4 h-4 accent-beetz-yellow shrink-0 mt-1"
              />
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2 min-w-0">
                    <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full shrink-0 ${statusColors[exp.status]}`}>
                      {exp.status}
                    </span>
                    {chipParcial(exp)}
                    <p className="font-semibold text-sm truncate">{exp.category || 'Sem categoria'}</p>
                  </div>
                  <span className="flex items-center gap-1.5 shrink-0">
                    <span className="font-bold text-sm whitespace-nowrap">{currency(exp.total)}</span>
                    {/* Copia o valor A PAGAR (total com a taxa Dex, menos
                        parciais) no formato do app do banco: 610,90 */}
                    {exp.status !== 'Pago' && exp.status !== 'Cancelado' && exp.status !== 'Rejeitado' && (
                      <button
                        onClick={() => copiarTexto(`${exp.id}:valor`, Math.max(0, exp.total - (pagoPorDespesa.get(exp.id) ?? 0)).toFixed(2).replace('.', ','))}
                        title="Copiar o valor a pagar (já com a taxa Dex) pra colar no banco"
                        className={`text-xs leading-none p-1 rounded hover:bg-beetz-gray ${copiadoKey === `${exp.id}:valor` ? 'text-green-600' : 'text-beetz-dark/40'}`}
                      >
                        {copiadoKey === `${exp.id}:valor` ? '✓' : '📋'}
                      </button>
                    )}
                  </span>
                </div>

                {(exp.description || exp.payment_method || person || supplier) && (
                  <p className="text-xs text-beetz-dark/50 mt-1 line-clamp-2">
                    {exp.description || ''}{exp.payment_method ? ` · ${exp.payment_method}` : ''}
                    {person ? ` · Equipe: ${person}` : ''}
                    {supplier ? ` · Fornecedor: ${supplier.name}` : ''}
                  </p>
                )}

                {/* Chave, favorecido do Pix e nome do colaborador — cada um
                    com o seu copiar (favorecido e colaborador podem diferir). */}
                {(() => {
                  const info = pagarInfo(exp)
                  if (!info || exp.status === 'Pago' || exp.status === 'Cancelado' || exp.status === 'Rejeitado') return null
                  if (!info.chave && !info.favorecido && !info.colaborador) return null
                  const botao = (key: string, valor: string, rotulo = 'copiar') => (
                    <button
                      onClick={() => copiarTexto(key, valor)}
                      className={`font-bold underline shrink-0 ${copiadoKey === key ? 'text-green-600' : 'text-beetz-dark/50 hover:text-beetz-dark'}`}
                    >
                      {copiadoKey === key ? 'copiado ✓' : rotulo}
                    </button>
                  )
                  return (
                    <div className="flex flex-wrap items-center gap-x-2 gap-y-1 mt-1.5 text-[11px]">
                      {info.chave ? (
                        <>
                          <span className="text-beetz-dark/40 font-medium">🔑 {info.rotulo}:</span>
                          <code className="font-semibold bg-beetz-gray px-1.5 py-0.5 rounded break-all">{info.chave}</code>
                          {botao(`${exp.id}:chave`, info.chave)}
                          {info.tipo && <span className="text-beetz-dark/35">{info.tipo}</span>}
                        </>
                      ) : (
                        <span className="text-amber-600 font-medium">🔑 sem chave Pix cadastrada</span>
                      )}
                      {info.favorecido && (
                        <>
                          <span className="text-beetz-dark/50">· favorecido: {info.favorecido}</span>
                          {botao(`${exp.id}:fav`, info.favorecido)}
                        </>
                      )}
                      {info.colaborador && info.colaborador !== info.favorecido && (
                        <>
                          <span className="text-beetz-dark/50">· colaborador: {info.colaborador}</span>
                          {botao(`${exp.id}:colab`, info.colaborador)}
                        </>
                      )}
                    </div>
                  )
                })()}

                <div className="flex items-center justify-between gap-2 mt-2 flex-wrap">
                  <div className="min-w-0 text-xs text-beetz-dark/50">
                    {event ? (
                      <Link to={`/eventos/${event.id}`} className="font-semibold text-beetz-dark hover:text-beetz-yellow transition-colors">
                        {event.name}
                      </Link>
                    ) : exp.event_id ? (
                      <span className="text-beetz-dark/40">Evento removido</span>
                    ) : (
                      // Sem event_id = despesa da EMPRESA (aluguel, estoque...)
                      // — não é erro, é a categoria nova de gasto.
                      <span className="inline-flex items-center gap-1 text-[11px] font-bold bg-beetz-dark text-white px-2 py-0.5 rounded-full">
                        Beetz · empresa{exp.stock_movement_id ? ' · estoque' : ''}
                      </span>
                    )}
                    {event && (
                      <span> · {formatDate(event.event_date)}{event.producer_name ? ` · ${event.producer_name}` : ''}</span>
                    )}
                  </div>
                  {canEdit && (
                    <div className="flex items-center gap-1 shrink-0">
                      <button
                        onClick={() => abrirEdicao(exp)} disabled={abrindoId === exp.id}
                        className="text-beetz-dark/40 hover:text-beetz-dark p-2 rounded-lg hover:bg-beetz-gray"
                      >
                        <Pencil size={15} />
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
                          className="text-red-400 hover:text-red-600 p-2 rounded-lg hover:bg-red-50"
                        >
                          <Trash2 size={15} />
                        </button>
                      )}
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        )
      })}
    </div>
  )

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
          <div className="hidden sm:flex bg-white rounded-xl border border-beetz-dark/10 p-1">
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
          <div className="relative flex-1 min-w-[220px]">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-beetz-dark/30" />
            <input
              className="w-full border border-beetz-dark/15 rounded-xl pl-8 pr-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-beetz-yellow"
              placeholder="Buscar descrição, categoria, fornecedor, pessoa..."
              value={searchFilter} onChange={(e) => setSearchFilter(e.target.value)}
            />
          </div>
          <select value={monthFilter} onChange={(e) => setMonthFilter(e.target.value)} className={selectClass}>
            <option value="">Todos os meses</option>
            {months.map((m) => <option key={m} value={m}>{monthLabel(m)}</option>)}
          </select>
          <select
            value={producerFilter}
            onChange={(e) => { setProducerFilter(e.target.value); setEventFilter([]) }}
            className={selectClass}
          >
            <option value="">Todos os produtores</option>
            {producers.map((p) => <option key={p} value={p}>{p}</option>)}
          </select>
          {/* Acumulador: cada escolha vira um chip embaixo — dá pra somar
              CAMAROTE + PISTA do mesmo dia e enxergar as despesas em comum. */}
          <select
            value=""
            onChange={(e) => {
              const v = e.target.value
              if (v) setEventFilter((cur) => (cur.includes(v) ? cur : [...cur, v]))
            }}
            className={selectClass}
          >
            <option value="">
              {eventFilter.length > 0 ? `${eventFilter.length} evento${eventFilter.length > 1 ? 's' : ''} — somar outro...` : 'Todos os eventos'}
            </option>
            {eventOptions.filter((ev) => !eventFilter.includes(ev.id)).map((ev) => <option key={ev.id} value={ev.id}>{eventLabel(ev)}</option>)}
          </select>
          <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className={selectClass}>
            <option value="">Todos os status</option>
            {Object.keys(statusColors).map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
          {eventFilter.length > 0 && (
            <div className="w-full flex flex-wrap gap-1.5">
              {eventFilter.map((id) => (
                <span key={id} className="inline-flex items-center gap-1.5 text-xs font-semibold bg-beetz-yellow/25 border border-beetz-yellow/60 text-beetz-dark px-2.5 py-1 rounded-full">
                  {eventsById.get(id)?.name ?? 'Evento'}
                  <button
                    onClick={() => setEventFilter((cur) => cur.filter((x) => x !== id))}
                    className="text-beetz-dark/50 hover:text-beetz-dark"
                    title="Tirar este evento do filtro"
                  >
                    <X size={12} />
                  </button>
                </span>
              ))}
            </div>
          )}
          {/* Nada carrega sozinho: o Aplicar é quem busca — recortado por
              evento no banco e sem os anexos pesados. */}
          <button
            onClick={load}
            disabled={loading}
            className="w-full sm:w-auto honey-gradient text-beetz-dark font-bold px-6 py-2.5 rounded-xl text-sm disabled:opacity-60 active:scale-[0.99] transition-transform"
          >
            {loading ? 'Carregando...' : loaded ? '🔎 Aplicar filtro' : '🔎 Aplicar e carregar'}
          </button>
          {hasFilters && (
            <button
              onClick={clearFilters}
              className="flex items-center gap-1 text-sm text-beetz-dark/50 hover:text-beetz-dark px-2 py-2"
            >
              <X size={14} /> Limpar
            </button>
          )}
        </div>

        {/* Filtros salvos: atalhos pessoais deste navegador. Salvar de novo com
            o mesmo nome sobrescreve. */}
        {(presets.length > 0 || hasFilters) && (
          <div className="flex flex-wrap items-center gap-2 mt-3 pt-3 border-t border-beetz-dark/5">
            <Bookmark size={14} className="text-beetz-dark/30" />
            {presets.map((f) => (
              <span key={f.name} className="inline-flex items-center rounded-full bg-beetz-gray hover:bg-beetz-yellow/30 transition-colors">
                <button onClick={() => applyPreset(f)} className="text-xs font-semibold px-3 py-1.5" title="Aplicar este filtro">
                  {f.name}
                </button>
                <button onClick={() => removePreset(f.name)} className="pr-2 text-beetz-dark/30 hover:text-red-600" title="Excluir filtro salvo">
                  <X size={11} />
                </button>
              </span>
            ))}
            {hasFilters && !savingPreset && (
              <button
                onClick={() => setSavingPreset(true)}
                className="text-xs font-semibold text-beetz-dark/50 hover:text-beetz-dark border border-dashed border-beetz-dark/20 rounded-full px-3 py-1.5"
              >
                + Salvar filtro atual
              </button>
            )}
            {savingPreset && (
              <span className="inline-flex items-center gap-1">
                <input
                  autoFocus
                  className="border border-beetz-dark/15 rounded-full px-3 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-beetz-yellow w-44"
                  placeholder="Nome (ex: Pendentes do mês)"
                  value={presetName}
                  onChange={(e) => setPresetName(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') savePreset(); if (e.key === 'Escape') setSavingPreset(false) }}
                />
                <button onClick={savePreset} disabled={!presetName.trim()}
                  className="bg-beetz-dark text-white text-xs font-semibold px-3 py-1.5 rounded-full disabled:opacity-40">
                  Salvar
                </button>
              </span>
            )}
          </div>
        )}
      </div>

      {loading ? (
        <p className="text-beetz-dark/50 text-sm">Carregando despesas...</p>
      ) : !loaded ? (
        <div className="bg-white rounded-2xl p-10 shadow-soft border border-beetz-dark/5 text-center">
          <p className="text-4xl mb-3">🔎</p>
          <p className="font-bold">Escolha o recorte e toque em Aplicar</p>
          <p className="text-sm text-beetz-dark/50 mt-1 max-w-md mx-auto">
            A tela não baixa mais tudo sozinha — marque um ou mais eventos (ou nenhum, pra ver todos) e aplique o filtro.
          </p>
        </div>
      ) : (
        <>
          <div className="flex flex-wrap items-center justify-between gap-3 bg-beetz-dark text-white rounded-2xl p-5">
            <div>
              <p className="text-white/60 text-xs uppercase tracking-wide font-semibold">Total no filtro aplicado</p>
              <p className="text-2xl font-extrabold">{currency(total)}</p>
            </div>
            <div className="flex items-center gap-3">
              <p className="text-white/60 text-sm">{filtered.length} despesa(s)</p>
              {/* Seleciona TUDO que o filtro mostra (e a barra de seleção
                  assume: somar, quitar com 1 comprovante...). Se já está
                  tudo marcado, o mesmo botão desmarca. */}
              {filtered.length > 0 && (() => {
                const todasMarcadas = filtered.every((e2) => selected.has(e2.id))
                return (
                  <button
                    onClick={() => setSelected(todasMarcadas
                      ? new Set()
                      : new Set(filtered.map((e2) => e2.id)))}
                    className="text-xs font-bold bg-white/10 hover:bg-white/20 px-3.5 py-2 rounded-xl transition-colors"
                  >
                    {todasMarcadas ? 'Desmarcar todas' : `✓ Selecionar todas (${filtered.length})`}
                  </button>
                )
              })()}
            </div>
          </div>

          {filtered.length === 0 ? (
            <div className="bg-white rounded-2xl p-8 shadow-soft border border-beetz-dark/5 text-center text-beetz-dark/50 text-sm">
              Nenhuma despesa encontrada com esses filtros.
            </div>
          ) : viewMode === 'cards' ? (
            cardsList
          ) : (
            <>
            {/* Tabela real só onde cabe; no celular os cards assumem. */}
            <div className="sm:hidden">{cardsList}</div>
            <div className="hidden sm:block bg-white rounded-2xl shadow-soft border border-beetz-dark/5 overflow-x-auto">
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
                  {paginated.map((exp) => {
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
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <span className={`text-xs font-semibold px-2 py-1 rounded-full ${statusColors[exp.status]}`}>{exp.status}</span>
                            {chipParcial(exp)}
                          </div>
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
                              <button onClick={() => abrirEdicao(exp)} disabled={abrindoId === exp.id} className="text-beetz-dark/40 hover:text-beetz-dark p-1.5 rounded-lg hover:bg-beetz-gray">
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
            </>
          )}

          {/* Paginação (vale pra cards e tabela): 50 ou 200 por página. */}
          {filtered.length > 0 && (
            <div className="flex flex-wrap items-center justify-between gap-2 bg-white rounded-2xl px-4 py-3 shadow-soft border border-beetz-dark/5">
              <p className="text-xs text-beetz-dark/50">
                {pageClamped * pageSize + 1}–{Math.min((pageClamped + 1) * pageSize, filtered.length)} de {filtered.length}
              </p>
              <div className="flex items-center gap-2">
                <select
                  value={pageSize}
                  onChange={(e) => setPageSize(Number(e.target.value) as 50 | 200)}
                  className="rounded-lg border border-beetz-dark/15 text-xs px-2 py-1.5 bg-white"
                >
                  <option value={50}>50 por página</option>
                  <option value={200}>200 por página</option>
                </select>
                <button
                  onClick={() => setPage((p) => Math.max(0, p - 1))}
                  disabled={pageClamped === 0}
                  className="text-sm font-bold px-3 py-1.5 rounded-lg border border-beetz-dark/12 bg-white disabled:opacity-40"
                >
                  ‹
                </button>
                <span className="text-xs font-semibold text-beetz-dark/60">{pageClamped + 1} / {totalPages}</span>
                <button
                  onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
                  disabled={pageClamped >= totalPages - 1}
                  className="text-sm font-bold px-3 py-1.5 rounded-lg border border-beetz-dark/12 bg-white disabled:opacity-40"
                >
                  ›
                </button>
              </div>
            </div>
          )}
        </>
      )}

      {selected.size > 0 && (
        <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-40 bg-beetz-dark text-white rounded-2xl shadow-glow px-5 py-3 flex flex-wrap items-center justify-center gap-x-4 gap-y-2 max-w-[calc(100vw-2rem)]">
          <span className="text-sm">{selected.size} selecionada(s)</span>
          <span className="font-extrabold text-beetz-yellow">{currency(selectedTotal)}</span>
          {/* Um comprovante só pra despesas de VÁRIOS eventos: cada
              selecionada em aberto recebe o pagamento do restante com a
              mesma imagem — e quita. */}
          {canReviewExpense(accessRole) && (
            <label className={`cursor-pointer bg-white/10 hover:bg-white/20 font-bold px-3.5 py-2 rounded-xl text-xs transition-colors ${quitandoLote ? 'opacity-50 pointer-events-none' : ''}`}>
              {quitandoLote ? 'Quitando...' : '💸 Quitar com 1 comprovante'}
              <input
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ''; if (f) handleBulkQuitar(f) }}
              />
            </label>
          )}
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
