import { useEffect, useState } from 'react'
import { Plus } from 'lucide-react'
import {
  createProduct, createStockLocation, getStockBalances, listProducts, listStockLocations, listStockMovements
} from '../lib/dataService'
import type { Product, StockBalance, StockLocation, StockMovement } from '../lib/types'
import StockMovementForm from '../components/stock/StockMovementForm'

const inputClass = 'flex-1 border border-beetz-dark/15 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-beetz-yellow'

export default function Stock() {
  const [balances, setBalances] = useState<StockBalance[]>([])
  const [locations, setLocations] = useState<StockLocation[]>([])
  const [products, setProducts] = useState<Product[]>([])
  const [movements, setMovements] = useState<StockMovement[]>([])
  const [loading, setLoading] = useState(true)
  const [showMovementForm, setShowMovementForm] = useState(false)

  const [newProductName, setNewProductName] = useState('')
  const [newProductUnit, setNewProductUnit] = useState('un')
  const [newLocationName, setNewLocationName] = useState('')

  async function load() {
    setLoading(true)
    const [b, l, p, m] = await Promise.all([getStockBalances(), listStockLocations(), listProducts(), listStockMovements()])
    setBalances(b)
    setLocations(l)
    setProducts(p)
    setMovements(m)
    setLoading(false)
  }

  useEffect(() => { load() }, [])

  const productName = (id: string) => products.find((p) => p.id === id)?.name ?? '—'
  const locationName = (id: string) => locations.find((l) => l.id === id)?.name ?? '—'

  async function handleAddProduct(e: React.FormEvent) {
    e.preventDefault()
    if (!newProductName.trim()) return
    await createProduct(newProductName.trim(), newProductUnit.trim() || 'un', null)
    setNewProductName('')
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
                          <span className="font-semibold">{item.balance} {item.product_unit}</span>
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
              <form onSubmit={handleAddProduct} className="flex gap-2 mb-4">
                <input className={inputClass} placeholder="Nome do produto" value={newProductName} onChange={(e) => setNewProductName(e.target.value)} />
                <input className="w-20 border border-beetz-dark/15 rounded-xl px-2 py-2 text-sm" placeholder="un" value={newProductUnit} onChange={(e) => setNewProductUnit(e.target.value)} />
                <button className="bg-beetz-dark text-white text-sm font-semibold px-3 rounded-xl">+</button>
              </form>
              <div className="flex flex-wrap gap-2">
                {products.map((p) => <span key={p.id} className="text-xs font-medium bg-beetz-gray px-3 py-1.5 rounded-full">{p.name} ({p.unit})</span>)}
              </div>
            </div>

            <div className="bg-white rounded-2xl p-5 shadow-soft border border-beetz-dark/5">
              <h2 className="font-bold mb-3">Estoques / Almoxarifados</h2>
              <form onSubmit={handleAddLocation} className="flex gap-2 mb-4">
                <input className={inputClass} placeholder="Nome do estoque" value={newLocationName} onChange={(e) => setNewLocationName(e.target.value)} />
                <button className="bg-beetz-dark text-white text-sm font-semibold px-3 rounded-xl">+</button>
              </form>
              <div className="flex flex-wrap gap-2">
                {locations.map((l) => <span key={l.id} className="text-xs font-medium bg-beetz-gray px-3 py-1.5 rounded-full">{l.name}</span>)}
              </div>
            </div>
          </section>

          <section>
            <h2 className="text-lg font-bold mb-4">Movimentações recentes</h2>
            <div className="bg-white rounded-2xl shadow-soft border border-beetz-dark/5 divide-y divide-beetz-dark/5">
              {movements.slice(0, 20).map((m) => (
                <div key={m.id} className="flex items-center gap-3 p-4">
                  <span className={`text-xs font-semibold px-2.5 py-1 rounded-full ${m.movement_type === 'Entrada' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                    {m.movement_type}
                  </span>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold">{productName(m.product_id)}</p>
                    <p className="text-xs text-beetz-dark/50">{locationName(m.stock_location_id)} {m.notes ? `· ${m.notes}` : ''}</p>
                  </div>
                  <span className="font-bold text-sm">{m.quantity}</span>
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
