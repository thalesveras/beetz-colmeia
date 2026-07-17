import { useEffect, useState } from 'react'
import { AlertTriangle } from 'lucide-react'
import { useAuth } from '../../contexts/AuthContext'
import { createStockMovement, getStockBalances, isPositiveMovementType, listEvents, listProducts, listStockLocations } from '../../lib/dataService'
import type { EventItem, MovementType, Product, StockBalance, StockLocation } from '../../lib/types'

const inputClass = 'w-full border border-beetz-dark/15 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-beetz-yellow'
// 'Entrada'/'Saída' genéricos seguem válidos no banco (dados antigos), mas o
// formulário de nova movimentação só oferece os tipos que refletem o fluxo
// real: compra entra, ajuste pode ir pros dois lados, perda sai. "Envio pro
// evento" e "Devolução do evento" não aparecem aqui de propósito — nascem
// automaticamente ao aprovar/devolver uma transferência (aba Transferências).
// Consumo Interno e Quebra entraram na Fase 1 da inteligência de estoque:
// separam "a equipe bebeu/usou" de "quebrou no transporte" — dois números que
// a Perda genérica misturava e que contam histórias diferentes no fechamento.
const movementTypes: MovementType[] = ['Compra', 'Ajuste (entrada)', 'Ajuste (saída)', 'Consumo Interno', 'Quebra', 'Perda']

interface Props {
  fixedEventId?: string
  onSaved: () => void
}

export default function StockMovementForm({ fixedEventId, onSaved }: Props) {
  const { userId } = useAuth()
  const [products, setProducts] = useState<Product[]>([])
  const [locations, setLocations] = useState<StockLocation[]>([])
  const [events, setEvents] = useState<EventItem[]>([])
  const [balances, setBalances] = useState<StockBalance[]>([])
  const [saving, setSaving] = useState(false)

  const [productId, setProductId] = useState('')
  const [locationId, setLocationId] = useState('')
  const [eventId, setEventId] = useState(fixedEventId || '')
  const [movementType, setMovementType] = useState<MovementType>('Compra')
  const [quantity, setQuantity] = useState(1)
  const [unitCost, setUnitCost] = useState('')
  const [notes, setNotes] = useState('')

  useEffect(() => {
    listProducts().then(setProducts)
    listStockLocations().then(setLocations)
    getStockBalances().then(setBalances)
    if (!fixedEventId) listEvents().then(setEvents)
  }, [fixedEventId])

  // Aviso não-bloqueante: mostra o saldo atual quando o tipo escolhido é de
  // saída e a quantidade vai deixar esse produto/estoque negativo. Não
  // impede o registro — às vezes o saldo real já está errado e a
  // movimentação é justamente pra corrigir isso.
  const currentBalance = balances.find((b) => b.product_id === productId && b.stock_location_id === locationId)?.balance ?? 0
  const isOutgoing = !isPositiveMovementType(movementType)
  const resultingBalance = isOutgoing ? currentBalance - quantity : currentBalance + quantity
  const showNegativeWarning = !!(productId && locationId && isOutgoing && quantity > 0 && resultingBalance < 0)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!productId || !locationId || !userId) return
    setSaving(true)
    await createStockMovement({
      product_id: productId,
      stock_location_id: locationId,
      event_id: fixedEventId || eventId || null,
      movement_type: movementType,
      quantity,
      // Preço só em Compra: é o que alimenta o custo médio (product_avg_costs)
      // e, por consequência, o valor do estoque em R$. Vírgula vira ponto
      // porque teclado brasileiro digita "4,50".
      unit_cost: movementType === 'Compra' && unitCost.trim()
        ? Number(unitCost.replace(',', '.')) || null
        : null,
      notes: notes || null,
      created_by: userId
    })
    setSaving(false)
    setProductId(''); setLocationId(''); setQuantity(1); setUnitCost(''); setNotes('')
    if (!fixedEventId) setEventId('')
    onSaved()
  }

  return (
    <form onSubmit={handleSubmit} className="bg-beetz-gray rounded-2xl p-5 space-y-4">
      <div className="grid sm:grid-cols-2 gap-4">
        <div>
          <label className="text-sm font-medium block mb-1">Produto</label>
          <select required className={inputClass} value={productId} onChange={(e) => setProductId(e.target.value)}>
            <option value="">Selecionar...</option>
            {products.map((p) => <option key={p.id} value={p.id}>{p.name} ({p.unit})</option>)}
          </select>
        </div>
        <div>
          <label className="text-sm font-medium block mb-1">Estoque</label>
          <select required className={inputClass} value={locationId} onChange={(e) => setLocationId(e.target.value)}>
            <option value="">Selecionar...</option>
            {locations.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
          </select>
        </div>
      </div>

      <div>
        <label className="text-sm font-medium block mb-1">Tipo</label>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          {movementTypes.map((t) => (
            <button
              type="button" key={t} onClick={() => setMovementType(t)}
              className={`text-sm font-medium px-3 py-2.5 rounded-xl border transition-colors ${
                movementType === t ? 'bg-beetz-yellow border-beetz-yellow text-beetz-dark' : 'border-beetz-dark/15 text-beetz-dark/70 bg-white'
              }`}
            >
              {t}
            </button>
          ))}
        </div>
      </div>

      <div className={movementType === 'Compra' ? 'grid sm:grid-cols-2 gap-4' : ''}>
        <div>
          <label className="text-sm font-medium block mb-1">Quantidade</label>
          <input type="number" min={0.01} step="0.01" required className={inputClass} value={quantity} onChange={(e) => setQuantity(Number(e.target.value))} />
        </div>
        {movementType === 'Compra' && (
          <div>
            <label className="text-sm font-medium block mb-1">Preço unitário (R$)</label>
            <input type="text" inputMode="decimal" placeholder="Ex: 4,50" className={inputClass}
              value={unitCost} onChange={(e) => setUnitCost(e.target.value)} />
            <p className="text-xs text-beetz-dark/40 mt-1">
              Alimenta o custo médio e o valor do estoque. Sem preço, a compra entra só em quantidade.
            </p>
          </div>
        )}
        {showNegativeWarning && (
          <p className="flex items-center gap-1.5 text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 mt-2">
            <AlertTriangle size={13} className="shrink-0" />
            Saldo atual aqui: {currentBalance}. Essa saída vai deixar {resultingBalance} — negativo.
          </p>
        )}
      </div>

      {!fixedEventId && (
        <div>
          <label className="text-sm font-medium block mb-1">Evento (opcional)</label>
          <select className={inputClass} value={eventId} onChange={(e) => setEventId(e.target.value)}>
            <option value="">Nenhum (movimentação avulsa)</option>
            {events.map((ev) => <option key={ev.id} value={ev.id}>{ev.name}</option>)}
          </select>
        </div>
      )}

      <div>
        <label className="text-sm font-medium block mb-1">Observações</label>
        <input className={inputClass} value={notes} onChange={(e) => setNotes(e.target.value)} />
      </div>

      <div className="flex justify-end">
        <button type="submit" disabled={saving} className="honey-gradient text-beetz-dark font-bold px-5 py-2 rounded-xl text-sm disabled:opacity-60">
          {saving ? 'Salvando...' : 'Registrar movimentação'}
        </button>
      </div>
    </form>
  )
}
