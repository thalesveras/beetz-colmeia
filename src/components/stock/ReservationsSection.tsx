import { useEffect, useState } from 'react'
import { CalendarCheck, Check, Plus, X } from 'lucide-react'
import {
  createStockMovement, createStockReservation, listStockReservations, updateStockReservationStatus
} from '../../lib/dataService'
import type { EventItem, Product, StockAvailable, StockLocation, StockReservation } from '../../lib/types'

interface Props {
  products: Product[]
  locations: StockLocation[]
  events: EventItem[]
  availability: StockAvailable[]
  userId: string | null
  canManage: boolean
  onChanged: () => void
}

const inputClass = 'border border-beetz-dark/15 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-beetz-yellow'

// Reserva = separar quantidade pra um evento futuro sem tirar do saldo físico.
// O que ela derruba é o DISPONÍVEL (view stock_available) — o número que
// importa na pergunta "posso prometer esse produto pra outro evento?".
export default function ReservationsSection({ products, locations, events, availability, userId, canManage, onChanged }: Props) {
  const [reservations, setReservations] = useState<StockReservation[]>([])
  const [showForm, setShowForm] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [eventId, setEventId] = useState('')
  const [productId, setProductId] = useState('')
  const [locationId, setLocationId] = useState('')
  const [quantity, setQuantity] = useState(1)

  async function refresh() {
    try { setReservations(await listStockReservations()) } catch { /* seção acessória */ }
  }
  useEffect(() => { refresh() }, [])

  const avail = availability.find((a) => a.product_id === productId && a.stock_location_id === locationId)
  const name = (list: { id: string; name: string }[], id: string) => list.find((x) => x.id === id)?.name ?? '—'

  async function handleCreate() {
    if (!eventId || !productId || !locationId || quantity <= 0) return
    setSaving(true); setError(null)
    try {
      await createStockReservation({
        event_id: eventId, product_id: productId, stock_location_id: locationId,
        quantity, notes: null, created_by: userId
      })
      setShowForm(false); setEventId(''); setProductId(''); setLocationId(''); setQuantity(1)
      await refresh(); onChanged()
    } catch (e: any) {
      setError(e?.message ?? 'Não foi possível reservar.')
    } finally { setSaving(false) }
  }

  // Atender = a separação virou envio de verdade: registra o 'Envio para
  // Evento' e marca a reserva como Atendida. Duas escritas — se a segunda
  // falhar, a reserva continua Reservado e dá pra atender de novo sem duplicar
  // porque o erro aparece na tela.
  async function handleFulfill(r: StockReservation) {
    setSaving(true); setError(null)
    try {
      await createStockMovement({
        product_id: r.product_id, stock_location_id: r.stock_location_id, event_id: r.event_id,
        movement_type: 'Envio para Evento', quantity: r.quantity,
        notes: 'Atendimento de reserva', created_by: userId
      })
      await updateStockReservationStatus(r.id, 'Atendida')
      await refresh(); onChanged()
    } catch (e: any) {
      setError(e?.message ?? 'Não foi possível atender a reserva.')
    } finally { setSaving(false) }
  }

  async function handleCancel(r: StockReservation) {
    setSaving(true); setError(null)
    try {
      await updateStockReservationStatus(r.id, 'Cancelada')
      await refresh(); onChanged()
    } catch (e: any) {
      setError(e?.message ?? 'Não foi possível cancelar.')
    } finally { setSaving(false) }
  }

  return (
    <section className="bg-white rounded-2xl p-5 shadow-soft border border-beetz-dark/5">
      <div className="flex items-center justify-between mb-3">
        <h3 className="font-bold flex items-center gap-2"><CalendarCheck size={17} /> Reservas para eventos</h3>
        {canManage && (
          <button
            onClick={() => setShowForm((v) => !v)}
            className="flex items-center gap-1.5 text-sm font-semibold border border-beetz-dark/15 px-3 py-1.5 rounded-xl hover:bg-beetz-gray"
          >
            <Plus size={14} /> Nova reserva
          </button>
        )}
      </div>

      {error && <p className="text-sm text-red-600 bg-red-50 border border-red-100 rounded-xl px-3 py-2 mb-3">{error}</p>}

      {showForm && (
        <div className="bg-beetz-gray rounded-2xl p-4 mb-4 grid sm:grid-cols-2 gap-3">
          <select className={inputClass} value={eventId} onChange={(e) => setEventId(e.target.value)}>
            <option value="">Evento...</option>
            {events.map((ev) => <option key={ev.id} value={ev.id}>{ev.name}</option>)}
          </select>
          <select className={inputClass} value={productId} onChange={(e) => setProductId(e.target.value)}>
            <option value="">Produto...</option>
            {products.map((p) => <option key={p.id} value={p.id}>{p.name} ({p.unit})</option>)}
          </select>
          <select className={inputClass} value={locationId} onChange={(e) => setLocationId(e.target.value)}>
            <option value="">Sai de qual estoque...</option>
            {locations.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
          </select>
          <input
            type="number" min={1} step="1" className={inputClass} value={quantity}
            onChange={(e) => setQuantity(Number(e.target.value))} placeholder="Quantidade"
          />
          {avail && (
            <p className={`sm:col-span-2 text-xs px-1 ${quantity > avail.available ? 'text-amber-700' : 'text-beetz-dark/50'}`}>
              Disponível aqui: {avail.available} (físico {avail.balance}, já reservado {avail.reserved}).
              {quantity > avail.available && ' Essa reserva promete mais do que há livre — vai registrar mesmo assim.'}
            </p>
          )}
          <div className="sm:col-span-2">
            <button
              onClick={handleCreate} disabled={saving || !eventId || !productId || !locationId}
              className="honey-gradient text-beetz-dark font-bold px-5 py-2.5 rounded-xl text-sm disabled:opacity-60"
            >
              {saving ? 'Reservando...' : 'Reservar'}
            </button>
          </div>
        </div>
      )}

      {reservations.length === 0 ? (
        <p className="text-sm text-beetz-dark/40">
          Nenhuma reserva ativa. Reservar separa o produto pra um evento sem tirar do saldo — só derruba o disponível.
        </p>
      ) : (
        <div className="space-y-2">
          {reservations.map((r) => (
            <div key={r.id} className="flex items-center justify-between gap-3 bg-beetz-gray/60 rounded-xl px-4 py-2.5">
              <div className="min-w-0">
                <p className="text-sm font-semibold truncate">
                  {name(products, r.product_id)} · {r.quantity}
                </p>
                <p className="text-xs text-beetz-dark/50 truncate">
                  {name(events as any, r.event_id)} · de {name(locations, r.stock_location_id)}
                </p>
              </div>
              {canManage && (
                <div className="flex gap-1.5 shrink-0">
                  <button
                    onClick={() => handleFulfill(r)} disabled={saving} title="Atender (vira Envio para Evento)"
                    className="p-2 rounded-lg bg-green-100 text-green-700 hover:bg-green-200 disabled:opacity-50"
                  >
                    <Check size={14} />
                  </button>
                  <button
                    onClick={() => handleCancel(r)} disabled={saving} title="Cancelar reserva"
                    className="p-2 rounded-lg bg-white text-beetz-dark/50 hover:text-red-600 border border-beetz-dark/10 disabled:opacity-50"
                  >
                    <X size={14} />
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </section>
  )
}
