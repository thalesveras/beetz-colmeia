import { useEffect, useState } from 'react'
import { useAuth } from '../../contexts/AuthContext'
import {
  createExpense, listExpenseCategories, listExpensesForEvent, listPaymentMethods, updateExpenseStatus
} from '../../lib/dataService'
import type { Expense, ExpenseCategory, ExpenseStatus, PaymentMethod, PaymentMethodOption } from '../../lib/types'
import FileField from '../../components/ui/FileField'
import SignaturePad from '../../components/ui/SignaturePad'
import { Plus } from 'lucide-react'

const statuses: ExpenseStatus[] = ['Pendente', 'Aprovado', 'Pago', 'Rejeitado']

const statusColors: Record<ExpenseStatus, string> = {
  Pendente: 'bg-beetz-yellow/30 text-beetz-dark',
  Aprovado: 'bg-blue-100 text-blue-700',
  Pago: 'bg-green-100 text-green-700',
  Rejeitado: 'bg-red-100 text-red-700'
}

function currency(v: number) {
  return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

const inputClass = 'w-full border border-beetz-dark/15 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-beetz-yellow'

export default function ExpensesTab({ eventId }: { eventId: string }) {
  const { userId } = useAuth()
  const [expenses, setExpenses] = useState<Expense[]>([])
  const [categories, setCategories] = useState<ExpenseCategory[]>([])
  const [paymentMethods, setPaymentMethods] = useState<PaymentMethodOption[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [saving, setSaving] = useState(false)

  const [category, setCategory] = useState('')
  const [receiptData, setReceiptData] = useState<string | null>(null)
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod | ''>('')
  const [description, setDescription] = useState('')
  const [quantity, setQuantity] = useState(1)
  const [unitValue, setUnitValue] = useState(0)
  const [dexFee, setDexFee] = useState(0)
  const [signatureData, setSignatureData] = useState<string | null>(null)
  const [repasseData, setRepasseData] = useState<string | null>(null)

  async function load() {
    setLoading(true)
    setExpenses(await listExpensesForEvent(eventId))
    setLoading(false)
  }

  useEffect(() => { load() }, [eventId])
  useEffect(() => {
    listExpenseCategories().then(setCategories)
    listPaymentMethods().then(setPaymentMethods)
  }, [])

  const total = expenses.reduce((sum, e) => sum + e.total, 0)
  const formTotal = quantity * unitValue + dexFee

  function resetForm() {
    setCategory(''); setReceiptData(null); setPaymentMethod(''); setDescription('')
    setQuantity(1); setUnitValue(0); setDexFee(0); setSignatureData(null); setRepasseData(null)
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!userId) return
    setSaving(true)
    await createExpense({
      event_id: eventId,
      status: 'Pendente',
      category: category || null,
      receipt_data: receiptData,
      payment_method: paymentMethod || null,
      description: description || null,
      quantity,
      unit_value: unitValue,
      dex_fee: dexFee,
      signature_data: signatureData,
      repasse_data: repasseData,
      created_by: userId
    })
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
      <div className="flex items-center justify-between">
        <p className="text-sm text-beetz-dark/60">
          {loading ? 'Carregando...' : `${expenses.length} despesa(s) · Total: ${currency(total)}`}
        </p>
        <button
          onClick={() => setShowForm((v) => !v)}
          className="flex items-center gap-1.5 text-sm font-semibold bg-beetz-dark text-white px-3 py-2 rounded-xl hover:bg-black transition-colors"
        >
          <Plus size={16} /> Nova despesa
        </button>
      </div>

      {showForm && (
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
            <button type="button" onClick={() => setShowForm(false)} className="text-sm font-semibold text-beetz-dark/50 px-4 py-2">Cancelar</button>
            <button type="submit" disabled={saving} className="honey-gradient text-beetz-dark font-bold px-5 py-2 rounded-xl text-sm disabled:opacity-60">
              {saving ? 'Salvando...' : 'Salvar despesa'}
            </button>
          </div>
        </form>
      )}

      {!loading && (
        <div className="space-y-2">
          {expenses.map((exp) => (
            <div key={exp.id} className="flex flex-wrap items-center gap-3 bg-white border border-beetz-dark/5 rounded-xl p-4">
              <select
                value={exp.status}
                onChange={(e) => handleStatusChange(exp.id, e.target.value as ExpenseStatus)}
                className={`text-xs font-semibold px-2.5 py-1 rounded-full border-0 ${statusColors[exp.status]}`}
              >
                {statuses.map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
              <div className="flex-1 min-w-[140px]">
                <p className="font-semibold text-sm">{exp.category || 'Sem categoria'}</p>
                <p className="text-xs text-beetz-dark/50">{exp.description || '—'} {exp.payment_method ? `· ${exp.payment_method}` : ''}</p>
              </div>
              <span className="font-bold text-sm">{currency(exp.total)}</span>
            </div>
          ))}
          {expenses.length === 0 && <p className="text-sm text-beetz-dark/50">Nenhuma despesa registrada ainda.</p>}
        </div>
      )}
    </div>
  )
}
