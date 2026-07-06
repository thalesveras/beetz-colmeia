import { useEffect, useMemo, useState } from 'react'
import { Plus, Pencil, Ban, RotateCcw, Check, X, Trash2, ChevronDown, ChevronUp, Package, Warehouse, AlertTriangle, Clock3 } from 'lucide-react'
import {
  createProduct, createStockLocation, deleteProduct, deleteStockLocation, getStockBalances, listProducts,
  listProfiles, listStockLocations, listStockMovements, updateProduct, updateStockLocation, updateStockMovement
} from '../lib/dataService'
import type { Product, Profile, StockBalance, StockLocation, StockMovement } from '../lib/types'
import StockMovementForm from '../components/stock/StockMovementForm'
import { useAuth } from '../contexts/AuthContext'
import { canEditOwnStock, canEditStock, canManageStockCatalog } from '../lib/permissions'

const inputClass = 'flex-1 border border-beetz-dark/15 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-beetz-yellow'
const COMMON_UNITS = ['un', 'kg', 'g', 'L', 'ml', 'caixa', 'pacote', 'saco', 'garrafa', 'fardo', 'dúzia']
const LOW_STOCK_THRESHOLD = 5

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

  const [newProductName, setNewProductName] = useState('')
  const [newProductUnit, setNewProductUnit] = useState('un')
  const [newProductCustomUnit, setNewProductCustomUnit] = useState('')
  const [newLocationName, setNewLocationName] = useState('')

  const canManageCatalog = canManageStockCatalog(accessRole)

  // Produto/estoque em edição inline (cadastro rápido)
  const [editingProductId, setEditingProductId] = useState<string | null>(null)
  const [editProductName, setEditProductName] = useState('')
  const [editProductUnit, setEditProductUnit] = useState('')
  const [editingLocationId, setEditingLocationId] = useState<string | null>(null)
  const [editLocationName, setEditLocationName] = useState('')
  const [catalogError, setCatalogError] = useState<string | null>(null)

  async function load() {
    setLoading(true)
    const [b, l, p, m, pr] = await Promise.all([
      getStockBalances(), listStockLocations(), listProducts(), listStockMovements(), listProfiles()
    ])
    setBalances(b)
    setLocations(l)
    setProducts(p)
    setMovements(m)
    setProfiles(pr)
    setLoading(false)
  }

  useEffect(() => { load() }, [])

  const productName = (id: string) => products.find((p) => p.id === id)?.name ?? '—'
  const locationName = (id: string) => locations.find((l) => l.id === id)?.name ?? '—'
  const creatorName = (id: string | null) => {
    const p = profiles.find((pr) => pr.id === id)
    return p ? `${p.first_name} ${p.last_name}` : 'Desconhecido(a)'
  }

  function formatDateTime(iso: string) {
    return new Date(iso).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' })
  }

  async function handleAddProduct(e: React.FormEvent) {
    e.preventDefault()
    if (!newProductName.trim()) return
    const unit = newProductUnit === 'outro' ? (newProductCustomUnit.trim() || 'un') : newProductUnit
    await createProduct(newProductName.trim(), unit, null)
    setNewProductName(''); setNewProductUnit('un'); setNewProductCustomUnit('')
    load()
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
    () => balances.filter((b) => b.balance > 0 && b.balance <= LOW_STOCK_THRESHOLD),
    [balances]
  )

  const movementsToday = useMemo(() => {
    const today = new Date().toDateString()
    return movements.filter((m) => m.status === 'Ativo' && new Date(m.created_at).toDateString() === today)
  }, [movements])

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
    setEditingProductId(p.id); setEditProductName(p.name); setEditProductUnit(p.unit); setCatalogError(null)
  }

  async function saveProductEdit(id: string) {
    if (!editProductName.trim()) return
    await updateProduct(id, { name: editProductName.trim(), unit: editProductUnit.trim() || 'un' })
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
              <h3 className="text-sm font-bold text-red-700 mb-2 flex items-center gap-1.5"><AlertTriangle size={15} /> Saldo baixo (≤ {LOW_STOCK_THRESHOLD})</h3>
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
                          <span className={`font-semibold ${item.balance <= LOW_STOCK_THRESHOLD ? 'text-red-600' : ''}`}>{item.balance} {item.product_unit}</span>
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
                        <button onClick={() => saveProductEdit(p.id)} className="text-green-600 p-1 rounded hover:bg-green-50"><Check size={14} /></button>
                        <button onClick={() => setEditingProductId(null)} className="text-beetz-dark/40 p-1 rounded hover:bg-beetz-gray"><X size={14} /></button>
                      </>
                    ) : (
                      <>
                        <span className="text-xs font-medium bg-beetz-gray px-3 py-1.5 rounded-full flex-1">{p.name} ({p.unit})</span>
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
            <h2 className="text-lg font-bold mb-4">Movimentações recentes</h2>
            <div className="bg-white rounded-2xl shadow-soft border border-beetz-dark/5 divide-y divide-beetz-dark/5">
              {movements.slice(0, 20).map((m) => (
                <div key={m.id} className={m.status === 'Cancelado' ? 'opacity-50' : ''}>
                  <div
                    className="flex items-center gap-3 p-4 cursor-pointer hover:bg-beetz-gray/40 transition-colors"
                    onClick={() => setExpandedId((cur) => (cur === m.id ? null : m.id))}
                  >
                    <span className={`text-xs font-semibold px-2.5 py-1 rounded-full ${m.movement_type === 'Entrada' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
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
              {movements.length === 0 && <p className="text-sm text-beetz-dark/50 p-4">Nenhuma movimentação ainda.</p>}
            </div>
          </section>
        </>
      )}
    </div>
  )
}
