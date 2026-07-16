import { useEffect, useMemo, useState } from 'react'
import {
  Plus, Pencil, Ban, RotateCcw, Check, X, Trash2, ChevronDown, ChevronUp, Package, Warehouse, AlertTriangle,
  Clock3, ArrowLeftRight, ChevronLeft, ChevronRight, Filter
} from 'lucide-react'
import {
  approveTransferRequest, createProduct, createStockLocation, createTransferRequest, deleteProduct,
  deleteStockLocation, getStockBalances, isPositiveMovementType, listEvents, listProducts, listProfiles,
  listStockLocations, listStockMovements, listTransferRequests, registerTransferReturn, updateProduct,
  updateStockLocation, updateStockMovement, updateTransferRequestStatus
} from '../lib/dataService'
import type { EventItem, Product, Profile, StockBalance, StockLocation, StockMovement, TransferRequest, TransferRequestStatus } from '../lib/types'
import StockMovementForm from '../components/stock/StockMovementForm'
import { useAuth } from '../contexts/AuthContext'
import { canEditOwnStock, canEditStock, canManageStockCatalog, canManageUsers, canViewStockTab } from '../lib/permissions'

const inputClass = 'flex-1 border border-beetz-dark/15 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-beetz-yellow'
const COMMON_UNITS = ['un', 'kg', 'g', 'L', 'ml', 'caixa', 'pacote', 'saco', 'garrafa', 'fardo', 'dúzia']
const LOW_STOCK_THRESHOLD = 5
const MOVEMENTS_PAGE_SIZE = 20

// Mesma lógica de paginação "inteligente" usada na Turma — primeira, última
// e vizinhança da página atual, com "..." nos intervalos.
function getPageNumbers(current: number, total: number): (number | 'ellipsis')[] {
  if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1)
  const pages: (number | 'ellipsis')[] = [1]
  if (current > 3) pages.push('ellipsis')
  const start = Math.max(2, current - 1)
  const end = Math.min(total - 1, current + 1)
  for (let i = start; i <= end; i++) pages.push(i)
  if (current < total - 2) pages.push('ellipsis')
  pages.push(total)
  return pages
}

const transferStatuses: TransferRequestStatus[] = ['Pendente', 'Aprovado', 'Negado']
const transferStatusColors: Record<TransferRequestStatus, string> = {
  Pendente: 'bg-beetz-yellow/30 text-beetz-dark',
  Aprovado: 'bg-green-100 text-green-700',
  Negado: 'bg-red-100 text-red-700'
}

