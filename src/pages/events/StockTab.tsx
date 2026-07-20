import { useEffect, useState } from 'react'
import { Plus, Pencil, Ban, RotateCcw, Check, ChevronDown, ChevronUp } from 'lucide-react'
import { isPositiveMovementType, listEventStockMovementsWide, listProducts, listProfiles, listStockLocations, updateStockMovement } from '../../lib/dataService'
import type { Product, Profile, StockLocation, StockMovement } from '../../lib/types'
import StockMovementForm from '../../components/stock/StockMovementForm'
import { useAuth } from '../../contexts/AuthContext'
import { canEditOwnStock, canEditStock } from '../../lib/permissions'

export default function StockTab({ eventId }: { eventId: string }) {
  const { userId, accessRole } = useAuth()
  const [movements, setMovements] = useState<StockMovement[]>([])
  const [products, setProducts] = useState<Product[]>([])
  const [locations, setLocations] = useState<StockLocation[]>([])
  const [profiles, setProfiles] = useState<Profile[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editQuantity, setEditQuantity] = useState(0)
  const [expandedId, setExpandedId] = useState<string | null>(null)

  async function load() {
    setLoading(true)
    // Visão AMPLA: movimentos com vínculo de evento OU dentro do almoxarifado
    // do evento. Compra/Ajuste não podem carregar o vínculo (regra do banco),
    // então a query estreita por event_id os deixava invisíveis — 6 mil BAGs
    // no saldo e "nada" na lista.
    const [m, p, l, pr] = await Promise.all([listEventStockMovementsWide(eventId), listProducts(), listStockLocations(), listProfiles()])
    setMovements(m)
    setProducts(p)
    setLocations(l)
    setProfiles(pr)
    setLoading(false)
  }

  useEffect(() => { load() }, [eventId])

  const productName = (id: string) => products.find((p) => p.id === id)?.name ?? '—'
  const locationName = (id: string) => locations.find((l) => l.id === id)?.name ?? '—'
  const creatorName = (id: string | null) => {
    const p = profiles.find((pr) => pr.id === id)
    return p ? `${p.first_name} ${p.last_name}` : 'Desconhecido(a)'
  }

  function formatDateTime(iso: string) {
    return new Date(iso).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' })
  }

  function canEditMovement(m: StockMovement) {
    return canEditStock(accessRole) || (canEditOwnStock(accessRole) && m.created_by === userId)
  }

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
            <div key={m.id} className={`bg-white border border-beetz-dark/5 rounded-xl ${m.status === 'Cancelado' ? 'opacity-50' : ''}`}>
              <div
                className="flex items-center gap-3 p-4 cursor-pointer"
                onClick={() => setExpandedId((cur) => (cur === m.id ? null : m.id))}
              >
                <span className={`text-xs font-semibold px-2.5 py-1 rounded-full ${isPositiveMovementType(m.movement_type) ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                  {m.movement_type}
                </span>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold">{productName(m.product_id)}</p>
                  <p className="text-xs text-beetz-dark/50">
                    {locationName(m.stock_location_id)} {m.status === 'Cancelado' ? '· Cancelado' : ''}
                  </p>
                </div>
                {editingId === m.id ? (
                  <div className="flex items-center gap-1.5" onClick={(e) => e.stopPropagation()}>
                    <input
                      type="number" min={0} value={editQuantity} onChange={(e) => setEditQuantity(Number(e.target.value))}
                      className="w-20 border border-beetz-dark/15 rounded-lg px-2 py-1 text-sm"
                    />
                    <button onClick={() => saveEdit(m.id)} className="text-green-600 p-1.5 rounded-lg hover:bg-green-50"><Check size={14} /></button>
                  </div>
                ) : (
                  <span className="font-bold text-sm">{m.quantity}</span>
                )}
                {canEditMovement(m) && editingId !== m.id && (
                  <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
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
                {expandedId === m.id ? <ChevronUp size={16} className="text-beetz-dark/30" /> : <ChevronDown size={16} className="text-beetz-dark/30" />}
              </div>
              {expandedId === m.id && (
                <div className="px-4 pb-4 -mt-1 text-xs text-beetz-dark/60 space-y-1">
                  <p><span className="font-semibold">Registrado por:</span> {creatorName(m.created_by)}</p>
                  <p><span className="font-semibold">Data:</span> {formatDateTime(m.created_at)}</p>
                  {m.notes && <p><span className="font-semibold">Observações:</span> {m.notes}</p>}
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
