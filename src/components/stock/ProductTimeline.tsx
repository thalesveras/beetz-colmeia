import { X } from 'lucide-react'
import { isPositiveMovementType } from '../../lib/dataService'
import type { EventItem, Product, Profile, StockLocation, StockMovement } from '../../lib/types'

interface Props {
  product: Product
  movements: StockMovement[]
  locations: StockLocation[]
  events: EventItem[]
  profiles: Profile[]
  onClose: () => void
}

// A história completa de um produto, do mais recente pro mais antigo. É leitura
// dos movimentos que a tela já tem em memória — nenhuma consulta nova: timeline
// que exige ida ao banco a cada clique vira timeline que ninguém abre.
export default function ProductTimeline({ product, movements, locations, events, profiles, onClose }: Props) {
  const rows = movements
    .filter((m) => m.product_id === product.id)
    .sort((a, b) => b.created_at.localeCompare(a.created_at))

  const locName = (id: string) => locations.find((l) => l.id === id)?.name ?? '—'
  const evName = (id: string | null) => (id ? events.find((e) => e.id === id)?.name ?? 'Evento' : null)
  const who = (id: string | null) => {
    if (!id) return null
    const p = profiles.find((x) => x.id === id)
    return p ? `${p.first_name ?? ''} ${p.last_name ?? ''}`.trim() : null
  }
  const when = (iso: string) =>
    new Date(iso).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' })

  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4" onClick={onClose}>
      <div
        className="bg-white rounded-3xl w-full max-w-lg max-h-[80vh] overflow-y-auto p-6"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between mb-4">
          <div>
            <h3 className="text-lg font-extrabold">{product.name}</h3>
            <p className="text-xs text-beetz-dark/50">
              Linha do tempo · {rows.length} movimentação{rows.length === 1 ? '' : 's'}
            </p>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-beetz-gray" aria-label="Fechar">
            <X size={18} />
          </button>
        </div>

        {rows.length === 0 ? (
          <p className="text-sm text-beetz-dark/40 py-8 text-center">Nenhuma movimentação registrada ainda.</p>
        ) : (
          <div className="relative pl-5">
            {/* fio da timeline */}
            <div className="absolute left-[5px] top-1 bottom-1 w-px bg-beetz-dark/10" />
            <div className="space-y-4">
              {rows.map((m) => {
                const positive = isPositiveMovementType(m.movement_type)
                const cancelled = m.status === 'Cancelado'
                return (
                  <div key={m.id} className={`relative ${cancelled ? 'opacity-45' : ''}`}>
                    <span className={`absolute -left-5 top-1 w-2.5 h-2.5 rounded-full ring-2 ring-white ${
                      cancelled ? 'bg-beetz-dark/25' : positive ? 'bg-green-500' : 'bg-red-400'
                    }`} />
                    <div className="flex items-baseline justify-between gap-2">
                      <p className="text-sm font-semibold">
                        {m.movement_type}
                        <span className={`ml-2 font-extrabold ${positive ? 'text-green-600' : 'text-red-500'}`}>
                          {positive ? '+' : '−'}{m.quantity} {product.unit}
                        </span>
                        {cancelled && <span className="ml-2 text-[10px] font-bold uppercase text-beetz-dark/40">cancelada</span>}
                      </p>
                      <p className="text-[11px] text-beetz-dark/40 whitespace-nowrap">{when(m.created_at)}</p>
                    </div>
                    <p className="text-xs text-beetz-dark/55 mt-0.5">
                      {locName(m.stock_location_id)}
                      {evName(m.event_id) && <> · {evName(m.event_id)}</>}
                      {m.movement_type === 'Compra' && m.unit_cost != null && (
                        <> · {Number(m.unit_cost).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}/un</>
                      )}
                      {who(m.created_by) && <> · {who(m.created_by)}</>}
                    </p>
                    {m.notes && <p className="text-xs text-beetz-dark/40 italic mt-0.5">{m.notes}</p>}
                  </div>
                )
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
