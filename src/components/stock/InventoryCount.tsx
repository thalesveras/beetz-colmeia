import { useMemo, useState } from 'react'
import { ClipboardList, X } from 'lucide-react'
import { createStockMovement } from '../../lib/dataService'
import type { Product, StockBalance, StockLocation } from '../../lib/types'

interface Props {
  products: Product[]
  locations: StockLocation[]
  balances: StockBalance[]
  userId: string | null
  onDone: () => void
}

const inputClass = 'border border-beetz-dark/15 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-beetz-yellow'

// Inventário físico sem tabela nova, de propósito: a contagem em si é
// descartável — o que precisa sobreviver são os AJUSTES que ela gera, e esses
// viram movimentações normais ('Ajuste entrada/saída') com a nota
// "Inventário físico DD/MM". O histórico de contagens É o histórico de
// movimentações filtrado por essa nota — um lugar só pra auditar, não dois.
export default function InventoryCount({ products, locations, balances, userId, onDone }: Props) {
  const [locationId, setLocationId] = useState('')
  const [counts, setCounts] = useState<Record<string, string>>({})
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState<string | null>(null)

  const systemOf = (productId: string) =>
    balances.find((b) => b.product_id === productId && b.stock_location_id === locationId)?.balance ?? 0

  // Só produtos efetivamente contados entram; campo vazio = "não conferi esse",
  // que é diferente de "contei zero" — confundir os dois geraria ajuste
  // zerando produto que ninguém olhou.
  const diffs = useMemo(() => {
    if (!locationId) return []
    return products
      .map((p) => {
        const raw = counts[p.id]
        if (raw === undefined || raw.trim() === '') return null
        const counted = Number(raw.replace(',', '.'))
        if (Number.isNaN(counted) || counted < 0) return null
        const system = systemOf(p.id)
        return { product: p, system, counted, diff: counted - system }
      })
      .filter((d): d is NonNullable<typeof d> => d !== null)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [counts, locationId, products, balances])

  const divergent = diffs.filter((d) => d.diff !== 0)

  async function handleConfirm() {
    if (!locationId || divergent.length === 0) return
    setSaving(true); setError(null)
    const tag = `Inventário físico ${new Date().toLocaleDateString('pt-BR')}`
    try {
      // Sequencial, não Promise.all: se um ajuste falhar no meio, os já
      // gravados são válidos e a mensagem diz onde parou — melhor que uma
      // rajada paralela onde não se sabe o que entrou.
      for (const d of divergent) {
        await createStockMovement({
          product_id: d.product.id, stock_location_id: locationId, event_id: null,
          movement_type: d.diff > 0 ? 'Ajuste (entrada)' : 'Ajuste (saída)',
          quantity: Math.abs(d.diff),
          notes: `${tag} — sistema ${d.system}, contado ${d.counted}`,
          created_by: userId
        })
      }
      setDone(`${divergent.length} ajuste${divergent.length === 1 ? '' : 's'} gerado${divergent.length === 1 ? '' : 's'}.`)
      setCounts({})
      onDone()
    } catch (e: any) {
      setError(`Parou no meio: ${e?.message ?? 'erro'}. Os ajustes já gravados estão no histórico — confira antes de repetir.`)
      onDone()
    } finally { setSaving(false) }
  }

  return (
    <section className="bg-white rounded-2xl p-5 shadow-soft border border-beetz-dark/5">
      <h3 className="font-bold flex items-center gap-2 mb-1"><ClipboardList size={17} /> Inventário físico</h3>
      <p className="text-sm text-beetz-dark/50 mb-4">
        Conte o que está na prateleira e digite aqui. Divergência vira ajuste automático — campo vazio significa "não conferi", não "zero".
      </p>

      {error && <p className="text-sm text-red-600 bg-red-50 border border-red-100 rounded-xl px-3 py-2 mb-3">{error}</p>}
      {done && <p className="text-sm text-green-700 bg-green-50 border border-green-100 rounded-xl px-3 py-2 mb-3">{done}</p>}

      <select className={`${inputClass} mb-4`} value={locationId}
        onChange={(e) => { setLocationId(e.target.value); setCounts({}); setDone(null) }}>
        <option value="">Conferir qual estoque...</option>
        {locations.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
      </select>

      {locationId && (
        <>
          <div className="space-y-2 mb-4">
            {products.map((p) => {
              const system = systemOf(p.id)
              const d = diffs.find((x) => x.product.id === p.id)
              return (
                <div key={p.id} className="flex items-center gap-3">
                  <span className="text-sm font-medium flex-1 min-w-0 truncate">{p.name}</span>
                  <span className="text-xs text-beetz-dark/40 whitespace-nowrap">sistema: {system} {p.unit}</span>
                  <input
                    type="text" inputMode="decimal" placeholder="contado"
                    className={`${inputClass} w-24 text-right`}
                    value={counts[p.id] ?? ''}
                    onChange={(e) => setCounts((c) => ({ ...c, [p.id]: e.target.value }))}
                  />
                  {d && d.diff !== 0 && (
                    <span className={`text-xs font-bold whitespace-nowrap ${d.diff > 0 ? 'text-green-600' : 'text-red-600'}`}>
                      {d.diff > 0 ? '+' : ''}{d.diff}
                    </span>
                  )}
                  {d && d.diff === 0 && <span className="text-xs text-beetz-dark/30">ok</span>}
                </div>
              )
            })}
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={handleConfirm} disabled={saving || divergent.length === 0}
              className="honey-gradient text-beetz-dark font-bold px-5 py-2.5 rounded-xl text-sm disabled:opacity-50"
            >
              {saving ? 'Ajustando...' : divergent.length === 0
                ? 'Nenhuma divergência'
                : `Gerar ${divergent.length} ajuste${divergent.length === 1 ? '' : 's'}`}
            </button>
            {Object.keys(counts).length > 0 && (
              <button onClick={() => setCounts({})} className="text-sm text-beetz-dark/50 hover:text-beetz-dark flex items-center gap-1">
                <X size={14} /> Limpar
              </button>
            )}
          </div>
        </>
      )}
    </section>
  )
}
