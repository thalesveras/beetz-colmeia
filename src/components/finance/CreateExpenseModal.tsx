import { useState } from 'react'
import { Plus, X } from 'lucide-react'
import { createExpense, createSupplier } from '../../lib/dataService'
import PersonPicker from './PersonPicker'
import type {
  EventItem, ExpenseCategory, ExpenseStatus, PaymentMethod, PaymentMethodOption,
  PendingProfilePickerItem, Profile, Supplier
} from '../../lib/types'

const inputClass = 'w-full border border-beetz-dark/15 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-beetz-yellow'

function currency(v: number) {
  return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <div><label className="text-xs font-medium block mb-1 text-beetz-dark/70">{label}</label>{children}</div>
}

interface Props {
  events: EventItem[]
  categories: ExpenseCategory[]
  paymentMethods: PaymentMethodOption[]
  profiles: Profile[]
  pendingProfiles: PendingProfilePickerItem[]
  suppliers: Supplier[]
  userId: string | null
  /** Diretoria escolhe o status; os demais criam sempre como Pendente. */
  canReview: boolean
  onClose: () => void
  onSaved: () => void
}

// Criação avançada de despesa — a primeira porta de entrada MANUAL que a página
// global tem (antes só nascia dentro do evento ou via Compra de estoque).
// A diferença que importa: aqui dá pra criar despesa DA EMPRESA (sem evento),
// que nenhum outro formulário oferece.
export default function CreateExpenseModal({
  events, categories, paymentMethods, profiles, pendingProfiles, suppliers,
  userId, canReview, onClose, onSaved
}: Props) {
  const [eventId, setEventId] = useState('')
  const [status, setStatus] = useState<ExpenseStatus>('Pendente')
  const [category, setCategory] = useState('')
  const [paymentMethod, setPaymentMethod] = useState('')
  const [description, setDescription] = useState('')
  const [quantity, setQuantity] = useState(1)
  const [unitValue, setUnitValue] = useState('')
  const [dexFee, setDexFee] = useState('')
  const [personKey, setPersonKey] = useState('')
  const [supplierId, setSupplierId] = useState('')
  const [supplierList, setSupplierList] = useState(suppliers)
  const [newSupplierName, setNewSupplierName] = useState('')
  const [addingSupplier, setAddingSupplier] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const parsedUnit = Number(unitValue.replace(',', '.')) || 0
  const parsedFee = Number(dexFee.replace(',', '.')) || 0
  const total = quantity * parsedUnit + parsedFee

  async function handleQuickSupplier() {
    const name = newSupplierName.trim()
    if (!name) return
    setAddingSupplier(true)
    try {
      const created = await createSupplier({ name })
      setSupplierList((l) => [...l, created])
      setSupplierId(created.id)
      setNewSupplierName('')
    } catch (e: any) {
      setError(e?.message ?? 'Não foi possível criar o fornecedor.')
    } finally {
      setAddingSupplier(false)
    }
  }

  async function handleSave() {
    if (!description.trim()) { setError('Descreva a despesa.'); return }
    if (parsedUnit <= 0) { setError('Informe o valor unitário.'); return }
    setSaving(true); setError(null)
    try {
      await createExpense({
        // Vazio = despesa da EMPRESA: custo geral, de nenhuma festa.
        event_id: eventId || null,
        status: canReview ? status : 'Pendente',
        category: category || null,
        payment_method: (paymentMethod || null) as PaymentMethod | null,
        description: description.trim(),
        quantity,
        unit_value: parsedUnit,
        dex_fee: parsedFee,
        receipt_data: null, signature_data: null, repasse_data: null,
        created_by: userId,
        team_member_id: personKey.startsWith('p:') ? personKey.slice(2) : null,
        pending_team_member_id: personKey.startsWith('z:') ? personKey.slice(2) : null,
        supplier_id: supplierId || null,
        stock_movement_id: null
      })
      onSaved()
      onClose()
    } catch (e: any) {
      setError(e?.message ?? 'Não foi possível criar a despesa.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-3xl w-full max-w-xl max-h-[88vh] overflow-y-auto p-6" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start justify-between mb-5">
          <div>
            <h3 className="text-lg font-extrabold">Nova despesa</h3>
            <p className="text-xs text-beetz-dark/50 mt-0.5">De evento ou da empresa — com fornecedor, pessoa e forma de pagamento.</p>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-beetz-gray" aria-label="Fechar"><X size={18} /></button>
        </div>

        {error && <p className="text-sm text-red-600 bg-red-50 border border-red-100 rounded-xl px-3 py-2 mb-4">{error}</p>}

        <div className="space-y-4">
          <Field label="Evento (vazio = despesa da empresa: aluguel, estoque, contador...)">
            <select className={inputClass} value={eventId} onChange={(e) => setEventId(e.target.value)}>
              <option value="">Beetz — despesa da empresa</option>
              {events.map((ev) => <option key={ev.id} value={ev.id}>{ev.name}</option>)}
            </select>
          </Field>

          <Field label="Descrição *">
            <input className={inputClass} value={description} onChange={(e) => setDescription(e.target.value)}
              placeholder="Ex: 10 caixas de Heineken, frete do palco, aluguel do galpão..." autoFocus />
          </Field>

          <div className="grid grid-cols-3 gap-3">
            <Field label="Quantidade">
              <input type="number" min={0.01} step="0.01" className={inputClass} value={quantity}
                onChange={(e) => setQuantity(Number(e.target.value))} />
            </Field>
            <Field label="Valor unitário (R$) *">
              <input type="text" inputMode="decimal" className={inputClass} value={unitValue}
                onChange={(e) => setUnitValue(e.target.value)} placeholder="0,00" />
            </Field>
            <Field label="Taxa/frete (R$)">
              <input type="text" inputMode="decimal" className={inputClass} value={dexFee}
                onChange={(e) => setDexFee(e.target.value)} placeholder="0,00" />
            </Field>
          </div>

          <div className="bg-beetz-gray/60 rounded-xl px-4 py-2.5 flex items-center justify-between">
            <span className="text-sm text-beetz-dark/60">Total</span>
            <span className="text-lg font-extrabold">{currency(total)}</span>
          </div>

          <div className="grid sm:grid-cols-2 gap-3">
            <Field label="Categoria">
              <select className={inputClass} value={category} onChange={(e) => setCategory(e.target.value)}>
                <option value="">Sem categoria</option>
                {categories.map((c) => <option key={c.id} value={c.name}>{c.name}</option>)}
              </select>
            </Field>
            <Field label="Forma de pagamento">
              <select className={inputClass} value={paymentMethod} onChange={(e) => setPaymentMethod(e.target.value)}>
                <option value="">Não informado</option>
                {paymentMethods.map((m) => <option key={m.id} value={m.name}>{m.name}</option>)}
              </select>
            </Field>
          </div>

          <Field label="Pessoa (quem recebeu — equipe ou pré-cadastro)">
            <PersonPicker
              profiles={profiles}
              pendingProfiles={pendingProfiles}
              value={personKey}
              onChange={setPersonKey}
            />
          </Field>

          <Field label="Fornecedor">
            <div className="flex gap-2">
              <select className={inputClass} value={supplierId} onChange={(e) => setSupplierId(e.target.value)}>
                <option value="">Nenhum</option>
                {supplierList.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </div>
            <div className="flex gap-2 mt-2">
              <input className={inputClass} placeholder="Ou cadastre um novo na hora..."
                value={newSupplierName} onChange={(e) => setNewSupplierName(e.target.value)} />
              <button type="button" onClick={handleQuickSupplier} disabled={addingSupplier || !newSupplierName.trim()}
                className="bg-beetz-dark text-white text-sm font-semibold px-3 rounded-xl disabled:opacity-50 shrink-0">
                <Plus size={14} />
              </button>
            </div>
          </Field>

          {canReview ? (
            <Field label="Status inicial">
              <select className={inputClass} value={status} onChange={(e) => setStatus(e.target.value as ExpenseStatus)}>
                {(['Pendente', 'Aprovado', 'Pago'] as ExpenseStatus[]).map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
            </Field>
          ) : (
            <p className="text-xs text-beetz-dark/40">
              A despesa entra como <strong>Pendente</strong> e a Diretoria revisa — quem lança não aprova o próprio gasto.
            </p>
          )}

          <div className="flex gap-2 pt-2">
            <button onClick={handleSave} disabled={saving || !description.trim() || parsedUnit <= 0}
              className="honey-gradient text-beetz-dark font-bold px-5 py-2.5 rounded-xl text-sm disabled:opacity-60">
              {saving ? 'Salvando...' : `Criar despesa (${currency(total)})`}
            </button>
            <button onClick={onClose} className="text-sm text-beetz-dark/50 hover:text-beetz-dark px-3">Cancelar</button>
          </div>
        </div>
      </div>
    </div>
  )
}
