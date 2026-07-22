import { useEffect, useMemo, useState } from 'react'
import { Plus, Pencil, Ban, RotateCcw, Check, ChevronDown, ChevronUp } from 'lucide-react'
import { isPositiveMovementType, listEventStockMovementsWide, listProducts, listProfilesLite, listStockLocations, updateCompraMovement, updateStockMovement } from '../../lib/dataService'
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
    const [m, p, l, pr] = await Promise.all([listEventStockMovementsWide(eventId), listProducts(), listStockLocations(), listProfilesLite()])
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

  const [editCost, setEditCost] = useState('')

  function startEdit(m: StockMovement) {
    setEditingId(m.id)
    setEditQuantity(m.quantity)
    setEditCost(m.unit_cost != null ? String(m.unit_cost) : '')
  }

  // Compra edita quantidade E preço — e a despesa vinculada acompanha
  // enquanto estiver Pendente. Financeiro já aprovado não se mexe por tabela.
  async function saveEdit(m: StockMovement) {
    if (m.movement_type === 'Compra') {
      const cost = editCost.trim() ? Number(editCost.replace(',', '.')) || null : null
      const sync = await updateCompraMovement(m.id, { quantity: editQuantity, unit_cost: cost })
      if (sync === 'locked') {
        alert('A despesa vinculada a esta compra já saiu de Pendente — ajuste o valor no Financeiro manualmente.')
      }
    } else {
      await updateStockMovement(m.id, { quantity: editQuantity })
    }
    setEditingId(null)
    load()
  }

  async function toggleStatus(m: StockMovement) {
    await updateStockMovement(m.id, { status: m.status === 'Cancelado' ? 'Ativo' : 'Cancelado' })
    load()
  }

  // Filtro inteligente: UMA caixa que entende o que você digitar — nome do
  // produto (sem ligar pra acento), tipo da movimentação, valor ("3,25" acha
  // o custo; "2000" acha a quantidade) e observações. + tipo e cancelados.
  const [search, setSearch] = useState('')
  const [filterType, setFilterType] = useState('')
  const [hideCancelled, setHideCancelled] = useState(false)
  const norm = (s: string) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')

  const typeOptions = useMemo(
    () => Array.from(new Set(movements.map((m) => m.movement_type))).sort(),
    [movements]
  )

  const filteredMovements = useMemo(() => {
    const term = norm(search.trim())
    const numTerm = search.trim().replace(',', '.')
    return movements.filter((m) => {
      if (filterType && m.movement_type !== filterType) return false
      if (hideCancelled && m.status === 'Cancelado') return false
      if (!term) return true
      if (norm(productName(m.product_id)).includes(term)) return true
      if (norm(m.movement_type).includes(term)) return true
      if (m.notes && norm(m.notes).includes(term)) return true
      if (String(m.quantity).includes(numTerm)) return true
      if (m.unit_cost != null && (String(m.unit_cost).includes(numTerm) || m.unit_cost.toFixed(2).replace('.', ',').includes(search.trim()))) return true
      return false
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [movements, search, filterType, hideCancelled, products])
  const filtersActive = !!(search.trim() || filterType || hideCancelled)

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <p className="text-sm text-beetz-dark/60">
          {loading
            ? 'Carregando...'
            : filtersActive
              ? `${filteredMovements.length} de ${movements.length} movimentação(ões)`
              : `${movements.length} movimentação(ões) neste evento`}
        </p>
        <button
          onClick={() => setShowForm((v) => !v)}
          className="flex items-center gap-1.5 text-sm font-semibold bg-beetz-dark text-white px-3 py-2 rounded-xl hover:bg-black transition-colors"
        >
          <Plus size={16} /> Nova movimentação
        </button>
      </div>

      {showForm && <StockMovementForm fixedEventId={eventId} onSaved={() => { setShowForm(false); load() }} />}

      {!loading && movements.length > 1 && (
        <div className="flex flex-wrap items-center gap-2">
          <input
            className="flex-1 min-w-[180px] border border-beetz-dark/15 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-beetz-yellow"
            placeholder="Buscar produto, tipo, valor..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <select
            value={filterType}
            onChange={(e) => setFilterType(e.target.value)}
            className="border border-beetz-dark/15 rounded-xl px-3 py-2 text-sm"
          >
            <option value="">Todos os tipos</option>
            {typeOptions.map((t) => <option key={t} value={t}>{t}</option>)}
          </select>
          <button
            onClick={() => setHideCancelled((v) => !v)}
            className={`text-xs font-semibold px-3 py-2 rounded-xl border transition-colors ${
              hideCancelled ? 'bg-beetz-dark text-white border-beetz-dark' : 'border-beetz-dark/15 text-beetz-dark/60 hover:bg-beetz-gray'
            }`}
          >
            Ocultar cancelados
          </button>
          {filtersActive && (
            <button
              onClick={() => { setSearch(''); setFilterType(''); setHideCancelled(false) }}
              className="text-xs font-semibold text-beetz-dark/50 hover:text-red-600 px-2 py-2"
            >
              Limpar
            </button>
          )}
        </div>
      )}

      {!loading && (
        <div className="space-y-2">
          {filteredMovements.map((m) => (
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
                      title="Quantidade"
                    />
                    {m.movement_type === 'Compra' && (
                      <input
                        type="text" inputMode="decimal" placeholder="R$/un"
                        value={editCost} onChange={(e) => setEditCost(e.target.value)}
                        className="w-20 border border-beetz-dark/15 rounded-lg px-2 py-1 text-sm"
                        title="Preço unitário (R$) — a despesa Pendente vinculada acompanha"
                      />
                    )}
                    <button onClick={() => saveEdit(m)} className="text-green-600 p-1.5 rounded-lg hover:bg-green-50"><Check size={14} /></button>
                  </div>
                ) : (
                  <div className="text-right">
                    <span className="font-bold text-sm">{m.quantity}</span>
                    {m.unit_cost != null && (
                      <p className="text-[10px] text-beetz-dark/40 leading-tight">
                        {Number(m.unit_cost).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}/un
                      </p>
                    )}
                  </div>
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
                  {m.unit_cost != null && (
                    <p>
                      <span className="font-semibold">Custo:</span> {Number(m.unit_cost).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}/un
                      · total {(m.unit_cost * m.quantity).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                    </p>
                  )}
                  {m.notes && <p><span className="font-semibold">Observações:</span> {m.notes}</p>}
                </div>
              )}
            </div>
          ))}
          {filteredMovements.length === 0 && (
            <p className="text-sm text-beetz-dark/50">
              {movements.length > 0 ? 'Nenhuma movimentação com esses filtros.' : 'Nenhuma movimentação de estoque neste evento ainda.'}
            </p>
          )}
        </div>
      )}
    </div>
  )
}
