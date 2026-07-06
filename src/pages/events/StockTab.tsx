import { useEffect, useState } from 'react'
import { Plus, Pencil, Ban, RotateCcw, Check } from 'lucide-react'
import { listProducts, listStockLocations, listStockMovements, updateStockMovement } from '../../lib/dataService'
import type { Product, StockLocation, StockMovement } from '../../lib/types'
import StockMovementForm from '../../components/stock/StockMovementForm'
import { useAuth } from '../../contexts/AuthContext'
import { canEditStock } from '../../lib/permissions'

export default function StockTab({ eventId }: { eventId: string }) {
  const { accessRole } = useAuth()
  const [movements, setMovements] = useState<StockMovement[]>([])
  const [products, setProducts] = useState<Product[]>([])
  const [locations, setLocations] = useState<StockLocation[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editQuantity, setEditQuantity] = useState(0)

  async function load() {
    setLoading(true)
    const [m, p, l] = await Promise.all([listStockMovements(eventId), listProducts(), listStockLocations()])
    setMovements(m)
    setProducts(p)
    setLocations(l)
    setLoading(false)
  }

  useEffect(() => { load() }, [eventId])

  const productName = (id: string) => products.find((p) => p.id === id)?.name ?? '—'
  const locationName = (id: string) => locations.find((l) => l.id === id)?.name ?? '—'

  function startEdit(m: StockMovement) {
    setEditingId(m.id)
    setEditQuantity(m.quantity)
  }

  async function saveEdit(id: string) {
    await updateStockMovement(id, { quantity: editQuantity })
    setEditingId(null)
    load()
  }

  async function toggleStatus(m: StockMovement) {
    await updateStockMovement(m.id, { status: m.status === 'Cancelado' ? 'Ativo' : 'Cancelado' })
    load()
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <p className="text-sm text-beetz-dark/60">{loading ? 'Carregando...' : `${movements.length} movimentação(ões) neste evento`}</p>
        <button
          onClick={() => setShowForm((v) => !v)}
          className="flex items-center gap-1.5 text-sm font-semibold bg-beetz-dark text-white px-3 py-2 rounded-xl hover:bg-black transition-colors"
        >
          <Plus size={16} /> Nova movimentação
        </button>
      </div>

      {showForm && <StockMovementForm fixedEventId={eventId} onSaved={() => { setShowForm(false); load() }} />}

      {!loading && (
        <div className="space-y-2">
          {movements.map((m) => (
            <div key={m.id} className={`flex items-center gap-3 bg-white border border-beetz-dark/5 rounded-xl p-4 ${m.status === 'Cancelado' ? 'opacity-50' : ''}`}>
              <span className={`text-xs font-semibold px-2.5 py-1 rounded-full ${m.movement_type === 'Entrada' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                {m.movement_type}
              </span>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold">{productName(m.product_id)}</p>
                <p className="text-xs text-beetz-dark/50">
                  {locationName(m.stock_location_id)} {m.notes ? `· ${m.notes}` : ''} {m.status === 'Cancelado' ? '· Cancelado' : ''}
                </p>
              </div>
              {editingId === m.id ? (
                <div className="flex items-center gap-1.5">
                  <input
                    type="number" min={0} value={editQuantity} onChange={(e) => setEditQuantity(Number(e.target.value))}
                    className="w-20 border border-beetz-dark/15 rounded-lg px-2 py-1 text-sm"
                  />
                  <button onClick={() => saveEdit(m.id)} className="text-green-600 p-1.5 rounded-lg hover:bg-green-50"><Check size={14} /></button>
                </div>
              ) : (
                <span className="font-bold text-sm">{m.quantity}</span>
              )}
              {canEditStock(accessRole) && editingId !== m.id && (
                <div className="flex items-center gap-1">
                  <button onClick={() => startEdit(m)} className="text-beetz-dark/40 hover:text-beetz-dark p-1.5 rounded-lg hover:bg-beetz-gray">
                    <Pencil size={14} />
                  </button>
                  <button
                    onClick={() => toggleStatus(m)}
                    className="text-beetz-dark/40 hover:text-beetz-dark p-1.5 rounded-lg hover:bg-beetz-gray"
                    title={m.status === 'Cancelado' ? 'Reativar' : 'Cancelar'}
                  >
                    {m.status === 'Cancelado' ? <RotateCcw size={14} /> : <Ban size={14} />}
                  </button>
                </div>
              )}
            </div>
          ))}
          {movements.length === 0 && <p className="text-sm text-beetz-dark/50">Nenhuma movimentação de estoque neste evento ainda.</p>}
        </div>
      )}
    </div>
  )
}
