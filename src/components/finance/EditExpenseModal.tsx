import { useState } from 'react'
import { X } from 'lucide-react'
import { createSupplier, moveExpenseToEvent, updateExpense } from '../../lib/dataService'
import type {
  EventItem, Expense, ExpenseCategory, ExpenseStatus, PaymentMethodOption, PendingProfilePickerItem,
  Profile, Supplier
} from '../../lib/types'

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

  const formTotal = quantity * unitValue + dexFee
  const eventChanged = eventId !== expense.event_id

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
        </div>

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
