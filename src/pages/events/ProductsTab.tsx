import { useEffect, useMemo, useState } from 'react'
import { Plus, Trash2, X } from 'lucide-react'
import {
  createEventProduct, deleteEventProduct, getEventStockByProduct, getProductAvgCosts,
  listEventProducts, listEventSalesLines, listProducts, updateEventProduct
} from '../../lib/dataService'
import type { EventStockLine } from '../../lib/dataService'
import type { EventProduct, EventSalesLine, Product } from '../../lib/types'

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

// A conta do item é calculada sobre o VENDIDO (não sobre o que entrou —
// sobra volta pro estoque e o custo dela não é perdido):
//   venda (vendido × preço) − parte do produtor − custo do vendido = resultado.
// Sem vendido ou sem preço de venda não tem conta — devolve null, não zero.
function lineEconomics(sold: number | null, cost: number, sale: number | null | undefined, pct: number | null | undefined) {
  if (sold == null || sale == null) return { vendaTotal: null, produtor: null, custoVendido: null, resultado: null, margem: null }
  const vendaTotal = sold * sale
  const produtor = vendaTotal * ((pct ?? 0) / 100)
  const custoVendido = sold * cost
  const resultado = vendaTotal - produtor - custoVendido
  const margem = vendaTotal > 0 ? (resultado / vendaTotal) * 100 : null
  return { vendaTotal, produtor, custoVendido, resultado, margem }
}

