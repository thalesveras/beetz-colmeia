import { useEffect, useState } from 'react'
import { Plus } from 'lucide-react'
import {
  approveTransferRequest, createTransferRequest, listProducts, listStockLocations, listTransferRequests,
  registerTransferReturn, updateTransferRequestStatus
} from '../../lib/dataService'
import type { Product, StockLocation, TransferRequest, TransferRequestStatus } from '../../lib/types'
import { useAuth } from '../../contexts/AuthContext'

const inputClass = 'w-full border border-beetz-dark/15 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-beetz-yellow'

const statuses: TransferRequestStatus[] = ['Pendente', 'Aprovado', 'Negado']

const statusColors: Record<TransferRequestStatus, string> = {
  Pendente: 'bg-beetz-yellow/30 text-beetz-dark',
  Aprovado: 'bg-green-100 text-green-700',
  Negado: 'bg-red-100 text-red-700'
}

export default function TransferRequestsTab({ eventId, canApprove }: { eventId: string; canApprove: boolean }) {
  const { userId } = useAuth()
  const [items, setItems] = useState<TransferRequest[]>([])
  const [products, setProducts] = useState<Product[]>([])
  const [locations, setLocations] = useState<StockLocation[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [saving, setSaving] = useState(false)

  const [productId, setProductId] = useState('')
  const [quantity, setQuantity] = useState(1)
  const [fromLocationId, setFromLocationId] = useState('')
  const [toLocationId, setToLocationId] = useState('')
  const [requestedBy, setRequestedBy] = useState('')
  const [notes, setNotes] = useState('')

  async function load() {
    setLoading(true)
    const [requests, allProducts, allLocations] = await Promise.all([
      listTransferRequests(eventId), listProducts(), listStockLocations()
    ])
    setItems(requests)
    setProducts(allProducts)
    setLocations(allLocations)
    setLoading(false)
  }

  useEffect(() => { load() }, [eventId])

  const productName = (id: string) => products.find((p) => p.id === id)?.name ?? '—'
  const locationName = (id: string | null) => locations.find((l) => l.id === id)?.name ?? '—'

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!productId) return
    setSaving(true)
    await createTransferRequest({
      event_id: eventId, product_id: productId, quantity,
      from_location_id: fromLocationId || null, to_location_id: toLocationId || null,
      requested_by: requestedBy || null, notes: notes || null
    })
    setSaving(false)
    setProductId(''); setQuantity(1); setFromLocationId(''); setToLocationId(''); setRequestedBy(''); setNotes('')
    setShowForm(false)
    load()
  }

  // Aprovar gera a movimentação real de saída do estoque central (ver
  // approveTransferRequest) — negar só muda o status, sem mexer no saldo.
  async function handleStatusChange(t: TransferRequest, status: TransferRequestStatus) {
    if (status === 'Aprovado') {
      await approveTransferRequest(t, userId)
    } else {
      await updateTransferRequestStatus(t.id, status)
    }
    load()
  }

  const [returnQtyById, setReturnQtyById] = useState<Record<string, number>>({})
  const [savingReturnId, setSavingReturnId] = useState<string | null>(null)

  async function handleRegisterReturn(t: TransferRequest) {
    const qty = returnQtyById[t.id] ?? 0
    if (qty <= 0) return
    setSavingReturnId(t.id)
    await registerTransferReturn(t, qty, userId)
    setSavingReturnId(null)
    setReturnQtyById((prev) => ({ ...prev, [t.id]: 0 }))
    load()
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <p className="text-sm text-beetz-dark/60">
          {loading ? 'Carregando...' : `${items.length} solicitação(ões)`}
        </p>
        <button
          onClick={() => setShowForm((v) => !v)}
          className="flex items-center gap-1.5 text-sm font-semibold bg-beetz-dark text-white px-3 py-2 rounded-xl hover:bg-black transition-colors"
        >
          <Plus size={16} /> Nova solicitação
        </button>
      </div>

      {showForm && (
        <form onSubmit={handleSubmit} className="bg-beetz-gray rounded-2xl p-5 space-y-4">
          <div className="grid sm:grid-cols-2 gap-4">
            <div>
              <label className="text-sm font-medium block mb-1">Produto</label>
              <select className={inputClass} value={productId} onChange={(e) => setProductId(e.target.value)} required>
                <option value="">Selecionar...</option>
                {products.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
            </div>
            <div>
              <label className="text-sm font-medium block mb-1">Quantidade</label>
              <input type="number" min={0} step="1" className={inputClass} value={quantity} onChange={(e) => setQuantity(Number(e.target.value))} />
            </div>
          </div>
          <div className="grid sm:grid-cols-2 gap-4">
            <div>
              <label className="text-sm font-medium block mb-1">De (estoque de origem)</label>
              <select className={inputClass} value={fromLocationId} onChange={(e) => setFromLocationId(e.target.value)}>
                <option value="">Selecionar...</option>
                {locations.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
              </select>
            </div>
            <div>
              <label className="text-sm font-medium block mb-1">Para (estoque de destino)</label>
              <select className={inputClass} value={toLocationId} onChange={(e) => setToLocationId(e.target.value)}>
                <option value="">Selecionar...</option>
                {locations.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
              </select>
            </div>
          </div>
          <div>
            <label className="text-sm font-medium block mb-1">Solicitado por</label>
            <input className={inputClass} placeholder="Nome de quem está pedindo" value={requestedBy} onChange={(e) => setRequestedBy(e.target.value)} />
          </div>
          <div>
            <label className="text-sm font-medium block mb-1">Observações</label>
            <input className={inputClass} value={notes} onChange={(e) => setNotes(e.target.value)} />
          </div>
          <div className="flex justify-end gap-2 pt-1">
            <button type="button" onClick={() => setShowForm(false)} className="text-sm font-semibold text-beetz-dark/50 px-4 py-2">Cancelar</button>
            <button type="submit" disabled={saving || !productId} className="honey-gradient text-beetz-dark font-bold px-5 py-2 rounded-xl text-sm disabled:opacity-60">
              {saving ? 'Salvando...' : 'Enviar solicitação'}
            </button>
          </div>
        </form>
      )}

      {!loading && (
        <div className="space-y-2">
          {items.map((item) => (
            <div key={item.id} className="flex flex-wrap items-center gap-3 bg-white border border-beetz-dark/5 rounded-xl p-4">
              {canApprove ? (
                <select
                  value={item.status}
                  onChange={(e) => handleStatusChange(item, e.target.value as TransferRequestStatus)}
                  className={`text-xs font-semibold px-2.5 py-1 rounded-full border-0 ${statusColors[item.status]}`}
                >
                  {statuses.map((s) => <option key={s} value={s}>{s}</option>)}
                </select>
              ) : (
                <span className={`text-xs font-semibold px-2.5 py-1 rounded-full ${statusColors[item.status]}`}>{item.status}</span>
              )}
              <div className="flex-1 min-w-[160px]">
                <p className="font-semibold text-sm">{productName(item.product_id)} · {item.quantity}</p>
                <p className="text-xs text-beetz-dark/50">
                  {locationName(item.from_location_id)} → {locationName(item.to_location_id)}
                  {item.requested_by ? ` · Pedido por: ${item.requested_by}` : ''}
                  {item.notes ? ` · ${item.notes}` : ''}
                </p>
              </div>
              {item.status === 'Aprovado' && canApprove && (
                item.returned_quantity != null ? (
                  <span className="text-xs font-semibold text-green-700 bg-green-50 px-2.5 py-1.5 rounded-lg shrink-0">
                    Devolvido: {item.returned_quantity}
                  </span>
                ) : (
                  <div className="flex items-center gap-1.5 shrink-0">
                    <input
                      type="number" min={0} step="0.01" placeholder="Sobra"
                      className="w-20 border border-beetz-dark/15 rounded-lg px-2 py-1.5 text-xs"
                      value={returnQtyById[item.id] || ''}
                      onChange={(e) => setReturnQtyById((prev) => ({ ...prev, [item.id]: Number(e.target.value) }))}
                    />
                    <button
                      onClick={() => handleRegisterReturn(item)}
                      disabled={savingReturnId === item.id || !(returnQtyById[item.id] > 0)}
                      className="text-xs font-semibold px-2.5 py-1.5 rounded-lg bg-beetz-dark text-white hover:bg-black transition-colors disabled:opacity-50"
                    >
                      {savingReturnId === item.id ? 'Salvando...' : 'Registrar devolução'}
                    </button>
                  </div>
                )
              )}
            </div>
          ))}
          {items.length === 0 && <p className="text-sm text-beetz-dark/50">Registros não encontrados.</p>}
        </div>
      )}
    </div>
  )
}
