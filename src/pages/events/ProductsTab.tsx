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

function parseNum(s: string): number {
  return Number(s.replace(',', '.')) || 0
}

// A conta que responde "estamos ganhando dinheiro nesse item?":
//   venda total − parte do produtor − custo total = resultado Beetz.
// Sem preço de venda não tem conta — devolve null em vez de fingir zero.
// % do produtor ausente conta como 0% (tudo da venda fica com a Beetz).
function lineEconomics(qty: number, cost: number, sale: number | null | undefined, pct: number | null | undefined) {
  const custoTotal = qty * cost
  if (sale == null) return { custoTotal, vendaTotal: null, produtor: null, resultado: null, margem: null }
  const vendaTotal = qty * sale
  const produtor = vendaTotal * ((pct ?? 0) / 100)
  const resultado = vendaTotal - produtor - custoTotal
  const margem = vendaTotal > 0 ? (resultado / vendaTotal) * 100 : null
  return { custoTotal, vendaTotal, produtor, resultado, margem }
}

export default function ProductsTab({ eventId, defaultProducerPercent }: {
  eventId: string
  defaultProducerPercent?: number | null
}) {
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
  const [salePrice, setSalePrice] = useState('')
  const [producerPercent, setProducerPercent] = useState('')
  const [notes, setNotes] = useState('')

  // O % padrão (100 − comissão Beetz do evento) chega async — preenche o campo
  // enquanto o usuário ainda não digitou nada nele.
  useEffect(() => {
    if (defaultProducerPercent != null) setProducerPercent((cur) => (cur === '' ? String(defaultProducerPercent) : cur))
  }, [defaultProducerPercent])

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
  // registrar. Um toque preenche quantidade (líquido do estoque) e custo
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
        sale_price: null,
        producer_percent: defaultProducerPercent ?? null,
        notes: 'Lançado do estoque do evento'
      })
      await load()
    } finally {
      setImportingId(null)
    }
  }

  useEffect(() => { load() }, [eventId])

  // Totais do evento: custo sempre existe; venda/produtor/resultado só somam
  // os itens que têm preço de venda — melhor um total parcial e honesto.
  const totalCusto = items.reduce((sum, i) => sum + i.total, 0)
  const withSale = items.filter((i) => i.sale_price != null)
  const totalVenda = withSale.reduce((s, i) => s + i.quantity * (i.sale_price ?? 0), 0)
  const totalProdutor = withSale.reduce((s, i) => s + i.quantity * (i.sale_price ?? 0) * ((i.producer_percent ?? 0) / 100), 0)
  const totalResultado = withSale.reduce((s, i) => {
    const e = lineEconomics(i.quantity, i.unit_price, i.sale_price, i.producer_percent)
    return s + (e.resultado ?? 0)
  }, 0)

  const productName = (id: string) => products.find((p) => p.id === id)?.name ?? '—'

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!productId) return
    setSaving(true)
    await createEventProduct({
      event_id: eventId, product_id: productId, quantity, unit_price: unitPrice,
      sale_price: salePrice.trim() ? parseNum(salePrice) : null,
      producer_percent: producerPercent.trim() ? parseNum(producerPercent) : null,
      notes: notes || null
    })
    setSaving(false)
    setProductId(''); setQuantity(1); setUnitPrice(0); setSalePrice(''); setNotes('')
    setProducerPercent(defaultProducerPercent != null ? String(defaultProducerPercent) : '')
    setShowForm(false)
    load()
  }

  const formEcon = lineEconomics(quantity, unitPrice, salePrice.trim() ? parseNum(salePrice) : null, producerPercent.trim() ? parseNum(producerPercent) : null)

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-beetz-dark/60">
          {loading ? 'Carregando...' : `${items.length} produto(s)`}
        </p>
        <button
          onClick={() => setShowForm((v) => !v)}
          className="flex items-center gap-1.5 text-sm font-semibold bg-beetz-dark text-white px-3 py-2 rounded-xl hover:bg-black transition-colors"
        >
          <Plus size={16} /> Novo produto
        </button>
      </div>

      {/* A razão de existir da aba: estamos ganhando dinheiro? Custo é a soma
          cheia; venda/produtor/resultado somam só itens com preço de venda. */}
      {!loading && items.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <div className="bg-beetz-gray/60 rounded-xl p-3">
            <p className="text-base font-extrabold leading-none">{currency(totalCusto)}</p>
            <p className="text-[11px] text-beetz-dark/50 mt-1">Custo total</p>
          </div>
          <div className="bg-beetz-gray/60 rounded-xl p-3">
            <p className="text-base font-extrabold leading-none">{withSale.length > 0 ? currency(totalVenda) : '—'}</p>
            <p className="text-[11px] text-beetz-dark/50 mt-1">Venda prevista</p>
          </div>
          <div className="bg-beetz-gray/60 rounded-xl p-3">
            <p className="text-base font-extrabold leading-none">{withSale.length > 0 ? currency(totalProdutor) : '—'}</p>
            <p className="text-[11px] text-beetz-dark/50 mt-1">Produtor leva</p>
          </div>
          <div className={`rounded-xl p-3 ${withSale.length === 0 ? 'bg-beetz-gray/60' : totalResultado >= 0 ? 'bg-green-50' : 'bg-red-50'}`}>
            <p className={`text-base font-extrabold leading-none ${withSale.length === 0 ? '' : totalResultado >= 0 ? 'text-green-700' : 'text-red-600'}`}>
              {withSale.length > 0 ? currency(totalResultado) : '—'}
            </p>
            <p className="text-[11px] text-beetz-dark/50 mt-1">Resultado Beetz</p>
          </div>
        </div>
      )}
      {!loading && items.length > 0 && withSale.length < items.length && (
        <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
          {items.length - withSale.length} produto(s) ainda sem preço de venda — toque no card pra completar e entrar na conta.
        </p>
      )}

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
              <label className="text-sm font-medium block mb-1">Preço de custo (R$)</label>
              <input type="number" min={0} step="0.01" className={inputClass} value={unitPrice} onChange={(e) => setUnitPrice(Number(e.target.value))} />
            </div>
            <div>
              <label className="text-sm font-medium block mb-1">Preço de venda (R$)</label>
              <input type="text" inputMode="decimal" placeholder="Ex: 15,00" className={inputClass} value={salePrice} onChange={(e) => setSalePrice(e.target.value)} />
            </div>
            <div>
              <label className="text-sm font-medium block mb-1">% do produtor</label>
              <input type="text" inputMode="decimal" placeholder="Ex: 80" className={inputClass} value={producerPercent} onChange={(e) => setProducerPercent(e.target.value)} />
            </div>
          </div>
          <div>
            <label className="text-sm font-medium block mb-1">Observações</label>
            <input className={inputClass} value={notes} onChange={(e) => setNotes(e.target.value)} />
          </div>
          <div className="bg-white rounded-xl px-4 py-3 space-y-1.5 text-sm">
            <div className="flex justify-between"><span className="text-beetz-dark/60">Custo total</span><span className="font-semibold">{currency(formEcon.custoTotal)}</span></div>
            {formEcon.vendaTotal != null && (
              <>
                <div className="flex justify-between"><span className="text-beetz-dark/60">Venda total</span><span className="font-semibold">{currency(formEcon.vendaTotal)}</span></div>
                <div className="flex justify-between"><span className="text-beetz-dark/60">Produtor leva</span><span className="font-semibold">{currency(formEcon.produtor ?? 0)}</span></div>
                <div className="flex justify-between border-t border-beetz-dark/10 pt-1.5">
                  <span className="font-semibold">Resultado Beetz</span>
                  <span className={`font-bold ${(formEcon.resultado ?? 0) >= 0 ? 'text-green-700' : 'text-red-600'}`}>{currency(formEcon.resultado ?? 0)}</span>
                </div>
              </>
            )}
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
            quantidade líquida (enviado − devolvido − consumido) e o custo médio — depois toque
            no card pra colocar o preço de venda.
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
          {items.map((item) => {
            const e = lineEconomics(item.quantity, item.unit_price, item.sale_price, item.producer_percent)
            return (
            <button
              key={item.id}
              onClick={() => setSelected(item)}
              className="w-full text-left flex items-center gap-3 bg-white border border-beetz-dark/5 rounded-xl p-4 hover:shadow-glow active:scale-[0.99] transition"
            >
              <div className="flex-1 min-w-0">
                <p className="font-semibold text-sm truncate">{productName(item.product_id)}</p>
                <p className="text-xs text-beetz-dark/50 truncate">
                  {item.quantity} un. · custo {currency(item.unit_price)}
                  {item.sale_price != null ? ` · venda ${currency(item.sale_price)}` : ''}
                  {item.producer_percent != null ? ` · produtor ${item.producer_percent}%` : ''}
                </p>
              </div>
              {e.resultado != null ? (
                <div className="text-right shrink-0">
                  <span className={`font-bold text-sm ${e.resultado >= 0 ? 'text-green-700' : 'text-red-600'}`}>
                    {e.resultado >= 0 ? '+' : ''}{currency(e.resultado)}
                  </span>
                  <p className="text-[10px] text-beetz-dark/40 leading-tight">{e.margem != null ? `${Math.round(e.margem)}% da venda` : 'resultado'}</p>
                </div>
              ) : (
                <span className="text-[11px] font-semibold text-amber-700 bg-amber-50 border border-amber-200 px-2 py-1 rounded-lg shrink-0">
                  sem preço de venda
                </span>
              )}
            </button>
          )})}
          {items.length === 0 && <p className="text-sm text-beetz-dark/50">Nenhum produto lançado neste evento ainda.</p>}
        </div>
      )}

      {selected && (
        <EditEventProductModal
          item={selected}
          name={productName(selected.product_id)}
          defaultProducerPercent={defaultProducerPercent ?? null}
          onClose={() => setSelected(null)}
          onSaved={() => { setSelected(null); load() }}
        />
      )}
    </div>
  )
}

