import { useEffect, useState } from 'react'
import { Trash2, X } from 'lucide-react'
import { useAuth } from '../../contexts/AuthContext'
import {
  addExpensePayment, createSupplier, deleteExpensePayment, listExpensePayments,
  moveExpenseToEvent, updateExpense
} from '../../lib/dataService'
import type { ExpensePayment } from '../../lib/dataService'
import SmartReceiptField from '../ui/SmartReceiptField'
import type { ExtractedReceipt } from '../ui/SmartReceiptField'
import type {
  EventItem, Expense, ExpenseCategory, ExpenseStatus, PaymentMethodOption, PendingProfilePickerItem,
  Profile, Supplier
} from '../../lib/types'

// Data de hoje no fuso LOCAL (lei da casa): toISOString é UTC e à noite em
// São Luís já viraria amanhã.
function hojeISO() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function dataBR(iso: string) {
  const [y, m, d] = iso.split('-')
  return `${d}/${m}/${y}`
}

const inputClass = 'w-full border border-beetz-dark/15 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-beetz-yellow'
const statuses: ExpenseStatus[] = ['Pendente', 'Aprovado', 'Pago', 'Rejeitado', 'Cancelado']

function currency(v: number) {
  return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <div><label className="text-xs font-medium block mb-1 text-beetz-dark/70">{label}</label>{children}</div>
}

interface Props {
  expense: Expense
  events: EventItem[]
  categories: ExpenseCategory[]
  paymentMethods: PaymentMethodOption[]
  profiles: Profile[]
  pendingProfiles: PendingProfilePickerItem[]
  suppliers: Supplier[]
  onClose: () => void
  onSaved: () => void
}

