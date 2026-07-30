import { useEffect, useMemo, useState } from 'react'
import { useAuth } from '../../contexts/AuthContext'
import {
  addExpensePayment, deleteExpense,
  createExpense, createSupplier, listEventMembers, listExpenseCategories, listExpensePaymentTotals, listExpensesForEvent,
  listPaymentMethods, listPendingProfilesForPicker, listProfilesLite, listProfilesPixLite, listSuppliers, updateExpense,
  updateExpenseStatus
} from '../../lib/dataService'
import type { ExpensePaymentTotal, ProfilePixLite } from '../../lib/dataService'
import type {
  Expense, ExpenseCategory, ExpenseStatus, PaymentMethod, PaymentMethodOption, PendingProfilePickerItem,
  Profile, Supplier
} from '../../lib/types'
import { canEditExpense, canReviewExpense } from '../../lib/permissions'
import FileField from '../../components/ui/FileField'
import SignaturePad from '../../components/ui/SignaturePad'
import EditExpenseModal from '../../components/finance/EditExpenseModal'
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

  // Somas dos pagamentos parciais (view leve): alimenta a barrinha de
  // progresso do card e o cálculo do "restante" da quitação por arrasto.
  const [payTotals, setPayTotals] = useState<ExpensePaymentTotal[]>([])
  const pagoPorDespesa = useMemo(() => new Map(payTotals.map((t) => [t.expense_id, t])), [payTotals])
  const pagoDe = (id: string) => pagoPorDespesa.get(id)?.total_pago ?? 0

  async function load() {
    setLoading(true)
    const [exps, pagos] = await Promise.all([
      listExpensesForEvent(eventId),
      // Sem os totais a lista vive igual — nunca derruba a aba.
      listExpensePaymentTotals().catch(() => [] as ExpensePaymentTotal[])
    ])
    setExpenses(exps)
    setPayTotals(pagos)
    setLoading(false)
  }

  // ---- Quitação por arrasto: solta o comprovante NO CARD, confirma, e o
  // pagamento do restante entra com a imagem anexada — o trigger do banco
  // marca Pago sozinho. Nada é sobrescrito: é sempre um pagamento NOVO.
  const [dragOverId, setDragOverId] = useState<string | null>(null)
  const [quitandoId, setQuitandoId] = useState<string | null>(null)

  // ---- Pix na lista: pra onde vai o dinheiro, sem abrir nada. Fornecedor
  // manda (a despesa é dele); sem fornecedor, vale a chave do colaborador.
  const [pixLite, setPixLite] = useState<Map<string, ProfilePixLite>>(new Map())
  const [pixCopiadoId, setPixCopiadoId] = useState<string | null>(null)
  function pixDaDespesa(exp: Expense): { rotulo: string; chave: string; tipo: string | null; titular: string | null } | null {
    if (exp.supplier_id) {
      const s = suppliers.find((x) => x.id === exp.supplier_id)
      return s?.pix_key ? { rotulo: 'Pix do fornecedor', chave: s.pix_key, tipo: s.pix_key_type ?? null, titular: s.name } : null
    }
    if (exp.team_member_id) {
      const p = pixLite.get(exp.team_member_id)
      if (p?.pix_key) return { rotulo: 'Pix do colaborador', chave: p.pix_key, tipo: p.pix_key_type ?? null, titular: p.pix_owner_name ?? null }
    }
    return null
  }
  // Copiadinho genérico: chave, nome do titular OU valor — a key composta
  // (despesa:campo) faz o "copiado ✓" acender só no botão certo.
  async function copiarTexto(key: string, texto: string) {
    try {
      await navigator.clipboard.writeText(texto)
      setPixCopiadoId(key)
      setTimeout(() => setPixCopiadoId((cur) => (cur === key ? null : cur)), 2000)
    } catch {
      window.alert(texto)
    }
  }

  // ---- Quitação em LOTE com UM comprovante: a pessoa fez um Pix só pras
  // 3 despesas do Felipe — seleciona as 3, sobe o comprovante, e ele entra
  // como pagamento do restante em CADA uma (a mesma imagem anexada em
  // todas). O trigger marca Pago uma a uma. Falha não desfaz as que já
  // entraram — meio caminho vale mais que recomeçar.
  async function handleBulkQuitar(file: File) {
    const alvos = filteredExpenses.filter((e2) => selected.has(e2.id) && podeQuitar(e2) && (e2.total - pagoDe(e2.id)) > 0.009)
    if (alvos.length === 0) { window.alert('Nenhuma das selecionadas está em aberto pra quitar.'); return }
    const totalRestante = alvos.reduce((s, e2) => s + Math.max(0, e2.total - pagoDe(e2.id)), 0)
    const puladas = selected.size - alvos.length
    if (!window.confirm(
      `Quitar ${alvos.length} despesa${alvos.length > 1 ? 's' : ''} (${currency(totalRestante)} no total) com ESTE comprovante? Ele fica anexado em cada uma.${puladas > 0 ? ` ${puladas} selecionada${puladas > 1 ? 's' : ''} já resolvida${puladas > 1 ? 's' : ''} fica${puladas > 1 ? 'm' : ''} de fora.` : ''}`
    )) return
    setBulkBusy(true)
    try {
      const img = await encolherComprovante(file)
      const falhas: string[] = []
      for (const e2 of alvos) {
        const restante = Math.round((e2.total - pagoDe(e2.id)) * 100) / 100
        try {
          // Meio Repasse quando estava vazio — nunca sobrescreve o que existe.
          if (!e2.payment_method) await updateExpense(e2.id, { payment_method: 'Repasse' })
          await addExpensePayment({
            expense_id: e2.id,
            amount: restante,
            paid_at: hojePagISO(),
            receipt_data: img,
            notes: `Comprovante único — quitação em lote de ${alvos.length} despesa${alvos.length > 1 ? 's' : ''}`,
            created_by: userId ?? null
          })
        } catch {
          falhas.push(e2.description || e2.category || 'despesa')
        }
      }
      if (falhas.length > 0) window.alert(`Não consegui quitar: ${falhas.join('; ')} — o resto entrou.`)
      setSelected(new Set())
      await load()
    } catch (err) {
      window.alert(err instanceof Error ? err.message : 'Não deu pra ler o comprovante.')
    } finally {
      setBulkBusy(false)
    }
  }
  const podeQuitar = (exp: Expense) =>
    canReviewExpense(accessRole) && exp.status !== 'Pago' && exp.status !== 'Cancelado' && exp.status !== 'Rejeitado'

  function hojePagISO() {
    const d = new Date()
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
  }

  // Encolhe a foto antes de guardar (1200px, jpeg) — comprovante de celular
  // vem com 5 MB e base64 gigante no banco é praga conhecida da casa.
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

  async function handleDropPagamento(exp: Expense, file: File) {
    const restante = Math.max(0, Math.round((exp.total - pagoDe(exp.id)) * 100) / 100)
    if (restante <= 0) { window.alert('Essa despesa já está quitada.'); return }
    const alvo = exp.description || exp.category || 'despesa'
    if (!window.confirm(`Registrar pagamento de ${currency(restante)} com este comprovante e quitar "${alvo}"?`)) return
    setQuitandoId(exp.id)
    try {
      const img = await encolherComprovante(file)
      // Quitação rápida = comprovante de transferência → o meio é Repasse.
      // Só preenche quando está VAZIO: meio já informado nunca é mexido
      // (senão o sumário mostra "Sem meio informado" pra dinheiro que
      // claramente saiu por repasse).
      if (!exp.payment_method) await updateExpense(exp.id, { payment_method: 'Repasse' })
      await addExpensePayment({
        expense_id: exp.id,
        amount: restante,
        paid_at: hojePagISO(),
        receipt_data: img,
        notes: 'Quitação rápida pela lista',
        created_by: userId ?? null
      })
      await load()
    } catch (err) {
      window.alert(err instanceof Error ? err.message : 'Não deu pra registrar o pagamento.')
    } finally {
      setQuitandoId(null)
    }
  }

  async function loadFormOptions() {
    const [members, allProfiles, supplierList, pending, pixes] = await Promise.all([
      listEventMembers(eventId), listProfilesLite(), listSuppliers(), listPendingProfilesForPicker(),
      // Chaves Pix dos perfis (4 campos, leve): cruzam com team_member_id
      // pra mostrar a chave direto no card. Falhou? Lista vive sem Pix.
      listProfilesPixLite().catch(() => [] as ProfilePixLite[])
    ])
    setPixLite(new Map(pixes.map((p) => [p.id, p])))
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

  // Editar usa o MODAL ÚNICO das despesas (o mesmo do /financeiro/despesas,
  // com status, anexos e a régua de Pagamentos) — aqui com o evento travado.
  // O formulário inline desta aba segue vivo só pra CRIAR despesa nova.
  const [editingExpense, setEditingExpense] = useState<Expense | null>(null)
  function handleEdit(exp: Expense) {
    setEditingExpense(exp)
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
            <div
              key={exp.id}
              className={`bg-white border rounded-xl p-4 transition-shadow ${
                dragOverId === exp.id
                  ? 'border-green-400 ring-2 ring-green-300'
                  : selected.has(exp.id) ? 'border-beetz-yellow ring-1 ring-beetz-yellow' : 'border-beetz-dark/5'
              } ${exp.status === 'Cancelado' ? 'opacity-50' : ''}`}
              onDragOver={(e) => { if (podeQuitar(exp)) { e.preventDefault(); setDragOverId(exp.id) } }}
              onDragLeave={() => setDragOverId((cur) => (cur === exp.id ? null : cur))}
              onDrop={(e) => {
                if (!podeQuitar(exp)) return
                e.preventDefault()
                setDragOverId(null)
                const f = e.dataTransfer.files?.[0]
                if (f && f.type.startsWith('image/')) handleDropPagamento(exp, f)
              }}
            >
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
                <span className="flex items-center gap-1.5 shrink-0">
                  <span className="font-bold text-sm whitespace-nowrap">{currency(exp.total)}</span>
                  {/* Copia o valor A PAGAR (total com a taxa Dex, menos o que
                      já entrou de parcial) no formato do app do banco. */}
                  {podeQuitar(exp) && (
                    <button
                      onClick={() => copiarTexto(`${exp.id}:valor`, Math.max(0, exp.total - pagoDe(exp.id)).toFixed(2).replace('.', ','))}
                      title="Copiar o valor a pagar (já com a taxa Dex) pra colar no banco"
                      className={`text-xs leading-none p-1 rounded hover:bg-beetz-gray ${pixCopiadoId === `${exp.id}:valor` ? 'text-green-600' : 'text-beetz-dark/40'}`}
                    >
                      {pixCopiadoId === `${exp.id}:valor` ? '✓' : '📋'}
                    </button>
                  )}
                </span>
              </div>

              <button onClick={() => setDetail(exp)} className="w-full text-left mt-1">
                <p className="text-xs text-beetz-dark/50 line-clamp-2">
                  {exp.description || 'Sem descrição'}{exp.payment_method ? ` · ${exp.payment_method}` : ''}
                  {exp.team_member_id ? ` · Equipe: ${teamMembers.find((m) => m.id === exp.team_member_id)?.first_name ?? '—'}` : ''}
                  {exp.pending_team_member_id ? ` · Equipe: ${pendingProfiles.find((m) => m.id === exp.pending_team_member_id)?.first_name ?? '—'} (pré-cadastro)` : ''}
                  {exp.supplier_id ? ` · Fornecedor: ${suppliers.find((s) => s.id === exp.supplier_id)?.name ?? '—'}` : ''}
                </p>
              </button>

              {/* Pra onde vai o dinheiro: chave Pix copiável, sem abrir nada.
                  Some quando a despesa já está resolvida. */}
              {(() => {
                const px = pixDaDespesa(exp)
                if (!px || exp.status === 'Pago' || exp.status === 'Cancelado' || exp.status === 'Rejeitado') return null
                return (
                  <div className="flex flex-wrap items-center gap-x-2 gap-y-1 mt-1.5 text-[11px]">
                    <span className="text-beetz-dark/40 font-medium">🔑 {px.rotulo}:</span>
                    <code className="font-semibold bg-beetz-gray px-1.5 py-0.5 rounded break-all">{px.chave}</code>
                    <button
                      onClick={() => copiarTexto(`${exp.id}:chave`, px.chave)}
                      className={`font-bold underline shrink-0 ${pixCopiadoId === `${exp.id}:chave` ? 'text-green-600' : 'text-beetz-dark/50 hover:text-beetz-dark'}`}
                    >
                      {pixCopiadoId === `${exp.id}:chave` ? 'copiado ✓' : 'copiar'}
                    </button>
                    {px.tipo && <span className="text-beetz-dark/35">{px.tipo}</span>}
                    {px.titular && (
                      <>
                        <span className="text-beetz-dark/50">· {px.titular}</span>
                        <button
                          onClick={() => copiarTexto(`${exp.id}:nome`, px.titular!)}
                          title="Copiar o nome do titular (pra conferir no app do banco)"
                          className={`font-bold underline shrink-0 ${pixCopiadoId === `${exp.id}:nome` ? 'text-green-600' : 'text-beetz-dark/50 hover:text-beetz-dark'}`}
                        >
                          {pixCopiadoId === `${exp.id}:nome` ? 'copiado ✓' : 'copiar nome'}
                        </button>
                      </>
                    )}
                  </div>
                )
              })()}

              {/* Progresso dos pagamentos parciais: só aparece quando já
                  entrou algum pagamento e ainda falta. */}
              {pagoDe(exp.id) > 0 && exp.status !== 'Pago' && (
                <div className="mt-2">
                  <div className="h-1.5 bg-beetz-gray rounded-full overflow-hidden">
                    <div className="h-full honey-gradient rounded-full" style={{ width: `${Math.min(100, Math.round(100 * pagoDe(exp.id) / Math.max(0.01, exp.total)))}%` }} />
                  </div>
                  <p className="text-[11px] font-semibold text-amber-700 mt-1">
                    Pago {currency(pagoDe(exp.id))} · falta {currency(Math.max(0, exp.total - pagoDe(exp.id)))}
                  </p>
                </div>
              )}
              {exp.status === 'Pago' && (pagoPorDespesa.get(exp.id)?.pagamentos ?? 0) > 0 && (
                <p className="text-[11px] text-beetz-dark/35 mt-1.5">
                  📎 Quitada com {pagoPorDespesa.get(exp.id)!.pagamentos} comprovante{pagoPorDespesa.get(exp.id)!.pagamentos > 1 ? 's' : ''} — abra em Editar pra ver.
                </p>
              )}

              {/* Quitação rápida: arrasta o comprovante em cima do card. No
                  celular (sem drag), o atalho abre o modal na régua. */}
              {podeQuitar(exp) && (
                <div className={`mt-2 rounded-lg border border-dashed px-3 py-1.5 text-[11px] font-medium transition-colors ${
                  dragOverId === exp.id ? 'border-green-400 bg-green-50 text-green-700' : 'border-beetz-dark/15 text-beetz-dark/40'
                }`}>
                  {quitandoId === exp.id
                    ? 'Registrando pagamento...'
                    : (
                      <>
                        💸 Arraste o comprovante aqui pra quitar
                        {pagoDe(exp.id) > 0 ? ` (falta ${currency(Math.max(0, exp.total - pagoDe(exp.id)))})` : ''} ·{' '}
                        <button onClick={() => handleEdit(exp)} className="underline font-semibold hover:text-beetz-dark">
                          ou pague pelo modal
                        </button>
                      </>
                    )}
                </div>
              )}

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
            {/* Um Pix só pra várias despesas da mesma pessoa: o comprovante
                entra como pagamento em CADA selecionada e quita todas. */}
            {canReviewExpense(accessRole) && (
              <label className={`cursor-pointer bg-white/10 hover:bg-white/20 text-white font-bold px-4 py-2 rounded-xl text-sm transition-colors ${bulkBusy ? 'opacity-50 pointer-events-none' : ''}`}>
                💸 Quitar com 1 comprovante
                <input
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ''; if (f) handleBulkQuitar(f) }}
                />
              </label>
            )}
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

      {editingExpense && (
        <EditExpenseModal
          expense={editingExpense}
          events={[]}
          lockEvent
          categories={categories}
          paymentMethods={paymentMethods}
          profiles={teamMembers}
          pendingProfiles={pendingProfiles}
          suppliers={suppliers}
          onClose={() => setEditingExpense(null)}
          onSaved={load}
        />
      )}
    </div>
  )
}
