import { useEffect, useMemo, useState } from 'react'
import { useAuth } from '../../contexts/AuthContext'
import {
  deleteExpense,
  createExpense, createSupplier, listEventMembers, listExpenseCategories, listExpensesForEvent,
  listPaymentMethods, listPendingProfilesForPicker, listProfiles, listSuppliers, updateExpense,
  updateExpenseStatus
} from '../../lib/dataService'
import type {
  Expense, ExpenseCategory, ExpenseStatus, PaymentMethod, PaymentMethodOption, PendingProfilePickerItem,
  Profile, Supplier
} from '../../lib/types'
import { canEditExpense, canReviewExpense } from '../../lib/permissions'
import FileField from '../../components/ui/FileField'
import SignaturePad from '../../components/ui/SignaturePad'
import { Check, Filter, Pencil, Plus, Trash2, X } from 'lucide-react'

const statuses: ExpenseStatus[] = ['Pendente', 'Aprovado', 'Pago', 'Rejeitado', 'Cancelado']

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

const inputClass = 'w-full border border-beetz-dark/15 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-beetz-yellow'

export default function ExpensesTab({ eventId }: { eventId: string }) {
  const { userId, accessRole } = useAuth()
  const [expenses, setExpenses] = useState<Expense[]>([])
  const [categories, setCategories] = useState<ExpenseCategory[]>([])
  const [paymentMethods, setPaymentMethods] = useState<PaymentMethodOption[]>([])
  const [teamMembers, setTeamMembers] = useState<Profile[]>([])
  const [pendingProfiles, setPendingProfiles] = useState<PendingProfilePickerItem[]>([])
  const [suppliers, setSuppliers] = useState<Supplier[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [detail, setDetail] = useState<Expense | null>(null)
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null)
  const [deletingId, setDeletingId] = useState<string | null>(null)

  // Apagar é privilégio da Diretoria (a RLS do banco também barra) — os
  // demais seguem com o cancelamento via status.
  const canDelete = accessRole === 'diretoria'

  async function handleDeleteExpense(id: string) {
    setDeletingId(id)
    try {
      await deleteExpense(id)
      setConfirmDeleteId(null)
      setDetail(null)
      await load()
    } catch (err) {
      window.alert(err instanceof Error ? err.message : 'Não foi possível excluir (pode ser falta de permissão).')
    } finally {
      setDeletingId(null)
    }
  }
  const [saving, setSaving] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)

  const [category, setCategory] = useState('')
  const [receiptData, setReceiptData] = useState<string | null>(null)
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod | ''>('')
  const [description, setDescription] = useState('')
  const [quantity, setQuantity] = useState(1)
  const [unitValue, setUnitValue] = useState(0)
  const [dexFee, setDexFee] = useState(0)
  const [signatureData, setSignatureData] = useState<string | null>(null)
  const [repasseData, setRepasseData] = useState<string | null>(null)
  const [teamMemberId, setTeamMemberId] = useState('')
  const [supplierId, setSupplierId] = useState('')
  const [newSupplierName, setNewSupplierName] = useState('')
  const [addingSupplier, setAddingSupplier] = useState(false)

  async function load() {
    setLoading(true)
    setExpenses(await listExpensesForEvent(eventId))
    setLoading(false)
  }

  async function loadFormOptions() {
    const [members, allProfiles, supplierList, pending] = await Promise.all([
      listEventMembers(eventId), listProfiles(), listSuppliers(), listPendingProfilesForPicker()
    ])
    const memberIds = new Set(members.map((m) => m.profile_id))
    setTeamMembers(allProfiles.filter((p) => memberIds.has(p.id)))
    setSuppliers(supplierList)
    // Pré-cadastro não passa por "membro do evento" (a pessoa nem tem conta
    // ainda pra ser adicionada como membro) — por isso mostramos todo mundo
    // que ainda não se cadastrou, não só quem está vinculado a este evento.
    setPendingProfiles(pending)
  }

  useEffect(() => { load() }, [eventId])
  useEffect(() => {
    listExpenseCategories().then(setCategories)
    listPaymentMethods().then(setPaymentMethods)
    loadFormOptions()
  }, [eventId])

  async function handleAddSupplier() {
    const name = newSupplierName.trim()
    if (!name) return
    setAddingSupplier(true)
    const created = await createSupplier({ name })
    setSuppliers((prev) => [...prev, created])
    setSupplierId(created.id)
    setNewSupplierName('')
    setAddingSupplier(false)
  }

  const total = expenses.filter((e) => e.status !== 'Cancelado').reduce((sum, e) => sum + e.total, 0)
  const formTotal = quantity * unitValue + dexFee

  // Sumário no padrão dos Recebimentos: pendente × pago, e o PAGO aberto por
  // meio de pagamento — cadê o dinheiro saindo, num olhar.
  const resumoDespesas = useMemo(() => {
    const vivas = expenses.filter((e) => e.status !== 'Cancelado')
    const pendentes = vivas.filter((e) => e.status === 'Pendente')
    const pagas = vivas.filter((e) => e.status === 'Pago')
    const porMeio = new Map<string, number>()
    for (const e of pagas) {
      const meio = e.payment_method?.trim() || 'Sem meio informado'
      porMeio.set(meio, (porMeio.get(meio) ?? 0) + e.total)
    }
    return {
      pendentesTotal: pendentes.reduce((s, e) => s + e.total, 0),
      pendentesN: pendentes.length,
      pagasTotal: pagas.reduce((s, e) => s + e.total, 0),
      pagasN: pagas.length,
      porMeio: Array.from(porMeio.entries()).sort((a, b) => b[1] - a[1])
    }
  }, [expenses])

  // ---------- Filtro avançado: os mesmos campos da criação viram filtros ----------
  const [showFilters, setShowFilters] = useState(false)
  const [fSearch, setFSearch] = useState('')
  const [fStatus, setFStatus] = useState('')
  const [fCategoria, setFCategoria] = useState('')
  const [fMeio, setFMeio] = useState('')
  const [fFornecedor, setFFornecedor] = useState('')
  const [fEquipe, setFEquipe] = useState('')
  const norm = (s: string) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
  const filteredExpenses = useMemo(() => expenses.filter((e) => {
    if (fStatus && e.status !== fStatus) return false
    if (fCategoria && (e.category ?? '') !== fCategoria) return false
    if (fMeio && (e.payment_method ?? '') !== fMeio) return false
    if (fFornecedor && e.supplier_id !== fFornecedor) return false
    if (fEquipe) {
      const [k, id] = fEquipe.split(':')
      if (k === 'p' && e.team_member_id !== id) return false
      if (k === 'z' && e.pending_team_member_id !== id) return false
    }
    if (fSearch.trim()) {
      const hay = norm(`${e.description ?? ''} ${e.category ?? ''} ${e.payment_method ?? ''}`)
      if (!hay.includes(norm(fSearch))) return false
    }
    return true
  }), [expenses, fSearch, fStatus, fCategoria, fMeio, fFornecedor, fEquipe])
  const filtersActive = !!(fSearch.trim() || fStatus || fCategoria || fMeio || fFornecedor || fEquipe)
  function clearFilters() {
    setFSearch(''); setFStatus(''); setFCategoria(''); setFMeio(''); setFFornecedor(''); setFEquipe('')
  }

  // ---------- Edição em massa (quem revisa despesa) ----------
  const canBulk = canReviewExpense(accessRole)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [bulkStatus, setBulkStatus] = useState('')
  const [bulkMeio, setBulkMeio] = useState('')
  const [bulkBusy, setBulkBusy] = useState(false)
  const selectedTotal = useMemo(
    () => expenses.filter((e) => selected.has(e.id)).reduce((s, e) => s + e.total, 0),
    [expenses, selected]
  )
  function toggleSelected(id: string) {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }
  const allFilteredSelected = filteredExpenses.length > 0 && filteredExpenses.every((e) => selected.has(e.id))
  function toggleSelectAll() {
    setSelected(allFilteredSelected ? new Set() : new Set(filteredExpenses.map((e) => e.id)))
  }
  async function applyBulk() {
    if (selected.size === 0 || (!bulkStatus && !bulkMeio)) return
    setBulkBusy(true)
    try {
      // Sequencial de propósito: cada uma confirmada no banco antes da próxima.
      for (const id of selected) {
        if (bulkStatus) await updateExpenseStatus(id, bulkStatus as ExpenseStatus)
        if (bulkMeio) await updateExpense(id, { payment_method: bulkMeio as PaymentMethod })
      }
      setSelected(new Set())
      setBulkStatus('')
      setBulkMeio('')
      await load()
    } catch (err) {
      window.alert(err instanceof Error ? err.message : 'Erro na edição em massa — as já aplicadas ficaram.')
      await load()
    } finally {
      setBulkBusy(false)
    }
  }

  function resetForm() {
    setCategory(''); setReceiptData(null); setPaymentMethod(''); setDescription('')
    setQuantity(1); setUnitValue(0); setDexFee(0); setSignatureData(null); setRepasseData(null)
    setTeamMemberId(''); setSupplierId(''); setEditingId(null)
  }

  function handleEdit(exp: Expense) {
    setEditingId(exp.id)
    setCategory(exp.category ?? '')
    setReceiptData(exp.receipt_data)
    setPaymentMethod(exp.payment_method ?? '')
    setDescription(exp.description ?? '')
    setQuantity(exp.quantity)
    setUnitValue(exp.unit_value)
    setDexFee(exp.dex_fee)
    setSignatureData(exp.signature_data)
    setRepasseData(exp.repasse_data)
    // teamMemberId guarda "p:<id>" (perfil de verdade) ou "z:<id>"
    // (pré-cadastro do Zoho) — ver seletor "Adicionar equipe" abaixo.
    setTeamMemberId(exp.team_member_id ? `p:${exp.team_member_id}` : exp.pending_team_member_id ? `z:${exp.pending_team_member_id}` : '')
    setSupplierId(exp.supplier_id ?? '')
    setShowForm(true)
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!userId) return
    setSaving(true)
    const [teamKind, teamId] = teamMemberId ? teamMemberId.split(':') : [null, null]
    const payload = {
      category: category || null,
      receipt_data: receiptData,
      payment_method: paymentMethod || null,
      description: description || null,
      quantity,
      unit_value: unitValue,
      dex_fee: dexFee,
      signature_data: signatureData,
      repasse_data: repasseData,
      team_member_id: teamKind === 'p' ? teamId : null,
      pending_team_member_id: teamKind === 'z' ? teamId : null,
      supplier_id: supplierId || null
    }
    if (editingId) {
      await updateExpense(editingId, payload)
    } else {
      await createExpense({ event_id: eventId, status: 'Pendente', created_by: userId, ...payload })
    }
    setSaving(false)
    resetForm()
    setShowForm(false)
    load()
  }

  async function handleStatusChange(id: string, status: ExpenseStatus) {
    await updateExpenseStatus(id, status)
    load()
  }

  return (
    <div className="space-y-5">
      {/* Sumário no padrão dos Recebimentos: total grande, pendente × pago,
          e o pago aberto por meio de pagamento. */}
      <div className="bg-beetz-dark text-white rounded-2xl p-4 md:p-5">
        <div className="flex items-start justify-between flex-wrap gap-3">
          <div>
            <p className="text-2xl font-extrabold leading-none">{loading ? '...' : currency(total)}</p>
            <p className="text-xs text-white/50 mt-1">
              {expenses.filter((e) => e.status !== 'Cancelado').length} despesa(s) do evento
            </p>
          </div>
          <button
            onClick={() => { if (showForm) resetForm(); setShowForm((v) => !v) }}
            className="flex items-center gap-1.5 text-sm font-bold honey-gradient text-beetz-dark px-3 py-2 rounded-xl"
          >
            <Plus size={16} /> Nova despesa
          </button>
        </div>
        {!loading && (
          <div className="flex flex-wrap gap-2 mt-3">
            <span className="text-[11px] font-semibold bg-beetz-yellow/20 text-beetz-yellow px-2.5 py-1.5 rounded-full">
              Pendentes {currency(resumoDespesas.pendentesTotal)} <span className="opacity-60">({resumoDespesas.pendentesN})</span>
            </span>
            <span className="text-[11px] font-semibold bg-green-500/15 text-green-300 px-2.5 py-1.5 rounded-full">
              Pagas {currency(resumoDespesas.pagasTotal)} <span className="opacity-60">({resumoDespesas.pagasN})</span>
            </span>
            {resumoDespesas.porMeio.map(([meio, valor]) => (
              <span key={meio} className="text-[11px] font-semibold bg-white/10 px-2.5 py-1.5 rounded-full">
                {meio} {currency(valor)}
              </span>
            ))}
          </div>
        )}
      </div>

      {/* Filtro avançado: os mesmos campos da criação, agora como filtros. */}
      <div className="bg-white rounded-2xl p-4 shadow-soft border border-beetz-dark/5 space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <input
            className={`${inputClass} flex-1 min-w-[160px]`}
            placeholder="Buscar por descrição, categoria, meio..."
            value={fSearch}
            onChange={(e) => setFSearch(e.target.value)}
          />
          <button
            onClick={() => setShowFilters((v) => !v)}
            className={`flex items-center gap-1.5 text-sm font-semibold px-3 py-2.5 rounded-xl border transition-colors ${
              showFilters || filtersActive ? 'bg-beetz-dark text-white border-beetz-dark' : 'border-beetz-dark/15 text-beetz-dark/60'
            }`}
          >
            <Filter size={14} /> Filtros
          </button>
          {canBulk && filteredExpenses.length > 0 && (
            <button
              onClick={toggleSelectAll}
              className="flex items-center gap-1.5 text-sm font-semibold px-3 py-2.5 rounded-xl border border-beetz-dark/15 text-beetz-dark/60 hover:bg-beetz-gray"
            >
              <Check size={14} /> {allFilteredSelected ? 'Desmarcar todas' : 'Selecionar todas'}
            </button>
          )}
        </div>
        {showFilters && (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2">
            <select className={inputClass} value={fStatus} onChange={(e) => setFStatus(e.target.value)}>
              <option value="">Todos os status</option>
              {statuses.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
            <select className={inputClass} value={fCategoria} onChange={(e) => setFCategoria(e.target.value)}>
              <option value="">Todas as categorias</option>
              {categories.map((c) => <option key={c.id} value={c.name}>{c.name}</option>)}
            </select>
            <select className={inputClass} value={fMeio} onChange={(e) => setFMeio(e.target.value)}>
              <option value="">Todos os meios</option>
              {paymentMethods.map((p) => <option key={p.id} value={p.name}>{p.name}</option>)}
            </select>
            <select className={inputClass} value={fFornecedor} onChange={(e) => setFFornecedor(e.target.value)}>
              <option value="">Todos os fornecedores</option>
              {suppliers.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
            <select className={inputClass} value={fEquipe} onChange={(e) => setFEquipe(e.target.value)}>
              <option value="">Toda a equipe</option>
              {teamMembers.map((m) => <option key={m.id} value={`p:${m.id}`}>{m.first_name} {m.last_name}</option>)}
              {pendingProfiles.map((m) => <option key={m.id} value={`z:${m.id}`}>{m.first_name} {m.last_name} (pré)</option>)}
            </select>
          </div>
        )}
        {filtersActive && (
          <p className="text-xs text-beetz-dark/50">
            Mostrando {filteredExpenses.length} de {expenses.length} ·{' '}
            <button onClick={clearFilters} className="font-semibold underline">Limpar filtros</button>
          </p>
        )}
      </div>

      {/* Criação renderiza inline; EDIÇÃO abre o MESMO form em modal por cima
          da lista — editar não obriga mais a viajar até o topo da tela. */}
      {showForm && (
        <div
          className={editingId ? 'fixed inset-0 z-50 bg-black/40 flex items-end sm:items-center justify-center p-0 sm:p-6' : ''}
          onClick={editingId ? () => { resetForm(); setShowForm(false) } : undefined}
        >
        <div
          className={editingId ? 'w-full sm:max-w-lg max-h-[90vh] overflow-y-auto rounded-t-3xl sm:rounded-3xl' : ''}
          onClick={editingId ? (e) => e.stopPropagation() : undefined}
        >
        <form onSubmit={handleSubmit} className="bg-beetz-gray rounded-2xl p-5 space-y-4">
          <div className="grid sm:grid-cols-2 gap-4">
            <div>
              <label className="text-sm font-medium block mb-1">Categoria</label>
              <select className={inputClass} value={category} onChange={(e) => setCategory(e.target.value)}>
                <option value="">Selecionar...</option>
                {categories.map((c) => <option key={c.id} value={c.name}>{c.name}</option>)}
              </select>
            </div>
            <div>
              <label className="text-sm font-medium block mb-1">Forma de pagamento</label>
              <select className={inputClass} value={paymentMethod} onChange={(e) => setPaymentMethod(e.target.value as PaymentMethod)}>
                <option value="">Selecionar...</option>
                {paymentMethods.map((p) => <option key={p.id} value={p.name}>{p.name}</option>)}
              </select>
            </div>
          </div>

          <div className="grid sm:grid-cols-2 gap-4">
            <div>
              <label className="text-sm font-medium block mb-1">Adicionar equipe</label>
              <select className={inputClass} value={teamMemberId} onChange={(e) => setTeamMemberId(e.target.value)}>
                <option value="">Nenhum</option>
                {teamMembers.length > 0 && (
                  <optgroup label="Equipe cadastrada">
                    {teamMembers.map((m) => <option key={m.id} value={`p:${m.id}`}>{m.first_name} {m.last_name}</option>)}
                  </optgroup>
                )}
                {pendingProfiles.length > 0 && (
                  <optgroup label="Pré-cadastro (ainda não se cadastrou)">
                    {pendingProfiles.map((m) => (
                      <option key={m.id} value={`z:${m.id}`}>{m.first_name} {m.last_name}</option>
                    ))}
                  </optgroup>
                )}
              </select>
            </div>
            <div>
              <label className="text-sm font-medium block mb-1">Adicionar fornecedor</label>
              <select className={inputClass} value={supplierId} onChange={(e) => setSupplierId(e.target.value)}>
                <option value="">Nenhum</option>
                {suppliers.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
              <div className="flex gap-2 mt-1.5">
                <input
                  className="flex-1 border border-beetz-dark/15 rounded-lg px-2.5 py-1.5 text-xs"
                  placeholder="Novo fornecedor..."
                  value={newSupplierName}
                  onChange={(e) => setNewSupplierName(e.target.value)}
                />
                <button
                  type="button" onClick={handleAddSupplier} disabled={addingSupplier || !newSupplierName.trim()}
                  className="text-xs font-semibold bg-beetz-dark text-white px-2.5 rounded-lg disabled:opacity-40"
                >
                  +
                </button>
              </div>
            </div>
          </div>

          <FileField label="Comprovante" value={receiptData} onChange={setReceiptData} />

          <div>
            <label className="text-sm font-medium block mb-1">Descrição</label>
            <input className={inputClass} value={description} onChange={(e) => setDescription(e.target.value)} />
          </div>

          <div className="grid sm:grid-cols-3 gap-4">
            <div>
              <label className="text-sm font-medium block mb-1">Quantidade</label>
              <input type="number" min={0} step="1" className={inputClass} value={quantity} onChange={(e) => setQuantity(Number(e.target.value))} />
            </div>
            <div>
              <label className="text-sm font-medium block mb-1">Valor (R$)</label>
              <input type="number" min={0} step="0.01" className={inputClass} value={unitValue} onChange={(e) => setUnitValue(Number(e.target.value))} />
            </div>
            <div>
              <label className="text-sm font-medium block mb-1">Taxa Dex (R$)</label>
              <input type="number" min={0} step="0.01" className={inputClass} value={dexFee} onChange={(e) => setDexFee(Number(e.target.value))} />
            </div>
          </div>

          <div className="bg-white rounded-xl px-4 py-3 flex justify-between items-center">
            <span className="text-sm font-medium text-beetz-dark/60">Total</span>
            <span className="font-bold">{currency(formTotal)}</span>
          </div>

          <SignaturePad value={signatureData} onChange={setSignatureData} />
          <FileField label="Repasse (comprovante de devolução, se houver)" value={repasseData} onChange={setRepasseData} />

          <div className="flex justify-end gap-2 pt-1">
            <button type="button" onClick={() => { resetForm(); setShowForm(false) }} className="text-sm font-semibold text-beetz-dark/50 px-4 py-2">Cancelar</button>
            <button type="submit" disabled={saving} className="honey-gradient text-beetz-dark font-bold px-5 py-2 rounded-xl text-sm disabled:opacity-60">
              {saving ? 'Salvando...' : editingId ? 'Salvar alterações' : 'Salvar despesa'}
            </button>
          </div>
        </form>
        </div>
        </div>
      )}

      {!loading && (
        <div className="space-y-2">
          {/* Card em camadas: status + categoria + valor na primeira linha;
              o miolo é clicável e abre os detalhes completos (comprovante,
              assinatura, quantidade, taxa...); as ações vivem na base. */}
          {filteredExpenses.map((exp) => (
            <div key={exp.id} className={`bg-white border rounded-xl p-4 ${selected.has(exp.id) ? 'border-beetz-yellow ring-1 ring-beetz-yellow' : 'border-beetz-dark/5'} ${exp.status === 'Cancelado' ? 'opacity-50' : ''}`}>
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2 min-w-0">
                  {canBulk && (
                    <input
                      type="checkbox"
                      checked={selected.has(exp.id)}
                      onChange={() => toggleSelected(exp.id)}
                      className="w-4 h-4 accent-[#F5B301] shrink-0"
                      aria-label="Selecionar despesa"
                    />
                  )}
                  {/* Trocar o status (Pendente -> Aprovado -> Pago) é aprovar
                      dinheiro: exige a flag "Revisar status da despesa". Sem
                      ela, o status vira só leitura. */}
                  {canReviewExpense(accessRole) ? (
                    <select
                      value={exp.status}
                      onChange={(e) => handleStatusChange(exp.id, e.target.value as ExpenseStatus)}
                      className={`text-xs font-semibold px-2.5 py-1 rounded-full border-0 shrink-0 ${statusColors[exp.status]}`}
                    >
                      {statuses.map((s) => <option key={s} value={s}>{s}</option>)}
                    </select>
                  ) : (
                    <span className={`text-xs font-semibold px-2.5 py-1 rounded-full shrink-0 ${statusColors[exp.status]}`}>
                      {exp.status}
                    </span>
                  )}
                  <p className="font-semibold text-sm truncate">{exp.category || 'Sem categoria'}</p>
                </div>
                <span className="font-bold text-sm whitespace-nowrap">{currency(exp.total)}</span>
              </div>

              <button onClick={() => setDetail(exp)} className="w-full text-left mt-1">
                <p className="text-xs text-beetz-dark/50 line-clamp-2">
                  {exp.description || 'Sem descrição'}{exp.payment_method ? ` · ${exp.payment_method}` : ''}
                  {exp.team_member_id ? ` · Equipe: ${teamMembers.find((m) => m.id === exp.team_member_id)?.first_name ?? '—'}` : ''}
                  {exp.pending_team_member_id ? ` · Equipe: ${pendingProfiles.find((m) => m.id === exp.pending_team_member_id)?.first_name ?? '—'} (pré-cadastro)` : ''}
                  {exp.supplier_id ? ` · Fornecedor: ${suppliers.find((s) => s.id === exp.supplier_id)?.name ?? '—'}` : ''}
                </p>
              </button>

              <div className="flex items-center justify-between gap-2 mt-2">
                <button onClick={() => setDetail(exp)} className="text-xs font-semibold text-beetz-dark/45 hover:text-beetz-dark">
                  Ver detalhes
                </button>
                <div className="flex items-center gap-1">
                  {canDelete && (
                    confirmDeleteId === exp.id ? (
                      <span className="flex items-center gap-1">
                        <button
                          onClick={() => handleDeleteExpense(exp.id)}
                          disabled={deletingId === exp.id}
                          className="text-xs font-semibold bg-red-600 text-white px-2.5 py-1.5 rounded-lg hover:bg-red-700 disabled:opacity-60"
                        >
                          {deletingId === exp.id ? '...' : 'Confirmar exclusão'}
                        </button>
                        <button onClick={() => setConfirmDeleteId(null)} className="text-xs font-semibold text-beetz-dark/50 px-2 py-1.5">Voltar</button>
                      </span>
                    ) : (
                      <button
                        onClick={() => setConfirmDeleteId(exp.id)}
                        className="flex items-center gap-1 text-xs font-semibold text-red-500 hover:text-red-700 p-1.5 rounded-lg hover:bg-red-50"
                      >
                        <Trash2 size={13} /> Excluir
                      </button>
                    )
                  )}
                  {canEditExpense(accessRole) && (
                    <button onClick={() => handleEdit(exp)} className="flex items-center gap-1 text-xs font-semibold text-beetz-dark/45 hover:text-beetz-dark p-1.5 rounded-lg hover:bg-beetz-gray">
                      <Pencil size={13} /> Editar
                    </button>
                  )}
                </div>
              </div>
            </div>
          ))}
          {expenses.length === 0 && <p className="text-sm text-beetz-dark/50">Nenhuma despesa registrada ainda.</p>}
          {expenses.length > 0 && filteredExpenses.length === 0 && (
            <p className="text-sm text-beetz-dark/50">Nenhuma despesa passa nos filtros — <button onClick={clearFilters} className="font-semibold underline">limpar</button>.</p>
          )}
        </div>
      )}

      {/* Barra de edição em massa: cola no rodapé enquanto houver seleção.
          Aplica status e/ou meio de pagamento em todas de uma vez. */}
      {canBulk && selected.size > 0 && (
        <div className="fixed bottom-0 left-0 right-0 z-40 bg-beetz-dark text-white px-4 py-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))] shadow-2xl">
          <div className="max-w-4xl mx-auto flex flex-wrap items-center gap-2">
            <p className="text-sm font-bold flex-1 min-w-[140px]">
              {selected.size} selecionada{selected.size > 1 ? 's' : ''} · {currency(selectedTotal)}
            </p>
            <select
              value={bulkStatus}
              onChange={(e) => setBulkStatus(e.target.value)}
              className="rounded-xl border-0 bg-white/10 text-white text-sm px-3 py-2"
            >
              <option value="" className="text-beetz-dark">Status: manter</option>
              {statuses.map((s) => <option key={s} value={s} className="text-beetz-dark">{s}</option>)}
            </select>
            <select
              value={bulkMeio}
              onChange={(e) => setBulkMeio(e.target.value)}
              className="rounded-xl border-0 bg-white/10 text-white text-sm px-3 py-2"
            >
              <option value="" className="text-beetz-dark">Meio: manter</option>
              {paymentMethods.map((p) => <option key={p.id} value={p.name} className="text-beetz-dark">{p.name}</option>)}
            </select>
            <button
              onClick={applyBulk}
              disabled={bulkBusy || (!bulkStatus && !bulkMeio)}
              className="honey-gradient text-beetz-dark font-bold px-4 py-2 rounded-xl text-sm disabled:opacity-50"
            >
              {bulkBusy ? 'Aplicando...' : 'Aplicar'}
            </button>
            <button onClick={() => setSelected(new Set())} className="text-xs font-semibold text-white/60 px-2 py-2 hover:text-white">
              Limpar
            </button>
          </div>
        </div>
      )}

      {detail && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-end sm:items-center justify-center p-0 sm:p-6" onClick={() => setDetail(null)}>
          <div
            className="bg-white w-full sm:max-w-md rounded-t-3xl sm:rounded-3xl p-5 sm:p-6 max-h-[90vh] overflow-y-auto pb-[calc(1.25rem+env(safe-area-inset-bottom))]"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-3 mb-4">
              <div className="min-w-0">
                <span className={`text-xs font-semibold px-2.5 py-1 rounded-full ${statusColors[detail.status]}`}>{detail.status}</span>
                <p className="font-bold text-lg leading-tight mt-2">{detail.category || 'Sem categoria'}</p>
              </div>
              <button onClick={() => setDetail(null)} className="p-1.5 rounded-lg hover:bg-beetz-gray shrink-0" aria-label="Fechar">
                <X size={18} />
              </button>
            </div>

            <div className="space-y-2.5 text-sm">
              {detail.description && <p className="text-beetz-dark/70">{detail.description}</p>}
              <div className="grid grid-cols-2 gap-2.5">
                <div className="bg-beetz-gray rounded-xl px-3 py-2">
                  <p className="text-[11px] text-beetz-dark/45">Quantidade × valor</p>
                  <p className="font-semibold">{detail.quantity} × {currency(detail.unit_value)}</p>
                </div>
                <div className="bg-beetz-gray rounded-xl px-3 py-2">
                  <p className="text-[11px] text-beetz-dark/45">Taxa Dex</p>
                  <p className="font-semibold">{currency(detail.dex_fee)}</p>
                </div>
              </div>
              <div className="bg-beetz-dark text-white rounded-xl px-3 py-2.5 flex justify-between items-center">
                <span className="text-xs text-white/60">Total</span>
                <span className="font-extrabold">{currency(detail.total)}</span>
              </div>
              {detail.payment_method && <p className="text-xs text-beetz-dark/55">Pagamento: <span className="font-semibold text-beetz-dark">{detail.payment_method}</span></p>}
              {detail.team_member_id && (
                <p className="text-xs text-beetz-dark/55">Equipe: <span className="font-semibold text-beetz-dark">
                  {(() => { const m = teamMembers.find((x) => x.id === detail.team_member_id); return m ? `${m.first_name} ${m.last_name}` : '—' })()}
                </span></p>
              )}
              {detail.pending_team_member_id && (
                <p className="text-xs text-beetz-dark/55">Equipe: <span className="font-semibold text-beetz-dark">
                  {(() => { const m = pendingProfiles.find((x) => x.id === detail.pending_team_member_id); return m ? `${m.first_name} ${m.last_name} (pré-cadastro)` : '—' })()}
                </span></p>
              )}
              {detail.supplier_id && (
                <p className="text-xs text-beetz-dark/55">Fornecedor: <span className="font-semibold text-beetz-dark">
                  {suppliers.find((x) => x.id === detail.supplier_id)?.name ?? '—'}
                </span></p>
              )}
              {detail.receipt_data && (
                <div>
                  <p className="text-[11px] text-beetz-dark/45 mb-1">Comprovante</p>
                  {detail.receipt_data.startsWith('data:image') ? (
                    <img src={detail.receipt_data} alt="Comprovante" className="max-h-56 rounded-xl border border-beetz-dark/10" />
                  ) : (
                    <a href={detail.receipt_data} download="comprovante" className="text-xs font-semibold underline">Baixar comprovante</a>
                  )}
                </div>
              )}
              {detail.signature_data && (
                <div>
                  <p className="text-[11px] text-beetz-dark/45 mb-1">Assinatura</p>
                  <img src={detail.signature_data} alt="Assinatura" className="max-h-24 rounded-xl border border-beetz-dark/10 bg-white" />
                </div>
              )}
              {detail.repasse_data && (
                <div>
                  <p className="text-[11px] text-beetz-dark/45 mb-1">Repasse</p>
                  {detail.repasse_data.startsWith('data:image') ? (
                    <img src={detail.repasse_data} alt="Repasse" className="max-h-56 rounded-xl border border-beetz-dark/10" />
                  ) : (
                    <a href={detail.repasse_data} download="repasse" className="text-xs font-semibold underline">Baixar repasse</a>
                  )}
                </div>
              )}
            </div>

            {canEditExpense(accessRole) && (
              <div className="flex justify-end mt-5">
                <button
                  onClick={() => { const e = detail; setDetail(null); handleEdit(e) }}
                  className="flex items-center gap-1.5 honey-gradient text-beetz-dark font-bold px-5 py-2.5 rounded-xl text-sm"
                >
                  <Pencil size={14} /> Editar despesa
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