// Modal padrão da casa: detalhes completos + edição com a conta ao vivo +
// exclusão com confirmação em dois toques, tudo num lugar só. A conta aqui é
// A resposta da aba: venda − produtor − custo = quanto sobra pra Beetz.
function EditEventProductModal({ item, name, defaultProducerPercent, onClose, onSaved }: {
  item: EventProduct
  name: string
  defaultProducerPercent: number | null
  onClose: () => void
  onSaved: () => void
}) {
  const [quantity, setQuantity] = useState(String(item.quantity))
  const [unitPrice, setUnitPrice] = useState(String(item.unit_price))
  const [salePrice, setSalePrice] = useState(item.sale_price != null ? String(item.sale_price) : '')
  const [producerPercent, setProducerPercent] = useState(
    item.producer_percent != null ? String(item.producer_percent)
      : defaultProducerPercent != null ? String(defaultProducerPercent) : ''
  )
  const [notes, setNotes] = useState(item.notes ?? '')
  const [saving, setSaving] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const qty = parseNum(quantity)
  const cost = parseNum(unitPrice)
  const sale = salePrice.trim() ? parseNum(salePrice) : null
  const pct = producerPercent.trim() ? parseNum(producerPercent) : null
  const econ = lineEconomics(qty, cost, sale, pct)

  async function handleSave() {
    setSaving(true); setError(null)
    try {
      await updateEventProduct(item.id, {
        quantity: qty, unit_price: cost, sale_price: sale, producer_percent: pct,
        notes: notes.trim() || null
      })
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
              <label className="text-sm font-medium block mb-1">Preço de custo (R$)</label>
              <input type="text" inputMode="decimal" className={inputClass} value={unitPrice} onChange={(e) => setUnitPrice(e.target.value)} />
            </div>
            <div>
              <label className="text-sm font-medium block mb-1">Preço de venda (R$)</label>
              <input type="text" inputMode="decimal" placeholder="Ex: 15,00" className={inputClass} value={salePrice} onChange={(e) => setSalePrice(e.target.value)} />
            </div>
            <div>
              <label className="text-sm font-medium block mb-1">% do produtor</label>
              <input type="text" inputMode="decimal" placeholder="Ex: 80" className={inputClass} value={producerPercent} onChange={(e) => setProducerPercent(e.target.value)} />
            </div>
          </div>
          <div>
            <label className="text-sm font-medium block mb-1">Observações</label>
            <input className={inputClass} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Opcional" />
          </div>

          {/* A conta ao vivo. Verde/vermelho no resultado é o que responde a
              pergunta sem precisar de calculadora do lado. */}
          <div className="bg-beetz-gray rounded-xl px-4 py-3 space-y-1.5 text-sm">
            <div className="flex justify-between">
              <span className="text-beetz-dark/60">Custo total ({qty} × {currency(cost)})</span>
              <span className="font-semibold">{currency(econ.custoTotal)}</span>
            </div>
            {econ.vendaTotal != null ? (
              <>
                <div className="flex justify-between">
                  <span className="text-beetz-dark/60">Venda total ({qty} × {currency(sale ?? 0)})</span>
                  <span className="font-semibold">{currency(econ.vendaTotal)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-beetz-dark/60">Produtor leva ({pct ?? 0}%)</span>
                  <span className="font-semibold">− {currency(econ.produtor ?? 0)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-beetz-dark/60">Custo</span>
                  <span className="font-semibold">− {currency(econ.custoTotal)}</span>
                </div>
                <div className="flex justify-between border-t border-beetz-dark/10 pt-1.5">
                  <span className="font-bold">Resultado Beetz</span>
                  <span className={`font-bold ${(econ.resultado ?? 0) >= 0 ? 'text-green-700' : 'text-red-600'}`}>
                    {currency(econ.resultado ?? 0)}{econ.margem != null ? ` (${Math.round(econ.margem)}%)` : ''}
                  </span>
                </div>
              </>
            ) : (
              <p className="text-xs text-beetz-dark/45">Preencha o preço de venda pra ver a conta completa (venda − produtor − custo).</p>
            )}
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
