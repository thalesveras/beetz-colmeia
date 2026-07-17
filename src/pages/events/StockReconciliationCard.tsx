import { useEffect, useMemo, useState } from 'react'
import { AlertTriangle, ClipboardList } from 'lucide-react'
import { listProducts, listStockMovements } from '../../lib/dataService'
import type { Product, StockMovement } from '../../lib/types'

// Reconciliação automática do estoque desse evento: soma tudo que foi
// "Envio para Evento" (estoque inicial + qualquer reforço mandado depois,
// não tem por que separar os dois — o cálculo é o mesmo) e tudo que voltou
// como "Devolução do Evento" (sobra), e calcula:
//   Consumo = Enviado ao evento − Sobra devolvida
// Não depende de tabela nova nenhuma — é 100% derivado das movimentações já
// geradas pela aprovação/devolução de transferência (aba Transferências,
// dentro dessa mesma aba Estoque). Fase 2 do modelo de estoque.
export default function StockReconciliationCard({ eventId }: { eventId: string }) {
  const [movements, setMovements] = useState<StockMovement[]>([])
  const [products, setProducts] = useState<Product[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    setLoading(true)
    Promise.all([listStockMovements(eventId), listProducts()]).then(([m, p]) => {
      setMovements(m)
      setProducts(p)
      setLoading(false)
    })
  }, [eventId])

  const productName = (id: string) => products.find((p) => p.id === id)?.name ?? '—'
  const productUnit = (id: string) => products.find((p) => p.id === id)?.unit ?? ''

  const rows = useMemo(() => {
    const byProduct = new Map<string, { enviado: number; sobra: number; perda: number }>()
    for (const m of movements) {
      if (m.status === 'Cancelado') continue
      const entry = byProduct.get(m.product_id) ?? { enviado: 0, sobra: 0, perda: 0 }
      if (m.movement_type === 'Envio para Evento') entry.enviado += m.quantity
      else if (m.movement_type === 'Devolução do Evento') entry.sobra += m.quantity
      // Perda/Quebra/Consumo Interno lançados COM este evento: saem do consumo
      // "vendável" e viram coluna própria — perda escondida dentro de consumo
      // é o que faz bar parecer que vendeu mais do que vendeu.
      else if (['Perda', 'Quebra', 'Consumo Interno'].includes(m.movement_type)) entry.perda += m.quantity
      else continue
      byProduct.set(m.product_id, entry)
    }
    return Array.from(byProduct.entries())
      .map(([productId, { enviado, sobra, perda }]) => ({
        productId, enviado, sobra, perda,
        consumo: enviado - sobra - perda,
        retorno: enviado > 0 ? Math.round((sobra / enviado) * 100) : null
      }))
      .sort((a, b) => productName(a.productId).localeCompare(productName(b.productId), 'pt-BR'))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [movements, products])

  // Totais do evento — o número que a Diretoria quer ver primeiro.
  const totals = useMemo(() => {
    const enviado = rows.reduce((s, r) => s + r.enviado, 0)
    const sobra = rows.reduce((s, r) => s + r.sobra, 0)
    const perda = rows.reduce((s, r) => s + r.perda, 0)
    return { enviado, sobra, perda, retorno: enviado > 0 ? Math.round((sobra / enviado) * 100) : null }
  }, [rows])

  if (loading) return null
  if (rows.length === 0) return null

  return (
    <div className="bg-white rounded-2xl p-6 shadow-soft border border-beetz-dark/5">
      <h2 className="font-bold text-lg flex items-center gap-2 mb-1"><ClipboardList size={18} /> Reconciliação do evento</h2>
      <p className="text-sm text-beetz-dark/50 mb-4">
        Consumo = Enviado − Sobra devolvida − Perdas. Derivado das movimentações; nada é digitado aqui.
      </p>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-5">
        <div className="bg-beetz-gray/60 rounded-xl p-3">
          <p className="text-lg font-extrabold leading-none">{totals.enviado}</p>
          <p className="text-[11px] text-beetz-dark/50 mt-1">Enviado</p>
        </div>
        <div className="bg-beetz-gray/60 rounded-xl p-3">
          <p className="text-lg font-extrabold leading-none">{totals.sobra}</p>
          <p className="text-[11px] text-beetz-dark/50 mt-1">Devolvido</p>
        </div>
        <div className={`rounded-xl p-3 ${totals.perda > 0 ? 'bg-red-50' : 'bg-beetz-gray/60'}`}>
          <p className={`text-lg font-extrabold leading-none ${totals.perda > 0 ? 'text-red-600' : ''}`}>{totals.perda}</p>
          <p className="text-[11px] text-beetz-dark/50 mt-1">Perdas e consumo interno</p>
        </div>
        <div className="bg-beetz-dark text-white rounded-xl p-3">
          <p className="text-lg font-extrabold leading-none">{totals.retorno !== null ? `${totals.retorno}%` : '—'}</p>
          <p className="text-[11px] text-white/50 mt-1">Taxa de retorno</p>
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-beetz-dark/10 text-left text-beetz-dark/50">
              <th className="py-2 pr-3 font-medium">Produto</th>
              <th className="py-2 px-3 font-medium text-right">Enviado</th>
              <th className="py-2 px-3 font-medium text-right">Devolvido</th>
              <th className="py-2 px-3 font-medium text-right">Perdas</th>
              <th className="py-2 px-3 font-medium text-right">Consumo</th>
              <th className="py-2 pl-3 font-medium text-right">Retorno</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.productId} className="border-b border-beetz-dark/5 last:border-0">
                <td className="py-2.5 pr-3 font-semibold">{productName(r.productId)}</td>
                <td className="py-2.5 px-3 text-right">{r.enviado} {productUnit(r.productId)}</td>
                <td className="py-2.5 px-3 text-right">{r.sobra}</td>
                <td className={`py-2.5 px-3 text-right ${r.perda > 0 ? 'text-red-600 font-semibold' : 'text-beetz-dark/40'}`}>{r.perda}</td>
                <td className={`py-2.5 px-3 text-right font-bold ${r.consumo < 0 ? 'text-red-600' : ''}`}>
                  {r.consumo < 0 && <AlertTriangle size={12} className="inline mr-1 -mt-0.5" />}
                  {r.consumo}
                </td>
                <td className="py-2.5 pl-3 text-right text-beetz-dark/60">{r.retorno !== null ? `${r.retorno}%` : '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
