import { useEffect, useState } from 'react'
import { Plus, Trash2, X } from 'lucide-react'
import {
  createEventProduct, deleteEventProduct, getEventStockByProduct, getProductAvgCosts,
  listEventProducts, listProducts, updateEventProduct
} from '../../lib/dataService'
import type { EventStockLine } from '../../lib/dataService'
import type { EventProduct, Product } from '../../lib/types'

const inputClass = 'w-full border border-beetz-dark/15 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-beetz-yellow'

function currency(v: number) {
  return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

function formatDateTime(iso: string) {
  return new Date(iso).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })
}

export default function ProductsTab({ eventId }: { eventId: string }) {
  const [items, setItems] = useState<EventProduct[]>([])
  const [products, setProducts] = useState<Product[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [saving, setSaving] = useState(false)
  const [selected, setSelected] = useState<EventProduct | null>(null)
  // Ponte com a aba Estoque: o que foi enviado pro evento (líquido) e o custo
  // médio do catálogo — um toque lança como produto do evento sem digitação.
  const [stockLines, setStockLines] = useState<EventStockLine[]>([])
  const [avgCosts, setAvgCosts] = useState<Map<string, number>>(new Map())
  const [importingId, setImportingId] = useState<string | null>(null)

  const [productId, setProductId] = useState('')
  const [quantity, setQuantity] = useState(1)
  const [unitPrice, setUnitPrice] = useState(0)
  const [notes, setNotes] = useState('')

  async function load() {
    setLoading(true)
    const [eventProducts, allProducts, lines, costs] = await Promise.all([
      listEventProducts(eventId),
      listProducts(),
      getEventStockByProduct(eventId).catch(() => []),
      getProductAvgCosts().catch(() => new Map<string, number>())
    ])
    setItems(eventProducts)
    setProducts(allProducts)
    setStockLines(lines)
    setAvgCosts(costs)
    setLoading(false)
  }

  // Enviado pro evento e ainda sem lançamento em Produtos — é o que falta
  // registrar. Um toque preenche quantidade (líquido do estoque) e preço
  // (custo médio), revisável no modal depois.
  const launchedProductIds = new Set(items.map((i) => i.product_id))
  const pendingFromStock = stockLines.filter((l) => l.net > 0 && !launchedProductIds.has(l.product_id))

  async function importFromStock(line: EventStockLine) {
    setImportingId(line.product_id)
    try {
      await createEventProduct({
        event_id: eventId,
        product_id: line.product_id,
        quantity: line.net,
        unit_price: avgCosts.get(line.product_id) ?? 0,
        notes: 'Lançado do estoque do evento'
      })
      await load()
    } finally {
      setImportingId(null)
    }
  }

  useEffect(() => { load() }, [eventId])

  const total = items.reduce((sum, i) => sum + i.total, 0)
  const productName = (id: string) => products.find((p) => p.id === id)?.name ?? '—'

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!productId) return
    setSaving(true)
    await createEventProduct({ event_id: eventId, product_id: productId, quantity, unit_price: unitPrice, notes: notes || null })
    setSaving(false)
    setProductId(''); setQuantity(1); setUnitPrice(0); setNotes('')
    setShowForm(false)
    load()
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-beetz-dark/60">
          {loading ? 'Carregando...' : `${items.length} produto(s) · Total: ${currency(total)}`}
        </p>
        <button
          onClick={() => setShowForm((v) => !v)}
          className="flex items-center gap-1.5 text-sm font-semibold bg-beetz-dark text-white px-3 py-2 rounded-xl hover:bg-black transition-colors"
        >
          <Plus size={16} /> Novo produto
        </button>
      </div>

      {showForm && (
        <form onSubmit={handleSubmit} className="bg-beetz-gray rounded-2xl p-5 space-y-4">
          <div>
            <label className="text-sm font-medium block mb-1">Produto</label>
            <select className={inputClass} value={productId} onChange={(e) => setProductId(e.target.value)} required>
              <option value="">Selecionar...</option>
              {products.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </div>
          <div className="grid grid-cols-2 gap-3 sm:gap-4">
            <div>
              <label className="text-sm font-medium block mb-1">Quantidade</label>
              <input type="number" min={0} step="1" className={inputClass} value={quantity} onChange={(e) => setQuantity(Number(e.target.value))} />
            </div>
            <div>
              <label className="text-sm font-medium block mb-1">Valor unitário (R$)</label>
              <input type="number" min={0} step="0.01" className={inputClass} value={unitPrice} onChange={(e) => setUnitPrice(Number(e.target.value))} />
            </div>
          </div>
          <div>
            <label className="text-sm font-medium block mb-1">Observações</label>
            <input className={inputClass} value={notes} onChange={(e) => setNotes(e.target.value)} />
          </div>
          <div className="bg-white rounded-xl px-4 py-3 flex justify-between items-center">
            <span className="text-sm font-medium text-beetz-dark/60">Total</span>
            <span className="font-bold">{currency(quantity * unitPrice)}</span>
          </div>
          <div className="flex justify-end gap-2 pt-1">
            <button type="button" onClick={() => setShowForm(false)} className="text-sm font-semibold text-beetz-dark/50 px-4 py-2">Cancelar</button>
            <button type="submit" disabled={saving || !productId} className="honey-gradient text-beetz-dark font-bold px-5 py-2 rounded-xl text-sm disabled:opacity-60">
              {saving ? 'Salvando...' : 'Salvar produto'}
            </button>
          </div>
        </form>
      )}

      {!loading && pendingFromStock.length > 0 && (
        <div className="bg-beetz-dark text-white rounded-2xl p-4">
          <p className="text-xs font-bold uppercase tracking-wide text-beetz-yellow mb-1">Do estoque do evento</p>
          <p className="text-xs text-white/50 mb-3">
            Itens enviados pela aba Estoque e ainda sem lançamento aqui. Um toque lança com a
            quantidade líquida (enviado − devolvido − consumido) e o custo médio — dá pra ajustar depois.
          </p>
          <div className="space-y-1.5">
            {pendingFromStock.map((line) => (
              <div key={line.product_id} className="flex items-center gap-3 bg-white/10 rounded-xl px-3 py-2">
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold truncate">{productName(line.product_id)}</p>
                  <p className="text-[11px] text-white/50">
                    {line.net} un no evento{avgCosts.has(line.product_id) ? ` · ~${currency(avgCosts.get(line.product_id)!)} un` : ' · sem custo médio ainda'}
                  </p>
                </div>
                <button
                  onClick={() => importFromStock(line)}
                  disabled={importingId === line.product_id}
                  className="text-xs font-bold honey-gradient text-beetz-dark px-3 py-1.5 rounded-lg disabled:opacity-60 shrink-0"
                >
                  {importingId === line.product_id ? '...' : 'Lançar'}
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {!loading && (
        <div className="space-y-2">
          {/* Card inteiro é botão: no dedo, alvo grande; os detalhes e as
              ações (editar/apagar) moram no modal. */}
          {items.map((item) => (
            <button
              key={item.id}
              onClick={() => setSelected(item)}
              className="w-full text-left flex items-center gap-3 bg-white border border-beetz-dark/5 rounded-xl p-4 hover:shadow-glow active:scale-[0.99] transition"
            >
              <div className="flex-1 min-w-0">
                <p className="font-semibold text-sm truncate">{productName(item.product_id)}</p>
                <p className="text-xs text-beetz-dark/50 truncate">
                  {item.quantity} un. × {currency(item.unit_price)}{item.notes ? ` · ${item.notes}` : ''}
                </p>
              </div>
              <span className="font-bold text-sm whitespace-nowrap">{currency(item.total)}</span>
            </button>
          ))}
          {items.length === 0 && <p className="text-sm text-beetz-dark/50">Nenhum produto lançado neste evento ainda.</p>}
        </div>
      )}

      {selected && (
        <EditEventProductModal
          item={selected}
          name={productName(selected.product_id)}
          onClose={() => setSelected(null)}
          onSaved={() => { setSelected(null); load() }}
        />
      )}
    </div>
  )
}

// Modal padrão da casa: detalhes completos + edição com total ao vivo +
// exclusão com confirmação em dois toques, tudo num lugar só.
function EditEventProductModal({ item, name, onClose, onSaved }: {
  item: EventProduct
  name: string
  onClose: () => void
  onSaved: () => void
}) {
  const [quantity, setQuantity] = useState(String(item.quantity))
  const [unitPrice, setUnitPrice] = useState(String(item.unit_price))
  const [notes, setNotes] = useState(item.notes ?? '')
  const [saving, setSaving] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const qty = Number(quantity.replace(',', '.')) || 0
  const price = Number(unitPrice.replace(',', '.')) || 0

  async function handleSave() {
    setSaving(true); setError(null)
    try {
      await updateEventProduct(item.id, { quantity: qty, unit_price: price, notes: notes.trim() || null })
      onSaved()
    } catch (e: any) {
      setError(e?.message ?? 'Não foi possível salvar.')
      setSaving(false)
    }
  }

  async function handleDelete() {
    setSaving(true); setError(null)
    try {
      await deleteEventProduct(item.id)
      onSaved()
    } catch (e: any) {
      setError(e?.message ?? 'Não foi possível excluir.')
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-end sm:items-center justify-center p-0 sm:p-6" onClick={onClose}>
      <div
        className="bg-white w-full sm:max-w-md rounded-t-3xl sm:rounded-3xl p-5 sm:p-6 max-h-[90vh] overflow-y-auto pb-[calc(1.25rem+env(safe-area-inset-bottom))]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3 mb-4">
          <div className="min-w-0">
            <p className="font-bold text-lg leading-tight truncate">{name}</p>
            <p className="text-xs text-beetz-dark/45 mt-0.5">Lançado em {formatDateTime(item.created_at)}</p>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-beetz-gray shrink-0" aria-label="Fechar">
            <X size={18} />
          </button>
        </div>

        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-sm font-medium block mb-1">Quantidade</label>
              <input type="text" inputMode="decimal" className={inputClass} value={quantity} onChange={(e) => setQuantity(e.target.value)} />
            </div>
            <div>
              <label className="text-sm font-medium block mb-1">Valor unitário (R$)</label>
              <input type="text" inputMode="decimal" className={inputClass} value={unitPrice} onChange={(e) => setUnitPrice(e.target.value)} />
            </div>
          </div>
          <div>
            <label className="text-sm font-medium block mb-1">Observações</label>
            <input className={inputClass} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Opcional" />
          </div>
          <div className="bg-beetz-gray rounded-xl px-4 py-3 flex justify-between items-center">
            <span className="text-sm font-medium text-beetz-dark/60">Total</span>
            <span className="font-bold">{currency(qty * price)}</span>
          </div>
        </div>

        {error && <p className="text-sm text-red-600 bg-red-50 border border-red-100 rounded-xl px-3 py-2 mt-3">{error}</p>}

        <div className="flex items-center justify-between gap-2 mt-5">
          {confirmDelete ? (
            <div className="flex items-center gap-1.5">
              <button onClick={handleDelete} disabled={saving}
                className="text-xs font-semibold bg-red-600 text-white px-3 py-2 rounded-xl hover:bg-red-700 disabled:opacity-60">
                {saving ? '...' : 'Confirmar exclusão'}
              </button>
              <button onClick={() => setConfirmDelete(false)} className="text-xs font-semibold text-beetz-dark/50 px-2 py-2">Voltar</button>
            </div>
          ) : (
            <button onClick={() => setConfirmDelete(true)}
              className="flex items-center gap-1.5 text-xs font-semibold text-red-500 hover:text-red-700 px-2 py-2">
              <Trash2 size={14} /> Excluir
            </button>
          )}
          <button onClick={handleSave} disabled={saving}
            className="honey-gradient text-beetz-dark font-bold px-5 py-2.5 rounded-xl text-sm disabled:opacity-60">
            {saving ? 'Salvando...' : 'Salvar'}
          </button>
        </div>
      </div>
    </div>
  )
}