export default function Stock() {
  const { userId, accessRole } = useAuth()
  const [balances, setBalances] = useState<StockBalance[]>([])
  const [locations, setLocations] = useState<StockLocation[]>([])
  const [products, setProducts] = useState<Product[]>([])
  const [movements, setMovements] = useState<StockMovement[]>([])
  const [profiles, setProfiles] = useState<Profile[]>([])
  const [loading, setLoading] = useState(true)
  const [showMovementForm, setShowMovementForm] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editQuantity, setEditQuantity] = useState(0)
  const [expandedId, setExpandedId] = useState<string | null>(null)

  // Filtros + paginação do histórico de movimentações — necessário assim que
  // o volume passa de umas duas dezenas de lançamentos.
  const [showMovementFilters, setShowMovementFilters] = useState(false)
  const [movementFilterProduct, setMovementFilterProduct] = useState('')
  const [movementFilterLocation, setMovementFilterLocation] = useState('')
  const [movementFilterType, setMovementFilterType] = useState('')
  const [movementFilterFrom, setMovementFilterFrom] = useState('')
  const [movementFilterTo, setMovementFilterTo] = useState('')
  const [movementPage, setMovementPage] = useState(1)

  const [newProductName, setNewProductName] = useState('')
  const [newProductUnit, setNewProductUnit] = useState('un')
  const [newProductCustomUnit, setNewProductCustomUnit] = useState('')
  const [newProductThreshold, setNewProductThreshold] = useState('')
  const [newLocationName, setNewLocationName] = useState('')

  const canManageCatalog = canManageStockCatalog(accessRole)
  const canApproveTransfers = canManageUsers(accessRole)

  // Transferências entre estoques — mesma tabela usada dentro do evento
  // (aba "Transferências solicitadas pela produção"), aqui numa visão global
  // pra quem cuida do estoque não precisar entrar em cada evento pra ver/aprovar.
  const [events, setEvents] = useState<EventItem[]>([])
  const [transfers, setTransfers] = useState<TransferRequest[]>([])
  const [showTransferForm, setShowTransferForm] = useState(false)
  const [savingTransfer, setSavingTransfer] = useState(false)
  const [transferEventId, setTransferEventId] = useState('')
  const [transferProductId, setTransferProductId] = useState('')
  const [transferQuantity, setTransferQuantity] = useState(1)
  const [transferFromId, setTransferFromId] = useState('')
  const [transferToId, setTransferToId] = useState('')
  const [transferRequestedBy, setTransferRequestedBy] = useState('')
  const [transferNotes, setTransferNotes] = useState('')

  // Produto/estoque em edição inline (cadastro rápido)
  const [editingProductId, setEditingProductId] = useState<string | null>(null)
  const [editProductName, setEditProductName] = useState('')
  const [editProductUnit, setEditProductUnit] = useState('')
  const [editProductThreshold, setEditProductThreshold] = useState('')
  const [editingLocationId, setEditingLocationId] = useState<string | null>(null)
  const [editLocationName, setEditLocationName] = useState('')
  const [catalogError, setCatalogError] = useState<string | null>(null)

  async function load() {
    setLoading(true)
    const [b, l, p, m, pr, ev, tr] = await Promise.all([
      getStockBalances(), listStockLocations(), listProducts(), listStockMovements(), listProfiles(),
      listEvents(), listTransferRequests()
    ])
    setBalances(b)
    setLocations(l)
    setProducts(p)
    setMovements(m)
    setProfiles(pr)
    setEvents(ev)
    setTransfers(tr)
    setLoading(false)
  }

  useEffect(() => { load() }, [])

  // Antes só o link do menu era escondido: quem digitasse /estoque na barra de
  // endereço entrava e via produtos, saldos e todo o histórico. Todas as outras
  // páginas sensíveis têm essa trava; essa faltava. (O RLS já barrava a
  // escrita — o vazamento era de leitura.)
  if (!canViewStockTab(accessRole)) {
    return (
      <div className="bg-white rounded-2xl p-8 shadow-soft border border-beetz-dark/5 text-center">
        <p className="text-4xl mb-3">🔒</p>
        <h1 className="text-xl font-bold mb-1">Acesso restrito</h1>
        <p className="text-sm text-beetz-dark/60">Seu perfil de acesso não tem permissão pra ver o Estoque.</p>
      </div>
    )
  }

  const productName = (id: string) => products.find((p) => p.id === id)?.name ?? '—'
  const locationName = (id: string) => locations.find((l) => l.id === id)?.name ?? '—'
  const locationNameOrDash = (id: string | null) => (id ? locationName(id) : '—')
  const eventName = (id: string) => events.find((e) => e.id === id)?.name ?? '—'
  const creatorName = (id: string | null) => {
    const p = profiles.find((pr) => pr.id === id)
    return p ? `${p.first_name} ${p.last_name}` : 'Desconhecido(a)'
  }

  async function handleAddTransfer(e: React.FormEvent) {
    e.preventDefault()
    if (!transferEventId || !transferProductId) return
    setSavingTransfer(true)
    await createTransferRequest({
      event_id: transferEventId, product_id: transferProductId, quantity: transferQuantity,
      from_location_id: transferFromId || null, to_location_id: transferToId || null,
      requested_by: transferRequestedBy || null, notes: transferNotes || null
    })
    setSavingTransfer(false)
    setTransferEventId(''); setTransferProductId(''); setTransferQuantity(1)
    setTransferFromId(''); setTransferToId(''); setTransferRequestedBy(''); setTransferNotes('')
    setShowTransferForm(false)
    load()
  }

  // Aprovar gera a movimentação real de saída do estoque central (ver
  // approveTransferRequest) — negar só muda o status, sem mexer no saldo.
  async function handleTransferStatusChange(t: TransferRequest, status: TransferRequestStatus) {
    if (status === 'Aprovado') {
      await approveTransferRequest(t, userId)
    } else {
      await updateTransferRequestStatus(t.id, status)
    }
    load()
  }

  const [returnQtyById, setReturnQtyById] = useState<Record<string, number>>({})
  const [savingReturnId, setSavingReturnId] = useState<string | null>(null)

  async function handleRegisterReturn(t: TransferRequest) {
    const qty = returnQtyById[t.id] ?? 0
    if (qty <= 0) return
    setSavingReturnId(t.id)
    await registerTransferReturn(t, qty, userId)
    setSavingReturnId(null)
    setReturnQtyById((prev) => ({ ...prev, [t.id]: 0 }))
    load()
  }

  function formatDateTime(iso: string) {
    return new Date(iso).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' })
  }

  async function handleAddProduct(e: React.FormEvent) {
    e.preventDefault()
    if (!newProductName.trim()) return
    const unit = newProductUnit === 'outro' ? (newProductCustomUnit.trim() || 'un') : newProductUnit
    const threshold = newProductThreshold.trim() ? Number(newProductThreshold) : null
    await createProduct(newProductName.trim(), unit, null, threshold)
    setNewProductName(''); setNewProductUnit('un'); setNewProductCustomUnit(''); setNewProductThreshold('')
    load()
  }

  // Cada produto pode ter seu próprio limite de "saldo baixo" — null usa o
  // padrão (LOW_STOCK_THRESHOLD). Latas de cerveja e pacotes de guardanapo
  // não deveriam alertar no mesmo número.
  function effectiveThreshold(productId: string): number {
    return products.find((p) => p.id === productId)?.low_stock_threshold ?? LOW_STOCK_THRESHOLD
  }

  async function handleAddLocation(e: React.FormEvent) {
    e.preventDefault()
    if (!newLocationName.trim()) return
    await createStockLocation(newLocationName.trim(), null)
    setNewLocationName('')
    load()
  }

  const balancesByLocation = locations.map((loc) => ({
    location: loc,
    items: balances.filter((b) => b.stock_location_id === loc.id && b.balance !== 0)
  }))

  const lowStockItems = useMemo(
    () => balances.filter((b) => b.balance > 0 && b.balance <= effectiveThreshold(b.product_id)),
    [balances, products]
  )

  const movementsToday = useMemo(() => {
    const today = new Date().toDateString()
    return movements.filter((m) => m.status === 'Ativo' && new Date(m.created_at).toDateString() === today)
  }, [movements])

  const movementTypeOptions = useMemo(
    () => Array.from(new Set(movements.map((m) => m.movement_type))).sort(),
    [movements]
  )

  const filteredMovements = useMemo(() => movements.filter((m) => {
    if (movementFilterProduct && m.product_id !== movementFilterProduct) return false
    if (movementFilterLocation && m.stock_location_id !== movementFilterLocation) return false
    if (movementFilterType && m.movement_type !== movementFilterType) return false
    const day = m.created_at.slice(0, 10)
    if (movementFilterFrom && day < movementFilterFrom) return false
    if (movementFilterTo && day > movementFilterTo) return false
    return true
  }), [movements, movementFilterProduct, movementFilterLocation, movementFilterType, movementFilterFrom, movementFilterTo])

  useEffect(() => {
    setMovementPage(1)
  }, [movementFilterProduct, movementFilterLocation, movementFilterType, movementFilterFrom, movementFilterTo])

  const movementTotalPages = Math.max(1, Math.ceil(filteredMovements.length / MOVEMENTS_PAGE_SIZE))
  const movementPageSafe = Math.min(movementPage, movementTotalPages)
  const movementPageStart = (movementPageSafe - 1) * MOVEMENTS_PAGE_SIZE
  const movementPageItems = filteredMovements.slice(movementPageStart, movementPageStart + MOVEMENTS_PAGE_SIZE)
  const movementFiltersActive = !!(movementFilterProduct || movementFilterLocation || movementFilterType || movementFilterFrom || movementFilterTo)

  function clearMovementFilters() {
    setMovementFilterProduct(''); setMovementFilterLocation(''); setMovementFilterType('')
    setMovementFilterFrom(''); setMovementFilterTo('')
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

  function canEditMovement(m: StockMovement) {
    return canEditStock(accessRole) || (canEditOwnStock(accessRole) && m.created_by === userId)
  }

  function startEditProduct(p: Product) {
    setEditingProductId(p.id); setEditProductName(p.name); setEditProductUnit(p.unit)
    setEditProductThreshold(p.low_stock_threshold != null ? String(p.low_stock_threshold) : '')
    setCatalogError(null)
  }

  async function saveProductEdit(id: string) {
    if (!editProductName.trim()) return
    const threshold = editProductThreshold.trim() ? Number(editProductThreshold) : null
    await updateProduct(id, { name: editProductName.trim(), unit: editProductUnit.trim() || 'un', low_stock_threshold: threshold })
    setEditingProductId(null)
    load()
  }

  async function removeProduct(id: string) {
    setCatalogError(null)
    try {
      await deleteProduct(id)
      load()
    } catch (err) {
      setCatalogError(err instanceof Error ? err.message : 'Erro ao excluir produto.')
    }
  }

  function startEditLocation(l: StockLocation) {
    setEditingLocationId(l.id); setEditLocationName(l.name); setCatalogError(null)
  }

  async function saveLocationEdit(id: string) {
    if (!editLocationName.trim()) return
    await updateStockLocation(id, { name: editLocationName.trim() })
    setEditingLocationId(null)
    load()
  }

  async function removeLocation(id: string) {
    setCatalogError(null)
    try {
      await deleteStockLocation(id)
      load()
    } catch (err) {
      setCatalogError(err instanceof Error ? err.message : 'Erro ao excluir estoque.')
    }
  }

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl md:text-3xl font-extrabold">Estoque da colmeia</h1>
          <p className="text-beetz-dark/60 mt-1">Controle multi-almoxarifado de entradas e saídas.</p>
        </div>
        <button
          onClick={() => setShowMovementForm((v) => !v)}
          className="flex items-center gap-2 honey-gradient text-beetz-dark font-bold px-4 py-2.5 rounded-xl hover:brightness-105 transition"
        >
          <Plus size={18} /> Nova movimentação
        </button>
      </div>

      {showMovementForm && <StockMovementForm onSaved={() => { setShowMovementForm(false); load() }} />}

      {loading ? (
        <p className="text-beetz-dark/50">Carregando...</p>
      ) : (
        <>
          <section className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="bg-white rounded-2xl p-4 shadow-soft border border-beetz-dark/5 flex items-center gap-3">
              <div className="bg-beetz-yellow/20 text-beetz-dark rounded-xl p-2.5"><Package size={20} /></div>
              <div>
                <p className="text-xl font-extrabold leading-none">{products.length}</p>
                <p className="text-xs text-beetz-dark/50 mt-1">Produtos cadastrados</p>
              </div>
            </div>
            <div className="bg-white rounded-2xl p-4 shadow-soft border border-beetz-dark/5 flex items-center gap-3">
              <div className="bg-beetz-yellow/20 text-beetz-dark rounded-xl p-2.5"><Warehouse size={20} /></div>
              <div>
                <p className="text-xl font-extrabold leading-none">{locations.length}</p>
                <p className="text-xs text-beetz-dark/50 mt-1">Estoques/almoxarifados</p>
              </div>
            </div>
            <div className="bg-white rounded-2xl p-4 shadow-soft border border-beetz-dark/5 flex items-center gap-3">
              <div className="bg-beetz-yellow/20 text-beetz-dark rounded-xl p-2.5"><Clock3 size={20} /></div>
              <div>
                <p className="text-xl font-extrabold leading-none">{movementsToday.length}</p>
                <p className="text-xs text-beetz-dark/50 mt-1">Movimentações hoje</p>
              </div>
            </div>
            <div className={`rounded-2xl p-4 shadow-soft border flex items-center gap-3 ${lowStockItems.length > 0 ? 'bg-red-50 border-red-100' : 'bg-white border-beetz-dark/5'}`}>
              <div className={`rounded-xl p-2.5 ${lowStockItems.length > 0 ? 'bg-red-100 text-red-600' : 'bg-beetz-yellow/20 text-beetz-dark'}`}><AlertTriangle size={20} /></div>
              <div>
                <p className={`text-xl font-extrabold leading-none ${lowStockItems.length > 0 ? 'text-red-600' : ''}`}>{lowStockItems.length}</p>
                <p className="text-xs text-beetz-dark/50 mt-1">Produtos com saldo baixo</p>
              </div>
            </div>
          </section>

          {lowStockItems.length > 0 && (
            <section className="bg-red-50 border border-red-100 rounded-2xl p-4">
              <h3 className="text-sm font-bold text-red-700 mb-2 flex items-center gap-1.5"><AlertTriangle size={15} /> Saldo baixo</h3>
              <div className="flex flex-wrap gap-2">
                {lowStockItems.map((item) => (
                  <span key={`${item.product_id}-${item.stock_location_id}`} className="text-xs font-semibold bg-white text-red-700 border border-red-200 px-3 py-1.5 rounded-full">
                    {item.product_name} · {item.stock_location_name} · {item.balance} {item.product_unit}
                  </span>
                ))}
              </div>
            </section>
          )}

          <section>
            <h2 className="text-lg font-bold mb-4">Saldo atual por estoque</h2>
            <div className="grid md:grid-cols-3 gap-4">
              {balancesByLocation.map(({ location, items }) => (
                <div key={location.id} className="bg-white rounded-2xl p-5 shadow-soft border border-beetz-dark/5">
                  <h3 className="font-bold mb-3">{location.name}</h3>
                  {items.length === 0 ? (
                    <p className="text-sm text-beetz-dark/40">Sem saldo registrado.</p>
                  ) : (
                    <ul className="space-y-2">
                      {items.map((item) => (
                        <li key={item.product_id} className="flex justify-between text-sm">
                          <span className="text-beetz-dark/70">{item.product_name}</span>
                          <span className={`font-semibold ${item.balance <= effectiveThreshold(item.product_id) ? 'text-red-600' : ''}`}>{item.balance} {item.product_unit}</span>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              ))}
            </div>
          </section>

          <section className="grid md:grid-cols-2 gap-6">
            <div className="bg-white rounded-2xl p-5 shadow-soft border border-beetz-dark/5">
              <h2 className="font-bold mb-3">Produtos</h2>
              {canManageCatalog && (
                <form onSubmit={handleAddProduct} className="flex flex-wrap gap-2 mb-4">
                  <input className={inputClass} placeholder="Nome do produto" value={newProductName} onChange={(e) => setNewProductName(e.target.value)} />
                  <select className="border border-beetz-dark/15 rounded-xl px-2 py-2 text-sm" value={newProductUnit} onChange={(e) => setNewProductUnit(e.target.value)}>
                    {COMMON_UNITS.map((u) => <option key={u} value={u}>{u}</option>)}
                    <option value="outro">Outra...</option>
                  </select>
                  {newProductUnit === 'outro' && (
                    <input className="w-24 border border-beetz-dark/15 rounded-xl px-2 py-2 text-sm" placeholder="unidade" value={newProductCustomUnit} onChange={(e) => setNewProductCustomUnit(e.target.value)} />
                  )}
                  <input
                    type="number" min={0} step="1" className="w-32 border border-beetz-dark/15 rounded-xl px-2 py-2 text-sm"
                    placeholder="Alerta (padrão 5)" value={newProductThreshold} onChange={(e) => setNewProductThreshold(e.target.value)}
                  />
                  <button className="bg-beetz-dark text-white text-sm font-semibold px-3 rounded-xl">+</button>
                </form>
              )}
              {catalogError && <p className="text-xs text-red-600 mb-3">{catalogError}</p>}
              <div className="space-y-1.5">
                {products.map((p) => (
                  <div key={p.id} className="flex items-center gap-2">
                    {editingProductId === p.id ? (
                      <>
                        <input className="flex-1 border border-beetz-dark/15 rounded-lg px-2 py-1 text-xs" value={editProductName} onChange={(e) => setEditProductName(e.target.value)} />
                        <select className="border border-beetz-dark/15 rounded-lg px-1.5 py-1 text-xs" value={COMMON_UNITS.includes(editProductUnit) ? editProductUnit : 'outro'} onChange={(e) => setEditProductUnit(e.target.value === 'outro' ? '' : e.target.value)}>
                          {COMMON_UNITS.map((u) => <option key={u} value={u}>{u}</option>)}
                          <option value="outro">Outra...</option>
                        </select>
                        {!COMMON_UNITS.includes(editProductUnit) && (
                          <input className="w-16 border border-beetz-dark/15 rounded-lg px-2 py-1 text-xs" placeholder="unidade" value={editProductUnit} onChange={(e) => setEditProductUnit(e.target.value)} />
                        )}
                        <input
                          type="number" min={0} step="1" className="w-20 border border-beetz-dark/15 rounded-lg px-2 py-1 text-xs"
                          placeholder="Alerta" value={editProductThreshold} onChange={(e) => setEditProductThreshold(e.target.value)}
                        />
                        <button onClick={() => saveProductEdit(p.id)} className="text-green-600 p-1 rounded hover:bg-green-50"><Check size={14} /></button>
                        <button onClick={() => setEditingProductId(null)} className="text-beetz-dark/40 p-1 rounded hover:bg-beetz-gray"><X size={14} /></button>
                      </>
                    ) : (
                      <>
                        <span className="text-xs font-medium bg-beetz-gray px-3 py-1.5 rounded-full flex-1">
                          {p.name} ({p.unit}) <span className="text-beetz-dark/40">· alerta ≤ {p.low_stock_threshold ?? LOW_STOCK_THRESHOLD}</span>
                        </span>
                        {canManageCatalog && (
                          <>
                            <button onClick={() => startEditProduct(p)} className="text-beetz-dark/40 hover:text-beetz-dark p-1 rounded hover:bg-beetz-gray"><Pencil size={13} /></button>
                            <button onClick={() => removeProduct(p.id)} className="text-beetz-dark/40 hover:text-red-600 p-1 rounded hover:bg-beetz-gray"><Trash2 size={13} /></button>
                          </>
                        )}
                      </>
                    )}
                  </div>
                ))}
                {products.length === 0 && <p className="text-sm text-beetz-dark/40">Nenhum produto cadastrado.</p>}
              </div>
            </div>

            <div className="bg-white rounded-2xl p-5 shadow-soft border border-beetz-dark/5">
              <h2 className="font-bold mb-3">Estoques / Almoxarifados</h2>
              {canManageCatalog && (
                <form onSubmit={handleAddLocation} className="flex gap-2 mb-4">
                  <input className={inputClass} placeholder="Nome do estoque" value={newLocationName} onChange={(e) => setNewLocationName(e.target.value)} />
                  <button className="bg-beetz-dark text-white text-sm font-semibold px-3 rounded-xl">+</button>
                </form>
              )}
              <div className="space-y-1.5">
                {locations.map((l) => (
                  <div key={l.id} className="flex items-center gap-2">
                    {editingLocationId === l.id ? (
                      <>
                        <input className="flex-1 border border-beetz-dark/15 rounded-lg px-2 py-1 text-xs" value={editLocationName} onChange={(e) => setEditLocationName(e.target.value)} />
                        <button onClick={() => saveLocationEdit(l.id)} className="text-green-600 p-1 rounded hover:bg-green-50"><Check size={14} /></button>
                        <button onClick={() => setEditingLocationId(null)} className="text-beetz-dark/40 p-1 rounded hover:bg-beetz-gray"><X size={14} /></button>
                      </>
                    ) : (
                      <>
                        <span className="text-xs font-medium bg-beetz-gray px-3 py-1.5 rounded-full flex-1">{l.name}</span>
                        {canManageCatalog && (
                          <>
                            <button onClick={() => startEditLocation(l)} className="text-beetz-dark/40 hover:text-beetz-dark p-1 rounded hover:bg-beetz-gray"><Pencil size={13} /></button>
                            <button onClick={() => removeLocation(l.id)} className="text-beetz-dark/40 hover:text-red-600 p-1 rounded hover:bg-beetz-gray"><Trash2 size={13} /></button>
                          </>
                        )}
                      </>
                    )}
                  </div>
                ))}
                {locations.length === 0 && <p className="text-sm text-beetz-dark/40">Nenhum estoque cadastrado.</p>}
              </div>
            </div>
          </section>

          <section>
            <div className="flex items-center justify-between flex-wrap gap-2 mb-4">
              <h2 className="text-lg font-bold">Movimentações recentes</h2>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setShowMovementFilters((v) => !v)}
                  className={`flex items-center gap-1.5 text-sm font-semibold px-3 py-2 rounded-xl border transition-colors ${
                    showMovementFilters || movementFiltersActive
                      ? 'bg-beetz-dark text-white border-beetz-dark' : 'border-beetz-dark/15 text-beetz-dark/70 hover:bg-beetz-gray'
                  }`}
                >
                  <Filter size={15} /> Filtros
                </button>
                {movementFiltersActive && (
                  <button
                    type="button" onClick={clearMovementFilters}
                    className="flex items-center justify-center px-3 py-2 rounded-xl border border-beetz-dark/15 text-beetz-dark/50 hover:text-red-600 hover:border-red-200 hover:bg-red-50 transition-colors"
                  >
                    <X size={15} />
                  </button>
                )}
              </div>
            </div>

            {showMovementFilters && (
              <div className="bg-white rounded-2xl p-4 shadow-soft border border-beetz-dark/5 grid grid-cols-2 md:grid-cols-5 gap-3 mb-4">
                <select value={movementFilterProduct} onChange={(e) => setMovementFilterProduct(e.target.value)} className="rounded-xl border border-beetz-dark/15 text-sm px-3 py-2">
                  <option value="">Todos os produtos</option>
                  {products.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                </select>
                <select value={movementFilterLocation} onChange={(e) => setMovementFilterLocation(e.target.value)} className="rounded-xl border border-beetz-dark/15 text-sm px-3 py-2">
                  <option value="">Todos os estoques</option>
                  {locations.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
                </select>
                <select value={movementFilterType} onChange={(e) => setMovementFilterType(e.target.value)} className="rounded-xl border border-beetz-dark/15 text-sm px-3 py-2">
                  <option value="">Todos os tipos</option>
                  {movementTypeOptions.map((t) => <option key={t} value={t}>{t}</option>)}
                </select>
                <input
                  type="date" value={movementFilterFrom} onChange={(e) => setMovementFilterFrom(e.target.value)}
                  className="rounded-xl border border-beetz-dark/15 text-sm px-3 py-2"
                />
                <input
                  type="date" value={movementFilterTo} onChange={(e) => setMovementFilterTo(e.target.value)}
                  className="rounded-xl border border-beetz-dark/15 text-sm px-3 py-2"
                />
              </div>
            )}

            <p className="text-sm text-beetz-dark/50 mb-2">
              Mostrando {filteredMovements.length === 0 ? 0 : movementPageStart + 1}–{Math.min(movementPageStart + MOVEMENTS_PAGE_SIZE, filteredMovements.length)} de {filteredMovements.length}
            </p>

            <div className="bg-white rounded-2xl shadow-soft border border-beetz-dark/5 divide-y divide-beetz-dark/5">
              {movementPageItems.map((m) => (
                <div key={m.id} className={m.status === 'Cancelado' ? 'opacity-50' : ''}>
                  <div
                    className="flex items-center gap-3 p-4 cursor-pointer hover:bg-beetz-gray/40 transition-colors"
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
                    <div className="px-4 pb-4 -mt-1 text-xs text-beetz-dark/60 space-y-1 bg-beetz-gray/30">
                      <p><span className="font-semibold">Registrado por:</span> {creatorName(m.created_by)}</p>
                      <p><span className="font-semibold">Data:</span> {formatDateTime(m.created_at)}</p>
                      {m.notes && <p><span className="font-semibold">Observações:</span> {m.notes}</p>}
                    </div>
                  )}
                </div>
              ))}
              {filteredMovements.length === 0 && (
                <p className="text-sm text-beetz-dark/50 p-4">
                  {movements.length === 0 ? 'Nenhuma movimentação ainda.' : 'Nenhuma movimentação encontrada com esses filtros.'}
                </p>
              )}
            </div>

            {movementTotalPages > 1 && (
              <div className="flex items-center justify-center gap-1.5 pt-4">
                <button
                  onClick={() => setMovementPage((p) => Math.max(1, p - 1))}
                  disabled={movementPageSafe === 1}
                  className="p-2 rounded-xl border border-beetz-dark/15 text-beetz-dark/60 hover:bg-beetz-gray disabled:opacity-30 disabled:hover:bg-transparent transition-colors"
                >
                  <ChevronLeft size={16} />
                </button>
                {getPageNumbers(movementPageSafe, movementTotalPages).map((p, i) =>
                  p === 'ellipsis' ? (
                    <span key={`e-${i}`} className="px-2 text-beetz-dark/30 text-sm">…</span>
                  ) : (
                    <button
                      key={p}
                      onClick={() => setMovementPage(p)}
                      className={`min-w-[2.25rem] h-9 px-2 rounded-xl text-sm font-semibold transition-colors ${
                        p === movementPageSafe ? 'bg-beetz-dark text-white' : 'text-beetz-dark/60 hover:bg-beetz-gray'
                      }`}
                    >
                      {p}
                    </button>
                  )
                )}
                <button
                  onClick={() => setMovementPage((p) => Math.min(movementTotalPages, p + 1))}
                  disabled={movementPageSafe === movementTotalPages}
                  className="p-2 rounded-xl border border-beetz-dark/15 text-beetz-dark/60 hover:bg-beetz-gray disabled:opacity-30 disabled:hover:bg-transparent transition-colors"
                >
                  <ChevronRight size={16} />
                </button>
              </div>
            )}
          </section>

          <section>
            <div className="flex items-center justify-between mb-4">
              <div>
                <h2 className="text-lg font-bold flex items-center gap-2"><ArrowLeftRight size={18} /> Transferências entre estoques</h2>
                <p className="text-sm text-beetz-dark/50 mt-0.5">Pedidos de mudança de produto entre almoxarifados, vinculados a um evento.</p>
              </div>
              <button
                onClick={() => setShowTransferForm((v) => !v)}
                className="flex items-center gap-1.5 text-sm font-semibold bg-beetz-dark text-white px-3 py-2 rounded-xl hover:bg-black transition-colors shrink-0"
              >
                <Plus size={16} /> Nova solicitação
              </button>
            </div>

            {showTransferForm && (
              <form onSubmit={handleAddTransfer} className="bg-beetz-gray rounded-2xl p-5 space-y-4 mb-4">
                <div>
                  <label className="text-sm font-medium block mb-1">Evento</label>
                  <select required className={inputClass + ' w-full'} value={transferEventId} onChange={(e) => setTransferEventId(e.target.value)}>
                    <option value="">Selecionar...</option>
                    {events.map((ev) => <option key={ev.id} value={ev.id}>{ev.name}</option>)}
                  </select>
                </div>
                <div className="grid sm:grid-cols-2 gap-4">
                  <div>
                    <label className="text-sm font-medium block mb-1">Produto</label>
                    <select required className={inputClass + ' w-full'} value={transferProductId} onChange={(e) => setTransferProductId(e.target.value)}>
                      <option value="">Selecionar...</option>
                      {products.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="text-sm font-medium block mb-1">Quantidade</label>
                    <input type="number" min={0} step="1" className={inputClass + ' w-full'} value={transferQuantity} onChange={(e) => setTransferQuantity(Number(e.target.value))} />
                  </div>
                </div>
                <div className="grid sm:grid-cols-2 gap-4">
                  <div>
                    <label className="text-sm font-medium block mb-1">De (estoque de origem)</label>
                    <select className={inputClass + ' w-full'} value={transferFromId} onChange={(e) => setTransferFromId(e.target.value)}>
                      <option value="">Selecionar...</option>
                      {locations.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="text-sm font-medium block mb-1">Para (estoque de destino)</label>
                    <select className={inputClass + ' w-full'} value={transferToId} onChange={(e) => setTransferToId(e.target.value)}>
                      <option value="">Selecionar...</option>
                      {locations.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
                    </select>
                  </div>
                </div>
                <div>
                  <label className="text-sm font-medium block mb-1">Solicitado por</label>
                  <input className={inputClass + ' w-full'} placeholder="Nome de quem está pedindo" value={transferRequestedBy} onChange={(e) => setTransferRequestedBy(e.target.value)} />
                </div>
                <div>
                  <label className="text-sm font-medium block mb-1">Observações</label>
                  <input className={inputClass + ' w-full'} value={transferNotes} onChange={(e) => setTransferNotes(e.target.value)} />
                </div>
                <div className="flex justify-end gap-2 pt-1">
                  <button type="button" onClick={() => setShowTransferForm(false)} className="text-sm font-semibold text-beetz-dark/50 px-4 py-2">Cancelar</button>
                  <button type="submit" disabled={savingTransfer || !transferEventId || !transferProductId} className="honey-gradient text-beetz-dark font-bold px-5 py-2 rounded-xl text-sm disabled:opacity-60">
                    {savingTransfer ? 'Salvando...' : 'Enviar solicitação'}
                  </button>
                </div>
              </form>
            )}

            <div className="bg-white rounded-2xl shadow-soft border border-beetz-dark/5 divide-y divide-beetz-dark/5">
              {transfers.map((t) => (
                <div key={t.id} className="flex flex-wrap items-center gap-3 p-4">
                  {canApproveTransfers ? (
                    <select
                      value={t.status}
                      onChange={(e) => handleTransferStatusChange(t, e.target.value as TransferRequestStatus)}
                      className={`text-xs font-semibold px-2.5 py-1 rounded-full border-0 ${transferStatusColors[t.status]}`}
                    >
                      {transferStatuses.map((s) => <option key={s} value={s}>{s}</option>)}
                    </select>
                  ) : (
                    <span className={`text-xs font-semibold px-2.5 py-1 rounded-full ${transferStatusColors[t.status]}`}>{t.status}</span>
                  )}
                  <div className="flex-1 min-w-[200px]">
                    <p className="font-semibold text-sm">{productName(t.product_id)} · {t.quantity}</p>
                    <p className="text-xs text-beetz-dark/50">
                      {locationNameOrDash(t.from_location_id)} → {locationNameOrDash(t.to_location_id)} · {eventName(t.event_id)}
                      {t.requested_by ? ` · Pedido por: ${t.requested_by}` : ''}
                      {t.notes ? ` · ${t.notes}` : ''}
                    </p>
                  </div>
                  {t.status === 'Aprovado' && canApproveTransfers && (
                    t.returned_quantity != null ? (
                      <span className="text-xs font-semibold text-green-700 bg-green-50 px-2.5 py-1.5 rounded-lg shrink-0">
                        Devolvido: {t.returned_quantity}
                      </span>
                    ) : (
                      <div className="flex items-center gap-1.5 shrink-0">
                        <input
                          type="number" min={0} step="0.01" placeholder="Sobra"
                          className="w-20 border border-beetz-dark/15 rounded-lg px-2 py-1.5 text-xs"
                          value={returnQtyById[t.id] || ''}
                          onChange={(e) => setReturnQtyById((prev) => ({ ...prev, [t.id]: Number(e.target.value) }))}
                        />
                        <button
                          onClick={() => handleRegisterReturn(t)}
                          disabled={savingReturnId === t.id || !(returnQtyById[t.id] > 0)}
                          className="text-xs font-semibold px-2.5 py-1.5 rounded-lg bg-beetz-dark text-white hover:bg-black transition-colors disabled:opacity-50"
                        >
                          {savingReturnId === t.id ? 'Salvando...' : 'Registrar devolução'}
                        </button>
                      </div>
                    )
                  )}
                </div>
              ))}
              {transfers.length === 0 && <p className="text-sm text-beetz-dark/50 p-4">Nenhuma transferência solicitada ainda.</p>}
            </div>
          </section>
        </>
      )}
    </div>
  )
}
