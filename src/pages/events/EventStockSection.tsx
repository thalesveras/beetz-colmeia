import { useEffect, useMemo, useState } from 'react'
import { AlertTriangle, ArrowLeftRight, ClipboardList, Clock3 } from 'lucide-react'
import { PDV_BAIXA_NOTA, VENDIDO_BAIXA_NOTA, dropMirroredEventOrigins, listEventProducts, listEventStockMovementsWide, listProductionConsumption, listProducts } from '../../lib/dataService'
import type { EventProduct, Product, ProductionConsumption, StockMovement } from '../../lib/types'
import StockTab from './StockTab'
import TransferRequestsTab from './TransferRequestsTab'

// A aba Estoque do evento em UMA conta, sem informação solta:
//   Sobra = Entrou no evento − Consumo da produção − Vendido (aba Produtos)
// (menos devoluções/perdas quando existirem — aparecem só se forem ≠ 0).
// O resto — relatório do PDV, movimentações e transferências — continua
// existindo, mas cada um na sua sub-aba, um assunto por vez.

// O relatório do PDV mudou de casa: mora na aba Produtos, onde alimenta o
// Vendido em lote. Aqui fica o estoque puro: conta, movimentações e
// transferências.
type SubTab = 'conta' | 'movimentacoes' | 'transferencias'

const SUB_TABS: { key: SubTab; label: string; icon: typeof ClipboardList }[] = [
  { key: 'conta', label: 'A conta', icon: ClipboardList },
  { key: 'movimentacoes', label: 'Movimentações', icon: Clock3 },
  { key: 'transferencias', label: 'Transferências', icon: ArrowLeftRight }
]

export default function EventStockSection({ eventId, canApprove }: { eventId: string; canApprove: boolean }) {
  const [tab, setTab] = useState<SubTab>('conta')

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap gap-2">
        {SUB_TABS.map(({ key, label, icon: Icon }) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            className={`flex items-center gap-1.5 text-sm font-semibold px-3.5 py-2 rounded-xl transition-colors ${
              tab === key ? 'bg-beetz-dark text-white' : 'bg-white text-beetz-dark/70 border border-beetz-dark/10 hover:bg-beetz-gray'
            }`}
          >
            <Icon size={15} /> {label}
          </button>
        ))}
      </div>

      {tab === 'conta' && <EventStockAccountCard eventId={eventId} />}
      {tab === 'movimentacoes' && (
        <div className="bg-white rounded-2xl p-6 shadow-soft border border-beetz-dark/5">
          <StockTab eventId={eventId} />
        </div>
      )}
      {tab === 'transferencias' && (
        <div className="bg-white rounded-2xl p-6 shadow-soft border border-beetz-dark/5">
          <h2 className="font-bold text-lg flex items-center gap-2 mb-1"><ArrowLeftRight size={18} /> Transferências entre estoques</h2>
          <p className="text-sm text-beetz-dark/50 mb-4">Pedidos de mudança de produto entre almoxarifados pra este evento.</p>
          <TransferRequestsTab eventId={eventId} canApprove={canApprove} />
        </div>
      )}
    </div>
  )
}

type WideMovement = StockMovement & { in_event_location: boolean }

// Número de gente: no máximo 2 casas e sem 4999.969999999999.
const fmt = (n: number) => (Math.round(n * 100) / 100).toLocaleString('pt-BR')