export default function EditExpenseModal({
  expense, events, categories, paymentMethods, profiles, pendingProfiles, suppliers, onClose, onSaved
}: Props) {
  const [eventId, setEventId] = useState(expense.event_id)
  const [status, setStatus] = useState(expense.status)
  const [category, setCategory] = useState(expense.category ?? '')
  const [paymentMethod, setPaymentMethod] = useState(expense.payment_method ?? '')
  const [description, setDescription] = useState(expense.description ?? '')
  const [quantity, setQuantity] = useState(expense.quantity)
  const [unitValue, setUnitValue] = useState(expense.unit_value)
  const [dexFee, setDexFee] = useState(expense.dex_fee)
  const [teamMemberId, setTeamMemberId] = useState(
    expense.team_member_id ? `p:${expense.team_member_id}` : expense.pending_team_member_id ? `z:${expense.pending_team_member_id}` : ''
  )
  const [supplierId, setSupplierId] = useState(expense.supplier_id ?? '')
  const [newSupplierName, setNewSupplierName] = useState('')
  const [supplierList, setSupplierList] = useState(suppliers)
  const [addingSupplier, setAddingSupplier] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // ---- Pagamentos parciais: cada comprovante desconta do total até
  // quitar. O trigger no banco marca Pago sozinho; aqui a gente espelha
  // no select de status pra "Salvar alterações" não desfazer a quitação.
  const { userId } = useAuth()
  const [pagamentos, setPagamentos] = useState<ExpensePayment[]>([])
  const [pagLoading, setPagLoading] = useState(true)
  const [pagValor, setPagValor] = useState(0)
  const [pagData, setPagData] = useState(hojeISO())
  const [pagComprovante, setPagComprovante] = useState<string | null>(null)
  const [pagNotes, setPagNotes] = useState('')
  const [pagBusy, setPagBusy] = useState(false)
  const [verComprovante, setVerComprovante] = useState<string | null>(null)

  const formTotal = quantity * unitValue + dexFee
  const eventChanged = eventId !== expense.event_id
  const totalPago = pagamentos.reduce((s, p) => s + p.amount, 0)
  const restante = Math.max(0, formTotal - totalPago)
  const quitada = formTotal > 0 && totalPago >= formTotal - 0.009

  useEffect(() => {
    listExpensePayments(expense.id)
      .then(setPagamentos)
      .catch(() => setPagamentos([]))
      .finally(() => setPagLoading(false))
  }, [expense.id])

  function aplicarExtracao(f: ExtractedReceipt) {
    if (f.amount != null) setPagValor((cur) => (cur > 0 ? cur : f.amount!))
    if (f.date) setPagData(f.date)
    if (f.notes) setPagNotes((cur) => (cur.trim() ? cur : f.notes!))
  }

  async function registrarPagamento() {
    if (!(pagValor > 0)) return
    setPagBusy(true)
    setError(null)
    try {
      await addExpensePayment({
        expense_id: expense.id,
        amount: pagValor,
        paid_at: pagData || hojeISO(),
        receipt_data: pagComprovante,
        notes: pagNotes.trim() || null,
        created_by: userId ?? null
      })
      const lista = await listExpensePayments(expense.id)
      setPagamentos(lista)
      // Espelha o que o trigger fez no banco.
      const soma = lista.reduce((s, p) => s + p.amount, 0)
      if (formTotal > 0 && soma >= formTotal - 0.009) setStatus('Pago')
      setPagValor(0); setPagData(hojeISO()); setPagComprovante(null); setPagNotes('')
      onSaved()
    } catch (err: any) {
      setError(err?.message ?? 'Não deu pra registrar o pagamento.')
    } finally {
      setPagBusy(false)
    }
  }

  async function apagarPagamento(p: ExpensePayment) {
    if (!window.confirm(`Apagar o pagamento de ${currency(p.amount)} de ${dataBR(p.paid_at)}?`)) return
    setPagBusy(true)
    setError(null)
    try {
      await deleteExpensePayment(p.id)
      const lista = await listExpensePayments(expense.id)
      setPagamentos(lista)
      const soma = lista.reduce((s, x) => s + x.amount, 0)
      if (soma < formTotal - 0.009 && status === 'Pago') setStatus('Pendente')
      onSaved()
    } catch (err: any) {
      setError(err?.message ?? 'Não deu pra apagar o pagamento.')
    } finally {
      setPagBusy(false)
    }
  }

  async function handleAddSupplier() {
    const name = newSupplierName.trim()
    if (!name) return
    setAddingSupplier(true)
    const created = await createSupplier({ name })
    setSupplierList((prev) => [...prev, created])
    setSupplierId(created.id)
    setNewSupplierName('')
    setAddingSupplier(false)
  }

  async function handleSave() {
    setSaving(true)
    setError(null)
    try {
      const [teamKind, teamId] = teamMemberId ? teamMemberId.split(':') : [null, null]
      await updateExpense(expense.id, {
        status,
        category: category || null,
        payment_method: paymentMethod || null,
        description: description || null,
        quantity,
        unit_value: unitValue,
        dex_fee: dexFee,
        team_member_id: teamKind === 'p' ? teamId : null,
        pending_team_member_id: teamKind === 'z' ? teamId : null,
        supplier_id: supplierId || null
      })
      if (eventChanged) {
        await moveExpenseToEvent(expense.id, eventId)
      }
      onSaved()
      onClose()
    } catch (err: any) {
      setError(err?.message ?? 'Erro ao salvar despesa.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl w-full max-w-xl max-h-[90vh] overflow-y-auto shadow-glow" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between p-5 border-b border-beetz-dark/10 sticky top-0 bg-white z-10">
          <h2 className="font-bold text-lg">Editar despesa</h2>
          <button onClick={onClose} className="text-beetz-dark/50 hover:text-beetz-dark"><X size={20} /></button>
        </div>

        <div className="p-5 space-y-4">
          {error && <div className="bg-red-50 border border-red-100 text-red-700 text-sm rounded-xl p-3">{error}</div>}

          <Field label="Evento">
            <select className={inputClass} value={eventId} onChange={(e) => setEventId(e.target.value)}>
              {events.map((ev) => <option key={ev.id} value={ev.id}>{ev.name} · {ev.event_date}</option>)}
            </select>
            {eventChanged && <p className="text-xs text-beetz-yellow-700 mt-1 text-amber-600">Essa despesa vai mudar de evento ao salvar.</p>}
          </Field>

          <div className="grid sm:grid-cols-2 gap-3">
            <Field label="Status">
              <select className={inputClass} value={status} onChange={(e) => setStatus(e.target.value as ExpenseStatus)}>
                {statuses.map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
            </Field>
            <Field label="Categoria">
              <select className={inputClass} value={category} onChange={(e) => setCategory(e.target.value)}>
                <option value="">Selecionar...</option>
                {categories.map((c) => <option key={c.id} value={c.name}>{c.name}</option>)}
              </select>
            </Field>
          </div>

          <div className="grid sm:grid-cols-2 gap-3">
            <Field label="Forma de pagamento">
              <select className={inputClass} value={paymentMethod} onChange={(e) => setPaymentMethod(e.target.value)}>
                <option value="">Selecionar...</option>
                {paymentMethods.map((p) => <option key={p.id} value={p.name}>{p.name}</option>)}
              </select>
            </Field>
            <Field label="Equipe">
              <select className={inputClass} value={teamMemberId} onChange={(e) => setTeamMemberId(e.target.value)}>
                <option value="">Nenhum</option>
                {profiles.length > 0 && (
                  <optgroup label="Equipe cadastrada">
                    {profiles.map((m) => <option key={m.id} value={`p:${m.id}`}>{m.first_name} {m.last_name}</option>)}
                  </optgroup>
                )}
                {pendingProfiles.length > 0 && (
                  <optgroup label="Pré-cadastro">
                    {pendingProfiles.map((m) => <option key={m.id} value={`z:${m.id}`}>{m.first_name} {m.last_name}</option>)}
                  </optgroup>
                )}
              </select>
            </Field>
          </div>

          <Field label="Fornecedor">
            <select className={inputClass} value={supplierId} onChange={(e) => setSupplierId(e.target.value)}>
              <option value="">Nenhum</option>
              {supplierList.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
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
          </Field>

          <Field label="Descrição">
            <input className={inputClass} value={description} onChange={(e) => setDescription(e.target.value)} />
          </Field>

          <div className="grid sm:grid-cols-3 gap-3">
            <Field label="Quantidade"><input type="number" min={0} step="1" className={inputClass} value={quantity} onChange={(e) => setQuantity(Number(e.target.value))} /></Field>
            <Field label="Valor (R$)"><input type="number" min={0} step="0.01" className={inputClass} value={unitValue} onChange={(e) => setUnitValue(Number(e.target.value))} /></Field>
            <Field label="Taxa Dex (R$)"><input type="number" min={0} step="0.01" className={inputClass} value={dexFee} onChange={(e) => setDexFee(Number(e.target.value))} /></Field>
          </div>

          <div className="bg-beetz-gray rounded-xl px-4 py-3 flex justify-between items-center">
            <span className="text-sm font-medium text-beetz-dark/60">Total</span>
            <span className="font-bold">{currency(formTotal)}</span>
          </div>

          {/* ---- Pagamentos: vários comprovantes até quitar ---- */}
          <div className="border border-beetz-dark/10 rounded-xl p-4 space-y-3">
            <div className="flex items-center justify-between gap-2">
              <p className="text-sm font-bold">Pagamentos</p>
              {quitada ? (
                <span className="text-xs font-bold px-2.5 py-1 rounded-full bg-green-100 text-green-700">Quitada ✓</span>
              ) : totalPago > 0 ? (
                <span className="text-xs font-bold px-2.5 py-1 rounded-full bg-amber-100 text-amber-700">Falta {currency(restante)}</span>
              ) : null}
            </div>

            <div>
              <div className="h-2 bg-beetz-gray rounded-full overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all ${quitada ? 'bg-green-500' : 'honey-gradient'}`}
                  style={{ width: `${formTotal > 0 ? Math.min(100, Math.round(100 * totalPago / formTotal)) : 0}%` }}
                />
              </div>
              <p className="text-xs text-beetz-dark/50 mt-1.5">
                Pago <strong>{currency(totalPago)}</strong> de {currency(formTotal)}
                {quitada ? ' — quitando o último centavo, o status vira Pago sozinho.' : ''}
              </p>
              {status === 'Pago' && pagamentos.length > 0 && !quitada && (
                <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 mt-2">
                  O total ficou maior que a soma paga (o valor da despesa mudou?) — confira o status antes de salvar.
                </p>
              )}
            </div>

            {pagLoading ? (
              <p className="text-xs text-beetz-dark/40">Carregando pagamentos...</p>
            ) : pagamentos.length > 0 && (
              <div className="divide-y divide-beetz-dark/5 border border-beetz-dark/5 rounded-lg overflow-hidden">
                {pagamentos.map((p) => (
                  <div key={p.id} className="flex items-center gap-2.5 px-3 py-2 bg-white">
                    {p.receipt_data ? (
                      <button type="button" onClick={() => setVerComprovante(p.receipt_data)} title="Ver comprovante" className="shrink-0">
                        <img src={p.receipt_data} alt="Comprovante" className="w-9 h-9 rounded-lg object-cover border border-beetz-dark/10" />
                      </button>
                    ) : (
                      <span className="w-9 h-9 rounded-lg bg-beetz-gray flex items-center justify-center text-[10px] text-beetz-dark/35 shrink-0">s/ doc</span>
                    )}
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-bold">{currency(p.amount)}</p>
                      <p className="text-xs text-beetz-dark/45 truncate">{dataBR(p.paid_at)}{p.notes ? ` · ${p.notes}` : ''}</p>
                    </div>
                    <button
                      type="button" onClick={() => apagarPagamento(p)} disabled={pagBusy}
                      className="text-beetz-dark/30 hover:text-red-600 p-1.5 shrink-0 disabled:opacity-40" title="Apagar pagamento"
                    >
                      <Trash2 size={15} />
                    </button>
                  </div>
                ))}
              </div>
            )}

            {!quitada && (
              <div className="space-y-2.5 pt-1">
                <SmartReceiptField value={pagComprovante} onChange={setPagComprovante} onExtracted={aplicarExtracao} />
                <div className="grid grid-cols-2 gap-2.5">
                  <div>
                    <label className="text-xs font-medium block mb-1 text-beetz-dark/70">Valor pago (R$)</label>
                    <div className="flex gap-1.5">
                      <input
                        type="number" min={0.01} step="0.01" inputMode="decimal"
                        className={inputClass + ' min-w-0'} placeholder={restante > 0 ? String(restante.toFixed(2)) : ''}
                        value={pagValor || ''} onChange={(e) => setPagValor(Number(e.target.value))}
                      />
                      {restante > 0 && (
                        <button
                          type="button" onClick={() => setPagValor(Number(restante.toFixed(2)))}
                          className="text-[11px] font-bold px-2 rounded-lg bg-beetz-gray text-beetz-dark/60 hover:text-beetz-dark shrink-0"
                          title="Preencher com o que falta"
                        >
                          Restante
                        </button>
                      )}
                    </div>
                  </div>
                  <div>
                    <label className="text-xs font-medium block mb-1 text-beetz-dark/70">Data</label>
                    <input type="date" className={inputClass + ' min-w-0'} value={pagData} onChange={(e) => setPagData(e.target.value)} />
                  </div>
                </div>
                <input
                  className={inputClass} placeholder="Observação (opcional) — ex: 1ª parcela, Pix do sócio..."
                  value={pagNotes} onChange={(e) => setPagNotes(e.target.value)}
                />
                {pagValor > restante + 0.009 && restante > 0 && (
                  <p className="text-xs text-amber-700">Esse valor passa do que falta ({currency(restante)}) — confere antes de registrar.</p>
                )}
                <button
                  type="button" onClick={registrarPagamento} disabled={pagBusy || !(pagValor > 0)}
                  className="w-full sm:w-auto bg-beetz-dark text-white font-bold px-4 py-2.5 rounded-xl text-sm hover:bg-black disabled:opacity-50"
                >
                  {pagBusy ? 'Registrando...' : 'Registrar pagamento'}
                </button>
              </div>
            )}
          </div>
        </div>

        {verComprovante && (
          <div className="fixed inset-0 z-[60] bg-black/85 flex items-center justify-center p-4" onClick={() => setVerComprovante(null)}>
            <img src={verComprovante} alt="Comprovante" className="max-h-[85vh] max-w-full rounded-xl" />
          </div>
        )}

        <div className="flex justify-end gap-2 p-5 border-t border-beetz-dark/10 sticky bottom-0 bg-white">
          <button onClick={onClose} className="px-4 py-2 rounded-xl text-sm font-semibold text-beetz-dark/60 hover:bg-beetz-gray">Cancelar</button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="honey-gradient text-beetz-dark font-bold px-5 py-2 rounded-xl text-sm disabled:opacity-60"
          >
            {saving ? 'Salvando...' : 'Salvar alterações'}
          </button>
        </div>
      </div>
    </div>
  )
}
