import { useEffect, useState } from 'react'
import { Plus } from 'lucide-react'
import { listProducts, listStockLocations, listStockMovements } from '../../lib/dataService'
import type { Product, StockLocation, StockMovement } from '../../lib/types'
import StockMovementForm from '../../components/stock/StockMovementForm'

export default function StockTab({ eventId }: { eventId: string }) {
  const [movements, setMovements] = useState<StockMovement[]>([])
  const [products, setProducts] = useState<Product[]>([])
  const [locations, setLocations] = useState<StockLocation[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)

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
            <div key={m.id} className="flex items-center gap-3 bg-white border border-beetz-dark/5 rounded-xl p-4">
              <span className={`text-xs font-semibold px-2.5 py-1 rounded-full ${m.movement_type === 'Entrada' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                {m.movement_type}
              </span>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold">{productName(m.product_id)}</p>
                <p className="text-xs text-beetz-dark/50">{locationName(m.stock_location_id)} {m.notes ? `· ${m.notes}` : ''}</p>
              </div>
              <span className="font-bold text-sm">{m.quantity}</span>
            </div>
          ))}
          {movements.length === 0 && <p className="text-sm text-beetz-dark/50">Nenhuma movimentação de estoque neste evento ainda.</p>}
        </div>
      )}
    </div>
  )
}