// Margem UNITÁRIA: não precisa de venda informada — só dos preços.
//   por unidade vendida: venda × (1 − % produtor) − custo.
// É o que responde "esse produto dá dinheiro?" antes do evento começar.
function unitMargin(cost: number, sale: number | null | undefined, pct: number | null | undefined): { value: number; pctOfSale: number | null } | null {
  if (sale == null) return null
  const value = sale * (1 - (pct ?? 0) / 100) - cost
  return { value, pctOfSale: sale > 0 ? (value / sale) * 100 : null }
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
  // Pontes: estoque do evento (líquido por produto) e vendas da máquina
  // (relatório do PDV mapeado) — viram dicas com botão "Usar" no modal.
  const [stockLines, setStockLines] = useState<EventStockLine[]>([])
  const [salesLines, setSalesLines] = useState<EventSalesLine[]>([])
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
    const [eventProducts, allProducts, lines, sales, costs] = await Promise.all([
      listEventProducts(eventId),
      listProducts(),
      getEventStockByProduct(eventId).catch(() => []),
      listEventSalesLines(eventId).catch(() => []),
      getProductAvgCosts().catch(() => new Map<string, number>())
    ])
    setItems(eventProducts)
    setProducts(allProducts)
    setStockLines(lines)
    setSalesLines(sales)
    setAvgCosts(costs)
    setLoading(false)
  }

  // Vendido segundo a máquina, em unidades de estoque (quantidade × un/venda).
  const posSoldByProduct = useMemo(() => {
    const map = new Map<string, number>()
    for (const l of salesLines) {
      if (!l.product_id) continue
      map.set(l.product_id, (map.get(l.product_id) ?? 0) + l.quantity * l.units_per_sale)
    }
    return map
  }, [salesLines])

  const stockNetByProduct = useMemo(
    () => new Map(stockLines.map((l) => [l.product_id, l.net])),
    [stockLines]
  )

  // Enviado pro evento e ainda sem lançamento em Produtos — é o que falta
  // registrar. Um toque preenche a ENTRADA (líquido do estoque) e o custo
  // (custo médio); as vendas são informadas depois, no modal.
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
        sold_quantity: null,
        notes: 'Lançado do estoque do evento'
      })
      await load()
    } finally {
      setImportingId(null)
    }
  }

  useEffect(() => { load() }, [eventId])

  // Totais do evento: custo do que entrou sempre existe; vendas/produtor/
  // resultado somam só quem tem VENDIDO informado + preço de venda.
  const totalCustoEntrada = items.reduce((sum, i) => sum + i.total, 0)
  const withSales = items.filter((i) => i.sold_quantity != null && i.sale_price != null)
  const totalVendas = withSales.reduce((s, i) => s + (i.sold_quantity ?? 0) * (i.sale_price ?? 0), 0)
  const totalProdutor = withSales.reduce((s, i) => s + (i.sold_quantity ?? 0) * (i.sale_price ?? 0) * ((i.producer_percent ?? 0) / 100), 0)
  const totalResultado = withSales.reduce((s, i) => {
    const e = lineEconomics(i.sold_quantity ?? null, i.unit_price, i.sale_price, i.producer_percent)
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
      sold_quantity: null,
      notes: notes || null
    })
    setSaving(false)
    setProductId(''); setQuantity(1); setUnitPrice(0); setSalePrice(''); setNotes('')
    setProducerPercent(defaultProducerPercent != null ? String(defaultProducerPercent) : '')
    setShowForm(false)
    load()
  }

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

      {/* As VENDAS DO EVENTO calculadas pelos produtos: Σ vendido × preço de
          venda. Entrada é outra coluna da vida — o custo do que entrou. */}
      {!loading && items.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <div className="bg-beetz-gray/60 rounded-xl p-3">
            <p className="text-base font-extrabold leading-none">{currency(totalCustoEntrada)}</p>
            <p className="text-[11px] text-beetz-dark/50 mt-1">Custo do que entrou</p>
          </div>
          <div className="bg-beetz-dark text-white rounded-xl p-3">
            <p className="text-base font-extrabold leading-none">{withSales.length > 0 ? currency(totalVendas) : '—'}</p>
            <p className="text-[11px] text-white/50 mt-1">Vendas do evento</p>
          </div>
          <div className="bg-beetz-gray/60 rounded-xl p-3">
            <p className="text-base font-extrabold leading-none">{withSales.length > 0 ? currency(totalProdutor) : '—'}</p>
            <p className="text-[11px] text-beetz-dark/50 mt-1">Produtor leva</p>
          </div>
          <div className={`rounded-xl p-3 ${withSales.length === 0 ? 'bg-beetz-gray/60' : totalResultado >= 0 ? 'bg-green-50' : 'bg-red-50'}`}>
            <p className={`text-base font-extrabold leading-none ${withSales.length === 0 ? '' : totalResultado >= 0 ? 'text-green-700' : 'text-red-600'}`}>
              {withSales.length > 0 ? currency(totalResultado) : '—'}
            </p>
            <p className="text-[11px] text-beetz-dark/50 mt-1">Resultado Beetz</p>
          </div>
        </div>
      )}
      {!loading && items.length > 0 && withSales.length < items.length && (
        <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
          {items.length - withSales.length} produto(s) sem vendas informadas — toque no card, preencha
          "Vendido" (e o preço de venda) pra entrar na conta.
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
              <label className="text-sm font-medium block mb-1">Entrou no evento (un)</label>
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
          <div className="bg-white rounded-xl px-4 py-3 text-sm flex justify-between">
            <span className="text-beetz-dark/60">Custo do que entrou</span>
            <span className="font-semibold">{currency(quantity * unitPrice)}</span>
          </div>
          <p className="text-xs text-beetz-dark/45">As vendas você informa depois, tocando no card do produto — dia a dia, conforme o relatório da máquina.</p>
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
            Itens enviados pela aba Estoque e ainda sem lançamento aqui. Um toque lança a ENTRADA
            (líquido do estoque) com o custo médio — as vendas você informa depois no card.
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

      {!loading && (() => {
        // A leitura que importa: quem dá dinheiro por unidade e quem NÃO dá.
        // Margem negativa primeiro (pior no topo — é o que precisa de decisão:
        // subir preço, renegociar % ou tirar do cardápio), depois as positivas
        // da maior pra menor, e por fim quem ainda está sem preço de venda.
        const withMargin = items.map((item) => ({
          item,
          um: unitMargin(item.unit_price, item.sale_price, item.producer_percent),
          econ: lineEconomics(item.sold_quantity ?? null, item.unit_price, item.sale_price, item.producer_percent)
        }))
        const negatives = withMargin.filter((x) => x.um != null && x.um.value < 0).sort((a, b) => a.um!.value - b.um!.value)
        const positives = withMargin.filter((x) => x.um != null && x.um.value >= 0).sort((a, b) => b.um!.value - a.um!.value)
        const noPrice = withMargin.filter((x) => x.um == null)
        const ordered = [...negatives, ...positives, ...noPrice]
        return (
        <div className="space-y-2">
          <div className="flex flex-wrap gap-1.5">
            {negatives.length > 0 && (
              <span className="text-[11px] font-bold bg-red-50 text-red-700 border border-red-200 px-2.5 py-1 rounded-full">
                {negatives.length} com margem negativa
              </span>
            )}
            {positives.length > 0 && (
              <span className="text-[11px] font-bold bg-green-50 text-green-700 border border-green-200 px-2.5 py-1 rounded-full">
                {positives.length} com margem positiva
              </span>
            )}
            {noPrice.length > 0 && (
              <span className="text-[11px] font-semibold bg-beetz-gray text-beetz-dark/60 px-2.5 py-1 rounded-full">
                {noPrice.length} sem preço de venda
              </span>
            )}
          </div>

          {/* Card inteiro é botão: no dedo, alvo grande; os detalhes e as
              ações (editar/apagar) moram no modal. */}
          {ordered.map(({ item, um, econ }) => (
            <button
              key={item.id}
              onClick={() => setSelected(item)}
              className={`w-full text-left flex items-center gap-3 bg-white border rounded-xl p-4 hover:shadow-glow active:scale-[0.99] transition ${
                um != null && um.value < 0 ? 'border-red-200' : 'border-beetz-dark/5'
              }`}
            >
              <div className="flex-1 min-w-0">
                <p className="font-semibold text-sm truncate">{productName(item.product_id)}</p>
                <p className="text-xs text-beetz-dark/50 truncate">
                  entrou {item.quantity} · vendido {item.sold_quantity ?? '—'}
                  {item.sale_price != null ? ` · venda ${currency(item.sale_price)}` : ''}
                  {` · custo ${currency(item.unit_price)}`}
                  {item.producer_percent != null ? ` · produtor ${item.producer_percent}%` : ''}
                </p>
              </div>
              {econ.resultado != null ? (
                <div className="text-right shrink-0">
                  <span className={`font-bold text-sm ${econ.resultado >= 0 ? 'text-green-700' : 'text-red-600'}`}>
                    {econ.resultado >= 0 ? '+' : ''}{currency(econ.resultado)}
                  </span>
                  <p className="text-[10px] text-beetz-dark/40 leading-tight">
                    {um != null ? `${um.value >= 0 ? '+' : ''}${currency(um.value)}/un` : 'resultado'}
                  </p>
                </div>
              ) : um != null ? (
                <div className="text-right shrink-0">
                  <span className={`font-bold text-sm ${um.value >= 0 ? 'text-green-700' : 'text-red-600'}`}>
                    {um.value >= 0 ? '+' : ''}{currency(um.value)}/un
                  </span>
                  <p className="text-[10px] text-beetz-dark/40 leading-tight">
                    {um.pctOfSale != null ? `${Math.round(um.pctOfSale)}% da venda fica` : 'margem unitária'}
                  </p>
                </div>
              ) : (
                <span className="text-[11px] font-semibold text-amber-700 bg-amber-50 border border-amber-200 px-2 py-1 rounded-lg shrink-0">
                  sem preço de venda
                </span>
              )}
            </button>
          ))}
          {items.length === 0 && <p className="text-sm text-beetz-dark/50">Nenhum produto lançado neste evento ainda.</p>}
        </div>
        )
      })()}

      {selected && (
        <EditEventProductModal
          item={selected}
          name={productName(selected.product_id)}
          defaultProducerPercent={defaultProducerPercent ?? null}
          stockNet={stockNetByProduct.get(selected.product_id) ?? null}
          posSold={posSoldByProduct.get(selected.product_id) ?? null}
          onClose={() => setSelected(null)}
          onSaved={() => { setSelected(null); load() }}
        />
      )}
    </div>
  )
}