function EventStockAccountCard({ eventId }: { eventId: string }) {
  const [movements, setMovements] = useState<WideMovement[]>([])
  const [consumption, setConsumption] = useState<ProductionConsumption[]>([])
  const [eventProducts, setEventProducts] = useState<EventProduct[]>([])
  const [products, setProducts] = useState<Product[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    setLoading(true)
    Promise.all([
      listEventStockMovementsWide(eventId),
      listProductionConsumption(eventId).catch(() => []),
      listEventProducts(eventId).catch(() => []),
      listProducts()
    ]).then(([m, c, ep, p]) => {
      setMovements(m)
      setConsumption(c)
      setEventProducts(ep)
      setProducts(p)
      setLoading(false)
    })
  }, [eventId])

  const productName = (id: string) => products.find((p) => p.id === id)?.name ?? '—'

  const rows = useMemo(() => {
    const map = new Map<string, { entrou: number; voltou: number; perdas: number; consumo: number; vendido: number }>()
    const get = (id: string) => {
      const e = map.get(id) ?? { entrou: 0, voltou: 0, perdas: 0, consumo: 0, vendido: 0 }
      map.set(id, e)
      return e
    }
    for (const m of dropMirroredEventOrigins(movements, (x) => x.in_event_location)) {
      if (m.status === 'Cancelado') continue
      // A baixa automática da venda é uma Saída dentro do estoque do evento.
      // O Vendido já entra na conta pela aba Produtos (logo abaixo) — contar a
      // baixa como "voltou" descontava a mesma venda duas vezes.
      if (m.movement_type === 'Saída' && (m.notes === PDV_BAIXA_NOTA || m.notes === VENDIDO_BAIXA_NOTA)) continue
      // Cerveja que saiu dentro de combo: é venda do insumo, soma no Vendido.
      if (m.movement_type === 'Saída' && (m.notes ?? '').startsWith('Baixa do insumo dos combos')) {
        get(m.product_id).vendido += m.quantity
        continue
      }
      // Entrou: envio formal OU entrada direta no almoxarifado do evento.
      if (m.movement_type === 'Envio para Evento') get(m.product_id).entrou += m.quantity
      else if (m.in_event_location && ['Entrada', 'Compra', 'Ajuste (entrada)'].includes(m.movement_type)) get(m.product_id).entrou += m.quantity
      // Voltou: devolução formal ou retirada do almoxarifado do evento.
      else if (m.movement_type === 'Devolução do Evento') get(m.product_id).voltou += m.quantity
      else if (m.in_event_location && ['Saída', 'Ajuste (saída)'].includes(m.movement_type)) get(m.product_id).voltou += m.quantity
      // Perda/Quebra registradas como movimento saem da sobra também.
      // Consumo Interno NÃO conta aqui: a fonte do consumo é a aba Consumo
      // (senão a baixa vinculada contaria duas vezes).
      else if (m.in_event_location && ['Perda', 'Quebra'].includes(m.movement_type)) get(m.product_id).perdas += m.quantity
    }
    for (const c of consumption) get(c.product_id).consumo += c.quantity
    // Vendido = sold_quantity (o número INFORMADO na aba Produtos) — a
    // quantity de lá é a entrada, que aqui já vem das movimentações.
    for (const ep of eventProducts) get(ep.product_id).vendido += ep.sold_quantity ?? 0
    return Array.from(map.entries())
      .map(([productId, v]) => ({
        productId, ...v,
        sobra: v.entrou - v.voltou - v.perdas - v.consumo - v.vendido
      }))
      .filter((r) => r.entrou > 0 || r.consumo > 0 || r.vendido > 0)
      .sort((a, b) => productName(a.productId).localeCompare(productName(b.productId), 'pt-BR'))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [movements, consumption, eventProducts, products])

  const totals = useMemo(() => ({
    entrou: rows.reduce((s, r) => s + r.entrou, 0),
    voltou: rows.reduce((s, r) => s + r.voltou, 0),
    perdas: rows.reduce((s, r) => s + r.perdas, 0),
    consumo: rows.reduce((s, r) => s + r.consumo, 0),
    vendido: rows.reduce((s, r) => s + r.vendido, 0),
    sobra: rows.reduce((s, r) => s + r.sobra, 0)
  }), [rows])

  if (loading) return <p className="text-sm text-beetz-dark/50">Carregando a conta do evento...</p>

  return (
    <div className="bg-white rounded-2xl p-6 shadow-soft border border-beetz-dark/5">
      <h2 className="font-bold text-lg flex items-center gap-2 mb-1"><ClipboardList size={18} /> A conta do estoque</h2>
      <p className="text-sm text-beetz-dark/50 mb-4">
        Sobra = Entrou no evento − Devolvido à central − Consumo da produção − Vendido (aba Produtos).
      </p>

      {rows.length === 0 ? (
        <p className="text-sm text-beetz-dark/40">Nada entrou no evento ainda — mande produto pela Transferência ou lance uma entrada em Movimentações.</p>
      ) : (
        <>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-5">
            <div className="bg-beetz-gray/60 rounded-xl p-3">
              <p className="text-lg font-extrabold leading-none">{fmt(totals.entrou)}</p>
              <p className="text-[11px] text-beetz-dark/50 mt-1">Entrou no evento</p>
            </div>
            <div className="bg-beetz-gray/60 rounded-xl p-3">
              <p className="text-lg font-extrabold leading-none">{fmt(totals.consumo)}</p>
              <p className="text-[11px] text-beetz-dark/50 mt-1">Consumo da produção</p>
            </div>
            <div className="bg-beetz-gray/60 rounded-xl p-3">
              <p className="text-lg font-extrabold leading-none">{fmt(totals.vendido)}</p>
              <p className="text-[11px] text-beetz-dark/50 mt-1">Vendido (aba Produtos)</p>
            </div>
            <div className="bg-beetz-dark text-white rounded-xl p-3">
              <p className={`text-lg font-extrabold leading-none ${totals.sobra < 0 ? 'text-red-400' : ''}`}>{fmt(totals.sobra)}</p>
              <p className="text-[11px] text-white/50 mt-1">Sobra</p>
            </div>
          </div>

          {(totals.voltou > 0 || totals.perdas > 0) && (
            <p className="text-xs text-beetz-dark/50 bg-beetz-gray/50 rounded-lg px-3 py-2 mb-4">
              A sobra já desconta{totals.voltou > 0 ? ` ${fmt(totals.voltou)} un devolvidas à central` : ''}
              {totals.voltou > 0 && totals.perdas > 0 ? ' e' : ''}
              {totals.perdas > 0 ? ` ${fmt(totals.perdas)} un de perdas/quebras` : ''}.
            </p>
          )}

          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-beetz-dark/10 text-left text-beetz-dark/50">
                  <th className="py-2 pr-3 font-medium">Produto</th>
                  <th className="py-2 px-3 font-medium text-right">Entrou</th>
                  {totals.voltou > 0 && <th className="py-2 px-3 font-medium text-right">Devolvido</th>}
                  <th className="py-2 px-3 font-medium text-right">Consumo</th>
                  <th className="py-2 px-3 font-medium text-right">Vendido</th>
                  <th className="py-2 pl-3 font-medium text-right">Sobra</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.productId} className="border-b border-beetz-dark/5 last:border-0">
                    <td className="py-2.5 pr-3 font-semibold">{productName(r.productId)}</td>
                    <td className="py-2.5 px-3 text-right">{fmt(r.entrou)}</td>
                    {totals.voltou > 0 && <td className={`py-2.5 px-3 text-right ${r.voltou > 0 ? '' : 'text-beetz-dark/30'}`}>{fmt(r.voltou)}</td>}
                    <td className={`py-2.5 px-3 text-right ${r.consumo > 0 ? '' : 'text-beetz-dark/30'}`}>{fmt(r.consumo)}</td>
                    <td className={`py-2.5 px-3 text-right ${r.vendido > 0 ? '' : 'text-beetz-dark/30'}`}>{fmt(r.vendido)}</td>
                    <td className={`py-2.5 pl-3 text-right font-bold ${r.sobra < 0 ? 'text-red-600' : ''}`}>
                      {r.sobra < 0 && <AlertTriangle size={12} className="inline mr-1 -mt-0.5" />}
                      {fmt(r.sobra)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  )
}
