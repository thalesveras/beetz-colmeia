import { useState } from 'react'
import { Trash2, X } from 'lucide-react'
import { deleteProductionConsumption, updateProductionConsumption } from '../../lib/dataService'
import type { Product, ProductionConsumption } from '../../lib/types'

// Modal de edição de um registro de consumo da produção — no padrão elegante
// da casa (mesma anatomia do CreateExpenseModal): fundo escurecido, cartão
// branco arredondado, total ao vivo, fechar clicando fora. Antes o registro
// era uma linha morta: dava pra criar errado e conviver com o erro pra sempre.

const inputClass = 'w-full border border-beetz-dark/15 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-beetz-yellow'

function currency(v: number) {
  return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <div><label className="text-xs font-medium block mb-1 text-beetz-dark/70">{label}</label>{children}</div>
}

interface Props {
  item: ProductionConsumption
  products: Product[]
  onClose: () => void
  onSaved: () => void
}

export default function EditConsumptionModal({ item, products, onClose, onSaved }: Props) {
  const [productId, setProductId] = useState(item.product_id)
  const [quantity, setQuantity] = useState(String(item.quantity))
  const [unitCost, setUnitCost] = useState(String(item.unit_cost))
  const [notes, setNotes] = useState(item.notes ?? '')
  const [saving, setSaving] = useState(false)
  const [removing, setRemoving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const parsedQty = Number(quantity.replace(',', '.')) || 0
  const parsedCost = Number(unitCost.replace(',', '.')) || 0
  const total = parsedQty * parsedCost

  async function handleSave() {
    if (!productId || parsedQty <= 0) { setError('Confira produto e quantidade.'); return }
    setSaving(true); setError(null)
    try {
      await updateProductionConsumption(item.id, {
        product_id: productId,
        quantity: parsedQty,
        unit_cost: parsedCost,
        notes: notes.trim() || null
      })
      onSaved()
      onClose()
    } catch (e: any) {
      setError(e?.message ?? 'Não foi possível salvar.')
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete() {
    if (!window.confirm('Excluir este registro de consumo? O custo sai do fechamento do evento.')) return
    setRemoving(true); setError(null)
    try {
      await deleteProductionConsumption(item.id)
      onSaved()
      onClose()
    } catch (e: any) {
      setError(e?.message ?? 'Não foi possível excluir (pode ser falta de permissão).')
      setRemoving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-3xl w-full max-w-md max-h-[88vh] overflow-y-auto p-6" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start justify-between mb-5">
          <div>
            <h3 className="text-lg font-extrabold">Editar consumo</h3>
            <p className="text-xs text-beetz-dark/50 mt-0.5">O custo entra direto no fechamento do evento.</p>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-beetz-gray" aria-label="Fechar"><X size={18} /></button>
        </div>

        {error && <p className="text-sm text-red-600 bg-red-50 border border-red-100 rounded-xl px-3 py-2 mb-4">{error}</p>}

        <div className="space-y-4">
          <Field label="Produto">
            <select className={inputClass} value={productId} onChange={(e) => setProductId(e.target.value)}>
              {products.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </Field>

          <div className="grid grid-cols-2 gap-3">
            <Field label="Quantidade">
              <input type="text" inputMode="decimal" className={inputClass} value={quantity} onChange={(e) => setQuantity(e.target.value)} />
            </Field>
            <Field label="Custo unitário (R$)">
              <input type="text" inputMode="decimal" className={inputClass} value={unitCost} onChange={(e) => setUnitCost(e.target.value)} />
            </Field>
          </div>

          <Field label="Observações">
            <input className={inputClass} placeholder="Ex: consumo da equipe, cortesias..." value={notes} onChange={(e) => setNotes(e.target.value)} />
          </Field>

          <div className="bg-beetz-gray/60 rounded-xl px-4 py-2.5 flex items-center justify-between">
            <span className="text-sm text-beetz-dark/60">Custo total</span>
            <span className="text-lg font-extrabold">{currency(total)}</span>
          </div>

          <div className="flex flex-wrap items-center gap-2 pt-2">
            <button
              onClick={handleSave}
              disabled={saving || removing || !productId || parsedQty <= 0}
              className="honey-gradient text-beetz-dark font-bold px-5 py-2.5 rounded-xl text-sm disabled:opacity-60"
            >
              {saving ? 'Salvando...' : 'Salvar alterações'}
            </button>
            <button onClick={onClose} className="text-sm text-beetz-dark/50 hover:text-beetz-dark px-3">Cancelar</button>
            <button
              onClick={handleDelete}
              disabled={saving || removing}
              className="ml-auto flex items-center gap-1.5 text-sm font-semibold text-red-600 hover:bg-red-50 px-3 py-2 rounded-xl disabled:opacity-60"
            >
              <Trash2 size={14} /> {removing ? 'Excluindo...' : 'Excluir'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