// Modal padrão da casa: ENTROU (das movimentações) e VENDIDO (informado) são
// campos separados — a conta é sobre o vendido. As duas pontes viram dicas
// com "Usar": o estoque do evento sugere a entrada, a máquina sugere a venda.
function EditEventProductModal({ item, name, defaultProducerPercent, stockNet, posSold, onClose, onSaved }: {
  item: EventProduct
  name: string
  defaultProducerPercent: number | null
  stockNet: number | null
  posSold: number | null
  onClose: () => void
  onSaved: () => void
}) {
  const [quantity, setQuantity] = useState(String(item.quantity))
  const [soldQty, setSoldQty] = useState(item.sold_quantity != null ? String(item.sold_quantity) : '')
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
  const sold = soldQty.trim() ? parseNum(soldQty) : null
  const cost = parseNum(unitPrice)
  const sale = salePrice.trim() ? parseNum(salePrice) : null
  const pct = producerPercent.trim() ? parseNum(producerPercent) : null
  const econ = lineEconomics(sold, cost, sale, pct)

  async function handleSave() {
    setSaving(true); setError(null)
    try {
      await updateEventProduct(item.id, {
        quantity: qty, unit_price: cost, sale_price: sale, producer_percent: pct,
        sold_quantity: sold, notes: notes.trim() || null
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
              <label className="text-sm font-medium block mb-1">Entrou no evento (un)</label>
              <input type="text" inputMode="decimal" className={inputClass} value={quantity} onChange={(e) => setQuantity(e.target.value)} />
              {stockNet != null && stockNet !== qty && (
                <button type="button" onClick={() => setQuantity(String(stockNet))} className="text-[11px] font-semibold text-beetz-dark/50 hover:text-beetz-dark mt-1 underline">
                  Movimentações dizem {stockNet} — usar
                </button>
              )}
            </div>
            <div>
              <label className="text-sm font-medium block mb-1">Vendido (un)</label>
              <input type="text" inputMode="decimal" placeholder="Informe as vendas" className={inputClass} value={soldQty} onChange={(e) => setSoldQty(e.target.value)} />
              {posSold != null && posSold > 0 && posSold !== sold && (
                <button type="button" onClick={() => setSoldQty(String(Number.isInteger(posSold) ? posSold : posSold.toFixed(1)))} className="text-[11px] font-semibold text-beetz-dark/50 hover:text-beetz-dark mt-1 underline">
                  Máquina diz {Number.isInteger(posSold) ? posSold : posSold.toFixed(1)} — usar
                </button>
              )}
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
            <div>
              <label className="text-sm font-medium block mb-1">Observações</label>
              <input className={inputClass} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Opcional" />
            </div>
          </div>

          {/* A conta ao vivo, SOBRE O VENDIDO. A sobra (entrou − vendido)
              volta pro estoque — não é custo perdido, por isso fica fora. */}
          <div className="bg-beetz-gray rounded-xl px-4 py-3 space-y-1.5 text-sm">
            {econ.vendaTotal != null ? (
              <>
                <div className="flex justify-between">
                  <span className="text-beetz-dark/60">Venda total ({sold} × {currency(sale ?? 0)})</span>
                  <span className="font-semibold">{currency(econ.vendaTotal)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-beetz-dark/60">Produtor leva ({pct ?? 0}%)</span>
                  <span className="font-semibold">− {currency(econ.produtor ?? 0)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-beetz-dark/60">Custo do vendido ({sold} × {currency(cost)})</span>
                  <span className="font-semibold">− {currency(econ.custoVendido ?? 0)}</span>
                </div>
                <div className="flex justify-between border-t border-beetz-dark/10 pt-1.5">
                  <span className="font-bold">Resultado Beetz</span>
                  <span className={`font-bold ${(econ.resultado ?? 0) >= 0 ? 'text-green-700' : 'text-red-600'}`}>
                    {currency(econ.resultado ?? 0)}{econ.margem != null ? ` (${Math.round(econ.margem)}%)` : ''}
                  </span>
                </div>
                {sold != null && (
                  <p className="text-[11px] text-beetz-dark/45 pt-1">
                    Sobra estimada: {qty} − {sold} = {qty - sold} un (volta pro estoque — não entra no custo).
                  </p>
                )}
              </>
            ) : (() => {
              const um = unitMargin(cost, sale, pct)
              return um != null ? (
                <>
                  <div className="flex justify-between">
                    <span className="text-beetz-dark/60">Margem por unidade vendida</span>
                    <span className={`font-bold ${um.value >= 0 ? 'text-green-700' : 'text-red-600'}`}>
                      {um.value >= 0 ? '+' : ''}{currency(um.value)}{um.pctOfSale != null ? ` (${Math.round(um.pctOfSale)}%)` : ''}
                    </span>
                  </div>
                  <p className="text-[11px] text-beetz-dark/45">
                    {currency(sale ?? 0)} de venda − {pct ?? 0}% do produtor − {currency(cost)} de custo.
                    Preencha <span className="font-semibold">Vendido</span> pra ver o resultado total.
                  </p>
                </>
              ) : (
                <p className="text-xs text-beetz-dark/45">
                  Preencha o <span className="font-semibold">preço de venda</span> pra ver a margem por unidade,
                  e <span className="font-semibold">Vendido</span> pra ver o resultado total.
                </p>
              )
            })()}
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
