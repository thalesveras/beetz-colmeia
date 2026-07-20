import { useMemo, useState } from 'react'
import { AlertTriangle, Check } from 'lucide-react'
import { createStockMovementsBulk } from '../../lib/dataService'
import type { MovementType, Product, StockLocation } from '../../lib/types'

// Carga em lote: a ferramenta que faltava quando a carga inicial foi feita
// direto no banco. Cola a lista (uma linha por produto: "Nome; Qtd; Custo" —
// custo opcional), escolhe o destino, confere o preview e lança tudo como
// movimentação PADRÃO num insert só (ou entra tudo, ou nada). Nunca mais
// lançamento por fora do sistema.

const inputClass = 'border border-beetz-dark/15 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-beetz-yellow'

// "2.000" é milhar; "4,50" é decimal; "4.5" é decimal; "2000" é inteiro.
function num(s: string): number {
  const t = s.replace(/[^\d.,-]/g, '')
  if (!t) return 0
  if (t.includes(',')) return Number(t.replace(/\./g, '').replace(',', '.')) || 0
  if (/^\d{1,3}(\.\d{3})+$/.test(t)) return Number(t.replace(/\./g, '')) || 0
  return Number(t) || 0
}

const norm = (s: string) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').trim()

interface BulkLine {
  raw: string
  name: string
  qty: number
  cost: number | null
  product: Product | null
}

function parseBulk(text: string, products: Product[]): BulkLine[] {
  return text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean).map((raw) => {
    let name = ''
    let qtyS = ''
    let costS = ''
    if (/[;\t]/.test(raw)) {
      const parts = raw.split(/[;\t]/).map((p) => p.trim())
      name = parts[0] ?? ''
      qtyS = parts[1] ?? ''
      costS = parts[2] ?? ''
    } else {
      // Sem separador: o último "número" da linha é a quantidade.
      const tokens = raw.split(/\s+/)
      qtyS = tokens.pop() ?? ''
      name = tokens.join(' ')
    }
    const qty = num(qtyS)
    const cost = costS.trim() ? num(costS) : null
    // Nome bate por igualdade (sem acento/caixa) e, se não achar, por conter.
    const product =
      products.find((p) => norm(p.name) === norm(name)) ??
      products.find((p) => norm(p.name).includes(norm(name)) || norm(name).includes(norm(p.name))) ??
      null
    return { raw, name, qty, cost, product }
  })
}

export default function BulkStockEntry({ products, locations, userId, onDone }: {
  products: Product[]
  locations: StockLocation[]
  userId: string | null
  onDone: () => void
}) {
  const [text, setText] = useState('')
  const [locationId, setLocationId] = useState('')
  const [movementType, setMovementType] = useState<MovementType>('Compra')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState<number | null>(null)

  const lines = useMemo(() => parseBulk(text, products), [text, products])
  const good = lines.filter((l) => l.product && l.qty > 0)
  const bad = lines.filter((l) => !l.product || l.qty <= 0)

  async function handleImport() {
    if (!locationId || good.length === 0 || !userId) return
    setSaving(true)
    setError(null)
    try {
      const stamp = new Date().toLocaleDateString('pt-BR')
      const n = await createStockMovementsBulk(good.map((l) => ({
        product_id: l.product!.id,
        stock_location_id: locationId,
        event_id: null,
        movement_type: movementType,
        quantity: l.qty,
        unit_cost: movementType === 'Compra' ? l.cost : null,
        notes: `Carga em lote — ${stamp}`,
        created_by: userId
      })))
      setDone(n)
      setText('')
      onDone()
    } catch (e: any) {
      setError(e?.message ?? 'Não foi possível lançar a carga.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="bg-beetz-gray rounded-2xl p-5 space-y-4">
      <div>
        <p className="font-bold text-sm">Carga em lote</p>
        <p className="text-xs text-beetz-dark/50 mt-0.5">
          Uma linha por produto: <span className="font-semibold">Nome; Quantidade; Custo</span> (custo opcional).
          Tudo entra num lançamento só — ou entra tudo, ou nada. Não gera despesas no Financeiro.
        </p>
      </div>

      <div className="grid sm:grid-cols-2 gap-3">
        <select className={`${inputClass} w-full`} value={locationId} onChange={(e) => setLocationId(e.target.value)}>
          <option value="">Estoque de destino...</option>
          <optgroup label="Almoxarifados">
            {locations.filter((l) => !l.event_id).map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
          </optgroup>
          {locations.some((l) => l.event_id) && (
            <optgroup label="Eventos (estoque na festa)">
              {locations.filter((l) => l.event_id).map((l) => <option key={l.id} value={l.id}>🎪 {l.name}</option>)}
            </optgroup>
          )}
        </select>
        <div className="grid grid-cols-2 gap-2">
          {(['Compra', 'Ajuste (entrada)'] as MovementType[]).map((t) => (
            <button
              type="button" key={t} onClick={() => setMovementType(t)}
              className={`text-sm font-medium px-3 py-2 rounded-xl border transition-colors ${
                movementType === t ? 'bg-beetz-yellow border-beetz-yellow text-beetz-dark' : 'border-beetz-dark/15 text-beetz-dark/70 bg-white'
              }`}
            >
              {t}
            </button>
          ))}
        </div>
      </div>

      <textarea
        className={`${inputClass} w-full h-36 font-mono text-xs`}
        placeholder={'Água; 3600; 1,20\nHeineken; 6000; 4,50\nBAG; 2000'}
        value={text}
        onChange={(e) => { setText(e.target.value); setDone(null) }}
      />

      {lines.length > 0 && (
        <div className="space-y-1.5">
          <p className="text-xs font-semibold text-beetz-dark/60">
            {good.length} pronta(s){bad.length > 0 ? ` · ${bad.length} com problema` : ''}
          </p>
          {bad.map((l, i) => (
            <p key={i} className="flex items-center gap-1.5 text-xs text-red-700 bg-red-50 border border-red-100 rounded-lg px-3 py-1.5">
              <AlertTriangle size={12} className="shrink-0" />
              "{l.raw}" — {!l.product ? `produto "${l.name}" não encontrado no catálogo` : 'quantidade inválida'}
            </p>
          ))}
          {good.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {good.map((l, i) => (
                <span key={i} className="text-[11px] font-medium bg-white border border-green-200 text-green-800 px-2.5 py-1 rounded-full">
                  {l.product!.name} · {l.qty}{l.cost != null && movementType === 'Compra' ? ` · R$ ${l.cost.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}` : ''}
                </span>
              ))}
            </div>
          )}
        </div>
      )}

      {error && <p className="text-sm text-red-600 bg-red-50 border border-red-100 rounded-xl px-3 py-2">{error}</p>}
      {done != null && (
        <p className="flex items-center gap-1.5 text-sm font-semibold text-green-700 bg-green-50 border border-green-200 rounded-xl px-3 py-2">
          <Check size={14} /> {done} movimentação(ões) lançadas no padrão do sistema.
        </p>
      )}

      <div className="flex justify-end">
        <button
          onClick={handleImport}
          disabled={saving || !locationId || good.length === 0}
          className="honey-gradient text-beetz-dark font-bold px-5 py-2 rounded-xl text-sm disabled:opacity-60"
        >
          {saving ? 'Lançando...' : `Lançar ${good.length} item(ns)`}
        </button>
      </div>
    </div>
  )
}
