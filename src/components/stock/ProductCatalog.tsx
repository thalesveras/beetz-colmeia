import { useMemo, useState } from 'react'
import { Check, Package, Pencil, Search, Trash2, X } from 'lucide-react'
import { createProduct, deleteProduct, updateProduct } from '../../lib/dataService'
import type { Product, ProductAvgCost, StockBalance, StockLocation } from '../../lib/types'

interface Props {
  products: Product[]
  balances: StockBalance[]
  avgCosts: ProductAvgCost[]
  locations: StockLocation[]
  defaultThreshold: number
  canManage: boolean
  onChanged: () => void
  onOpenTimeline: (p: Product) => void
}

const COMMON_UNITS = ['un', 'kg', 'g', 'L', 'ml', 'caixa', 'pacote', 'saco', 'garrafa', 'fardo', 'dúzia']

// Sugestões iniciais pra não começar do zero. Não é lista fechada: o campo
// aceita qualquer texto e as categorias já usadas entram nas sugestões
// sozinhas — categoria de bar muda com o cardápio, engessar numa tabela de
// configuração seria pedir pra alguém abrir Configurações no meio da carga.
const CATEGORY_HINTS = ['Cerveja', 'Destilado', 'Refrigerante', 'Água', 'Energético', 'Insumo', 'Descartável', 'Gelo']

const inputClass = 'border border-beetz-dark/15 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-beetz-yellow'
const SEM_CATEGORIA = 'Sem categoria'

