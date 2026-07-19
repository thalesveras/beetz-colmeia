import { useEffect, useState } from 'react'
import { ChevronRight, Plus } from 'lucide-react'
import { useAuth } from '../../contexts/AuthContext'
import {
  createProductionConsumption, getEventStockByProduct, getProductAvgCosts,
  listProducts, listProductionConsumption
} from '../../lib/dataService'
import type { EventStockLine } from '../../lib/dataService'
import type { ProductionConsumption, Product } from '../../lib/types'
import EditConsumptionModal from './EditConsumptionModal'

const inputClass = 'w-full border border-beetz-dark/15 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-beetz-yellow'

function currency(v: number) {
  return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

export default function ProductionConsumptionTab({ eventId }: { eventId: string }) {
  const { userId } = useAuth()
  const [items, setItems] = useState<ProductionConsumption[]>([])
  const [products, setProducts] = useState<Product[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [saving, setSaving] = useState(false)
  const [editing, setEditing] = useState<ProductionConsumption | null>(null)

  const [productId, setProductId] = useState('')
  const [quantity, setQuantity] = useState(1)
  const [unitCost, setUnitCost] = useState(0)
  // Ponte com o estoque do evento: mostra o disponível do produto escolhido e,
  // com a baixa ligada, o consumo vira Consumo Interno no almoxarifado do
  // evento — o saldo cai junto, e excluir o consumo estorna.
  const [stockLines, setStockLines] = useState<EventStockLine[]>([])
  const [avgCosts, setAvgCosts] = useState<Map<string, number>>(new Map())
  const [deductStock, setDeductStock] = useState(true)
  const [notes, setNotes] = useState('')

  async function load() {
    setLoading(true)
    const [consumption, allProducts] = await Promise.all([listProductionConsumption(eventId), listProducts()])
    setItems(consumption)
    setProducts(allProducts)
    setLoading(false)
    getEventStockByProduct(eventId).then(setStockLines).catch(() => setStockLines([]))
    getProductAvgCosts().then(setAvgCosts).catch(() => undefined)
  }

  useEffect(() => { load() }, [eventId])

  const total = items.reduce((sum, i) => sum + i.total_cost, 0)
  const productName = (id: string) => products.find((p) => p.id === id)?.name ?? '—'

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!productId) return
    setSaving(true)
    await createProductionConsumption({
      event_id: eventId, product_id: productId, quantity, unit_cost: unitCost,
      notes: notes || null, created_by: userId
    }, { deductFromEventStock: deductStock })
    setSaving(false)
    setProductId(''); setQuantity(1); setUnitCost(0); setNotes('')
    setShowForm(false)
    load()
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <p className="text-sm text-beetz-dark/60">
          {loading ? 'Carregando...' : `${items.length} registro(s) · Custo total: ${currency(total)}`}
        </p>
        <button
          onClick={() => setShowForm((v) => !v)}
          className="flex items-center gap-1.5 text-sm font-semibold bg-beetz-dark text-white px-3 py-2 rounded-xl hover:bg-black transition-colors"
        >
          <Plus size={16} /> Novo consumo
        </button>
      </div>

      {showForm && (
        <form onSubmit={handleSubmit} className="bg-beetz-gray rounded-2xl p-5 space-y-4">
          <div>
            <label className="text-sm font-medium block mb-1">Produto</label>
            <select className={inputClass} value={productId} onChange={(e) => {
              const id = e.target.value
              setProductId(id)
              const avg = avgCosts.get(id)
              if (avg != null) setUnitCost(Number(avg.toFixed(2)))
            }} required>
              <option value="">Selecionar...</option>
              {products.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </div>
          <div className="grid sm:grid-cols-2 gap-4">
            <div>
              <label className="text-sm font-medium block mb-1">Quantidade</label>
              <input type="number" min={0} step="1" className={inputClass} value={quantity} onChange={(e) => setQuantity(Number(e.target.value))} />
            </div>
            <div>
              <label className="text-sm font-medium block mb-1">Custo unitário (R$)</label>
              <input type="number" min={0} step="0.01" className={inputClass} value={unitCost} onChange={(e) => setUnitCost(Number(e.target.value))} />
            </div>
          </div>
          <div>
            <label className="text-sm font-medium block mb-1">Observações</label>
            <input className={inputClass} placeholder="Ex: consumo da equipe, cortesias..." value={notes} onChange={(e) => setNotes(e.target.value)} />
          </div>
          <div className="bg-white rounded-xl px-4 py-3 flex justify-between items-center">
            <span className="text-sm font-medium text-beetz-dark/60">Custo total</span>
            <span className="font-bold">{currency(quantity * unitCost)}</span>
          </div>

          {productId && (() => {
            const line = stockLines.find((l) => l.product_id === productId)
            const available = line?.net ?? 0
            return (
              <div className="space-y-2">
                <p className={`text-xs font-semibold ${available >= quantity ? 'text-beetz-dark/55' : 'text-red-600'}`}>
                  {line
                    ? `No estoque do evento: ${available} un disponíveis${available < quantity ? ' — consumo maior que o disponível!' : ''}`
                    : 'Este produto não foi enviado pro evento pela aba Estoque.'}
                </p>
                <label className="flex items-start gap-2.5 bg-white rounded-xl p-3 cursor-pointer border border-beetz-dark/5">
                  <input
                    type="checkbox" checked={deductStock} onChange={(e) => setDeductStock(e.target.checked)}
                    className="w-4 h-4 accent-beetz-yellow mt-0.5 shrink-0"
                  />
                  <span className="text-sm">
                    <span className="font-semibold">Baixar do estoque do evento</span>
                    <span className="block text-xs text-beetz-dark/50 mt-0.5">
                      Registra um Consumo Interno no almoxarifado do evento — o saldo da aba Estoque cai junto.
                      Excluir o consumo depois devolve o saldo.
                    </span>
                  </span>
                </label>
              </div>
            )
          })()}
          <div className="flex justify-end gap-2 pt-1">
            <button type="button" onClick={() => setShowForm(false)} className="text-sm font-semibold text-beetz-dark/50 px-4 py-2">Cancelar</button>
            <button type="submit" disabled={saving || !productId} className="honey-gradient text-beetz-dark font-bold px-5 py-2 rounded-xl text-sm disabled:opacity-60">
              {saving ? 'Salvando...' : 'Salvar consumo'}
            </button>
          </div>
        </form>
      )}

      {!loading && (
        <div className="space-y-2">
          {items.map((item) => (
            <button
              key={item.id}
              onClick={() => setEditing(item)}
              className="w-full flex flex-wrap items-center gap-3 bg-white border border-beetz-dark/5 rounded-xl p-4 text-left hover:border-beetz-yellow/60 hover:shadow-glow active:scale-[0.99] transition"
              title="Toque pra editar"
            >
              <div className="flex-1 min-w-[140px]">
                <p className="font-semibold text-sm">{productName(item.product_id)}</p>
                <p className="text-xs text-beetz-dark/50">{item.quantity} un. × {currency(item.unit_cost)} {item.notes ? `· ${item.notes}` : ''}</p>
              </div>
              <span className="font-bold text-sm">{currency(item.total_cost)}</span>
              <ChevronRight size={15} className="text-beetz-dark/25" />
            </button>
          ))}
          {items.length === 0 && <p className="text-sm text-beetz-dark/50">Nenhum consumo registrado ainda.</p>}
        </div>
      )}

      {editing && (
        <EditConsumptionModal
          item={editing}
          products={products}
          onClose={() => setEditing(null)}
          onSaved={load}
        />
      )}
    </div>
  )
}
