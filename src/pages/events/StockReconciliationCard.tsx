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
    const byProduct = new Map<string, { enviado: number; sobra: number }>()
    for (const m of movements) {
      if (m.status === 'Cancelado') continue
      if (m.movement_type !== 'Envio para Evento' && m.movement_type !== 'Devolução do Evento') continue
      const entry = byProduct.get(m.product_id) ?? { enviado: 0, sobra: 0 }
      if (m.movement_type === 'Envio para Evento') entry.enviado += m.quantity
      else entry.sobra += m.quantity
      byProduct.set(m.product_id, entry)
    }
    return Array.from(byProduct.entries())
      .map(([productId, { enviado, sobra }]) => ({ productId, enviado, sobra, consumo: enviado - sobra }))
      .sort((a, b) => productName(a.productId).localeCompare(productName(b.productId), 'pt-BR'))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [movements, products])

  if (loading) return null
  if (rows.length === 0) return null

  return (
    <div className="bg-white rounded-2xl p-6 shadow-soft border border-beetz-dark/5">
      <h2 className="font-bold text-lg flex items-center gap-2 mb-1"><ClipboardList size={18} /> Reconciliação do evento</h2>
      <p className="text-sm text-beetz-dark/50 mb-4">
        Consumo = Enviado ao evento − Sobra devolvida. Calculado automaticamente a partir das transferências aprovadas/devolvidas.
      </p>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-beetz-dark/10 text-left text-beetz-dark/50">
              <th className="py-2 pr-3 font-medium">Produto</th>
              <th className="py-2 px-3 font-medium text-right">Enviado</th>
              <th className="py-2 px-3 font-medium text-right">Sobra devolvida</th>
              <th className="py-2 pl-3 font-medium text-right">Consumo</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.productId} className="border-b border-beetz-dark/5 last:border-0">
                <td className="py-2.5 pr-3 font-semibold">{productName(r.productId)}</td>
                <td className="py-2.5 px-3 text-right">{r.enviado} {productUnit(r.productId)}</td>
                <td className="py-2.5 px-3 text-right">{r.sobra} {productUnit(r.productId)}</td>
                <td className={`py-2.5 pl-3 text-right font-bold ${r.consumo < 0 ? 'text-red-600' : ''}`}>
                  {r.consumo < 0 && <AlertTriangle size={12} className="inline mr-1 -mt-0.5" />}
                  {r.consumo} {productUnit(r.productId)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