export default function ProductCatalog({
  products, balances, avgCosts, locations, defaultThreshold, canManage, onChanged, onOpenTimeline
}: Props) {
  const [search, setSearch] = useState('')
  // Filtro por almoxarifado: "todos" soma tudo; escolher um (inclusive os de
  // evento, 🎪) mostra o saldo DAQUELE lugar — é como se enxerga o estoque
  // da Vaquejada sem sair do catálogo.
  const [locationFilter, setLocationFilter] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  const [name, setName] = useState('')
  const [unit, setUnit] = useState('un')
  const [customUnit, setCustomUnit] = useState('')
  const [category, setCategory] = useState('')
  const [threshold, setThreshold] = useState('')
  // Código de barras: OBRIGATÓRIO pra produto novo (identidade única do
  // catálogo — e a busca acha por ele: bipou com leitor, achou). Fardo:
  // quantas unidades vêm num pack — a entrada em fardos desmembra sozinha.
  const [barcode, setBarcode] = useState('')
  const [pack, setPack] = useState('')

  const [editingId, setEditingId] = useState<string | null>(null)
  const [eName, setEName] = useState('')
  const [eUnit, setEUnit] = useState('')
  const [eCategory, setECategory] = useState('')
  const [eThreshold, setEThreshold] = useState('')
  const [eBarcode, setEBarcode] = useState('')
  const [ePack, setEPack] = useState('')

  // Sugestões = o que já existe no catálogo + os padrões, sem repetir.
  const categoryOptions = useMemo(() => {
    const used = products.map((p) => p.category).filter((c): c is string => !!c)
    return Array.from(new Set([...used, ...CATEGORY_HINTS])).sort((a, b) => a.localeCompare(b, 'pt-BR'))
  }, [products])

  const totalOf = (productId: string) =>
    balances
      .filter((b) => b.product_id === productId && (!locationFilter || b.stock_location_id === locationFilter))
      .reduce((s, b) => s + b.balance, 0)
  const costOf = (productId: string) => avgCosts.find((c) => c.product_id === productId)?.avg_cost ?? null

  // Agrupado por categoria, com "Sem categoria" sempre no fim — é a fila do
  // que falta classificar, não merece o topo.
  const grouped = useMemo(() => {
    const q = search.trim().toLowerCase()
    const filtered = q
      ? products.filter((p) => p.name.toLowerCase().includes(q) || (p.category ?? '').toLowerCase().includes(q) || (p.barcode ?? '').includes(search.trim()))
      : products
    const map = new Map<string, Product[]>()
    for (const p of filtered) {
      const key = p.category?.trim() || SEM_CATEGORIA
      map.set(key, [...(map.get(key) ?? []), p])
    }
    return Array.from(map.entries())
      .map(([cat, items]) => ({ cat, items: items.sort((a, b) => a.name.localeCompare(b.name, 'pt-BR')) }))
      .sort((a, b) => {
        if (a.cat === SEM_CATEGORIA) return 1
        if (b.cat === SEM_CATEGORIA) return -1
        return a.cat.localeCompare(b.cat, 'pt-BR')
      })
  }, [products, search])

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault()
    if (!name.trim()) return
    // Lei do catálogo daqui pra frente: produto novo só entra com código de
    // barras. Produtos ANTIGOS ficam como estão (regra nunca toca dado velho).
    if (!barcode.trim()) { setError('Código de barras é obrigatório: bipe ou digite o código do rótulo/fardo.'); return }
    setSaving(true); setError(null)
    try {
      await createProduct(
        name.trim(),
        unit === 'outro' ? (customUnit.trim() || 'un') : unit,
        category.trim() || null,
        threshold.trim() ? Number(threshold) : null,
        barcode.trim(),
        pack.trim() ? Math.max(1, Math.floor(Number(pack))) : null
      )
      setName(''); setUnit('un'); setCustomUnit(''); setThreshold(''); setBarcode(''); setPack('')
      // Categoria NÃO limpa: cadastrar 5 cervejas seguidas é o caso comum.
      onChanged()
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Erro ao cadastrar produto.'
      setError(msg.includes('products_barcode_unique') ? 'Já existe um produto com este código de barras.' : msg)
    } finally { setSaving(false) }
  }

  function startEdit(p: Product) {
    setEditingId(p.id); setEName(p.name); setEUnit(p.unit)
    setECategory(p.category ?? '')
    setEThreshold(p.low_stock_threshold != null ? String(p.low_stock_threshold) : '')
    setEBarcode(p.barcode ?? '')
    setEPack(p.units_per_pack != null ? String(p.units_per_pack) : '')
    setError(null)
  }

  async function saveEdit(id: string) {
    if (!eName.trim()) return
    setSaving(true); setError(null)
    try {
      await updateProduct(id, {
        name: eName.trim(), unit: eUnit.trim() || 'un',
        category: eCategory.trim() || null,
        low_stock_threshold: eThreshold.trim() ? Number(eThreshold) : null,
        barcode: eBarcode.trim() || null,
        units_per_pack: ePack.trim() ? Math.max(1, Math.floor(Number(ePack))) : null
      })
      setEditingId(null)
      onChanged()
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Erro ao salvar.'
      setError(msg.includes('products_barcode_unique') ? 'Já existe um produto com este código de barras.' : msg)
    } finally { setSaving(false) }
  }

  async function remove(id: string) {
    setError(null)
    try { await deleteProduct(id); onChanged() }
    catch (err) { setError(err instanceof Error ? err.message : 'Erro ao excluir produto.') }
  }

  const uncategorized = products.filter((p) => !p.category?.trim()).length

  return (
    <div className="bg-white rounded-2xl p-5 shadow-soft border border-beetz-dark/5">
      <div className="flex items-center justify-between gap-3 mb-4">
        <h2 className="font-bold flex items-center gap-2"><Package size={17} /> Produtos</h2>
        <span className="text-xs text-beetz-dark/40">{products.length} no catálogo</span>
      </div>

      {canManage && (
        // Grade em vez de flex com larguras fixas: a versão anterior não
        // quebrava linha e, em coluna estreita, o botão "Adicionar" vazava
        // por cima do card vizinho. Botão de largura inteira = sem vazamento
        // em tela nenhuma e alvo confortável pro polegar no celular.
        <form onSubmit={handleAdd} className="bg-beetz-gray/60 rounded-2xl p-3 mb-4 space-y-2">
          <div className="grid grid-cols-[minmax(0,1fr)_auto] gap-2">
            <input className={`${inputClass} w-full min-w-0`} placeholder="Nome do produto" value={name} onChange={(e) => setName(e.target.value)} />
            <select className={`${inputClass} w-24`} value={unit} onChange={(e) => setUnit(e.target.value)}>
              {COMMON_UNITS.map((u) => <option key={u} value={u}>{u}</option>)}
              <option value="outro">Outra...</option>
            </select>
          </div>
          {unit === 'outro' && (
            <input className={`${inputClass} w-full`} placeholder="Qual unidade? (ex: engradado)" value={customUnit} onChange={(e) => setCustomUnit(e.target.value)} />
          )}
          <div className="grid grid-cols-2 gap-2">
            {/* datalist: sugere sem obrigar — dá pra digitar categoria nova */}
            <input
              className={`${inputClass} w-full min-w-0`} list="categorias-produto" placeholder="Categoria (ex: Cerveja)"
              value={category} onChange={(e) => setCategory(e.target.value)}
            />
            <datalist id="categorias-produto">
              {categoryOptions.map((c) => <option key={c} value={c} />)}
            </datalist>
            <input
              type="number" min={0} step="1" className={`${inputClass} w-full min-w-0`}
              placeholder={`Alerta (padrão ${defaultThreshold})`} value={threshold} onChange={(e) => setThreshold(e.target.value)}
            />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <input
              inputMode="numeric" className={`${inputClass} w-full min-w-0`} placeholder="Código de barras *"
              value={barcode} onChange={(e) => setBarcode(e.target.value)}
              title="Obrigatório: o código do rótulo/fardo — a busca acha por ele (dá pra bipar com leitor)"
            />
            <input
              type="number" min={1} step="1" className={`${inputClass} w-full min-w-0`}
              placeholder="Un. por fardo (ex: 12)" value={pack} onChange={(e) => setPack(e.target.value)}
              title="Quantas unidades vêm num fardo — a entrada em fardos desmembra sozinha em unidades"
            />
          </div>
          <button
            disabled={saving || !name.trim() || !barcode.trim()}
            className="w-full bg-beetz-dark text-white text-sm font-semibold py-2.5 rounded-xl disabled:opacity-50 hover:bg-black transition-colors"
          >
            {saving ? 'Salvando...' : 'Adicionar produto'}
          </button>
        </form>
      )}

      {error && <p className="text-xs text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2 mb-3">{error}</p>}

      {uncategorized > 0 && products.length > 0 && (
        <p className="text-xs text-beetz-dark/45 bg-beetz-yellow/15 border border-beetz-yellow/40 rounded-lg px-3 py-2 mb-3">
          {uncategorized} produto{uncategorized === 1 ? '' : 's'} sem categoria. Categoria organiza o catálogo e vai ser a base dos relatórios por tipo de produto.
        </p>
      )}

      {products.length > 6 && (
        <div className="relative mb-3">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-beetz-dark/30" />
          <input
            className={`${inputClass} w-full pl-8`} placeholder="Buscar produto ou categoria..."
            value={search} onChange={(e) => setSearch(e.target.value)}
          />
        <select
          value={locationFilter}
          onChange={(e) => setLocationFilter(e.target.value)}
          className={`${inputClass} w-full mt-2 bg-white`}
          title="Ver o saldo de um almoxarifado específico"
        >
          <option value="">Todos os estoques (saldo somado)</option>
          {locations.filter((l) => !l.event_id).map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
          {locations.filter((l) => l.event_id).map((l) => <option key={l.id} value={l.id}>🎪 {l.name}</option>)}
        </select>
        </div>
      )}

      {grouped.length === 0 ? (
        <p className="text-sm text-beetz-dark/40">
          {search ? 'Nenhum produto encontrado.' : 'Nenhum produto cadastrado.'}
        </p>
      ) : (
        <div className="space-y-4">
          {grouped.map(({ cat, items }) => (
            <div key={cat}>
              <p className={`text-[11px] font-bold uppercase tracking-wide mb-1.5 px-1 ${
                cat === SEM_CATEGORIA ? 'text-beetz-dark/25' : 'text-beetz-dark/40'
              }`}>
                {cat} · {items.length}
              </p>
              <div className="space-y-1.5">
                {items.map((p) => {
                  const total = totalOf(p.id)
                  const cost = costOf(p.id)
                  const low = total <= (p.low_stock_threshold ?? defaultThreshold)
                  return editingId === p.id ? (
                    <div key={p.id} className="bg-beetz-gray/60 rounded-xl p-2 space-y-2">
                      <div className="grid grid-cols-[minmax(0,1fr)_5rem] gap-2">
                        <input className={`${inputClass} w-full min-w-0`} value={eName} onChange={(e) => setEName(e.target.value)} />
                        <input className={`${inputClass} w-full`} value={eUnit} onChange={(e) => setEUnit(e.target.value)} />
                      </div>
                      <div className="grid grid-cols-2 gap-2">
                        <input className={`${inputClass} w-full min-w-0`} list="categorias-produto" placeholder="Categoria"
                          value={eCategory} onChange={(e) => setECategory(e.target.value)} />
                        <input type="number" min={0} className={`${inputClass} w-full min-w-0`} placeholder="Alerta"
                          value={eThreshold} onChange={(e) => setEThreshold(e.target.value)} />
                      </div>
                      <div className="grid grid-cols-2 gap-2">
                        <input
                          inputMode="numeric" placeholder="Código de barras"
                          className={`${inputClass} w-full min-w-0 ${!eBarcode.trim() ? 'border-amber-400' : ''}`}
                          value={eBarcode} onChange={(e) => setEBarcode(e.target.value)}
                          title="Produto antigo sem código: complete aqui quando tiver o rótulo em mãos"
                        />
                        <input type="number" min={1} className={`${inputClass} w-full min-w-0`} placeholder="Un. por fardo"
                          value={ePack} onChange={(e) => setEPack(e.target.value)} />
                      </div>
                      <div className="flex justify-end gap-2">
                        <button onClick={() => setEditingId(null)}
                          className="text-beetz-dark/50 text-xs font-semibold px-3 py-1.5 rounded-xl hover:bg-white flex items-center gap-1"><X size={13} /> Cancelar</button>
                        <button onClick={() => saveEdit(p.id)} disabled={saving}
                          className="bg-green-600 text-white text-xs font-semibold px-3 py-1.5 rounded-xl disabled:opacity-50 flex items-center gap-1"><Check size={13} /> Salvar</button>
                      </div>
                    </div>
                  ) : (
                    <div key={p.id} className="flex items-center gap-2 group">
                      <button
                        onClick={() => onOpenTimeline(p)} title="Ver linha do tempo"
                        className="flex-1 min-w-0 text-left bg-beetz-gray hover:bg-beetz-yellow/30 rounded-full px-3 py-1.5 transition-colors"
                      >
                        <span className="text-xs font-medium">{p.name}</span>
                        <span className="text-beetz-dark/35 text-xs"> ({p.unit})</span>
                        {p.units_per_pack && p.units_per_pack > 1 ? (
                          <span className="text-beetz-dark/35 text-xs"> · fardo c/ {p.units_per_pack}</span>
                        ) : null}
                        {!p.barcode?.trim() && (
                          <span className="text-amber-600 text-xs ml-1.5" title="Complete no lápis quando tiver o rótulo em mãos">sem código</span>
                        )}
                        <span className={`text-xs ml-2 font-semibold ${low ? 'text-red-600' : 'text-beetz-dark/45'}`}>
                          {total} em estoque
                        </span>
                        {cost != null && (
                          <span className="text-xs text-beetz-dark/35 ml-2">
                            · {Number(cost).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}/un
                          </span>
                        )}
                      </button>
                      {canManage && (
                        <>
                          <button onClick={() => startEdit(p)} className="text-beetz-dark/30 hover:text-beetz-dark p-1 rounded hover:bg-beetz-gray"><Pencil size={13} /></button>
                          <button onClick={() => remove(p.id)} className="text-beetz-dark/30 hover:text-red-600 p-1 rounded hover:bg-beetz-gray"><Trash2 size={13} /></button>
                        </>
                      )}
                    </div>
                  )
                })}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
