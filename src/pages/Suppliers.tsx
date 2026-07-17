import { useEffect, useMemo, useState } from 'react'
import { Check, Copy, Pencil, Plus, Search, Trash2, Truck } from 'lucide-react'
import { useAuth } from '../contexts/AuthContext'
import { deleteSupplier, listAllExpenses, listSuppliers } from '../lib/dataService'
import type { Expense, Supplier } from '../lib/types'
import { canViewFinancialSummary } from '../lib/permissions'
import SupplierFormModal from '../components/finance/SupplierFormModal'

const inputClass = 'w-full border border-beetz-dark/15 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-beetz-yellow'

export default function Suppliers() {
  const { accessRole } = useAuth()
  const [loading, setLoading] = useState(true)
  const [suppliers, setSuppliers] = useState<Supplier[]>([])
  const [expenses, setExpenses] = useState<Expense[]>([])
  const [search, setSearch] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [modal, setModal] = useState<{ open: boolean; supplier: Supplier | null }>({ open: false, supplier: null })
  const [copied, setCopied] = useState<string | null>(null)

  async function load() {
    setLoading(true)
    try {
      const [sups, exps] = await Promise.all([listSuppliers(), listAllExpenses()])
      setSuppliers(sups)
      setExpenses(exps)
      setError(null)
    } catch (e: any) {
      // Antes um erro aqui deixava "Carregando fornecedores..." pra sempre na
      // tela, sem dizer o que houve. Loading eterno é erro escondido.
      setError(e?.message ?? 'Não foi possível carregar os fornecedores.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [])

  const expenseCountBySupplier = useMemo(() => {
    const map = new Map<string, number>()
    for (const exp of expenses) {
      if (!exp.supplier_id) continue
      map.set(exp.supplier_id, (map.get(exp.supplier_id) ?? 0) + 1)
    }
    return map
  }, [expenses])

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return suppliers
    return suppliers.filter((s) =>
      s.name.toLowerCase().includes(q) ||
      (s.cnpj ?? '').toLowerCase().includes(q) ||
      (s.pix_key ?? '').toLowerCase().includes(q)
    )
  }, [suppliers, search])

  async function copyPix(s: Supplier) {
    if (!s.pix_key) return
    try {
      await navigator.clipboard.writeText(s.pix_key)
      setCopied(s.id)
      setTimeout(() => setCopied(null), 2000)
    } catch { /* navegador sem clipboard: o texto está na tela pra copiar à mão */ }
  }

  async function remove(id: string) {
    setError(null)
    try { await deleteSupplier(id); load() }
    catch (e: any) { setError(e?.message ?? 'Erro ao excluir.') }
  }

  if (!canViewFinancialSummary(accessRole)) {
    return (
      <div className="bg-white rounded-2xl p-8 shadow-soft border border-beetz-dark/5 text-center">
        <p className="text-4xl mb-3">🔒</p>
        <h1 className="text-xl font-bold mb-1">Acesso restrito</h1>
        <p className="text-sm text-beetz-dark/60">Fornecedores fazem parte do Financeiro.</p>
      </div>
    )
  }

  const semPix = suppliers.filter((s) => !s.pix_key).length

  return (
    <div className="space-y-5 max-w-4xl">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl md:text-3xl font-extrabold flex items-center gap-2">
            <Truck size={24} /> Fornecedores
          </h1>
          <p className="text-beetz-dark/60 mt-1 text-sm">Quem a Beetz paga — com a chave Pix à mão na hora do pagamento.</p>
        </div>
        <button
          onClick={() => setModal({ open: true, supplier: null })}
          className="flex items-center gap-2 honey-gradient text-beetz-dark font-bold px-4 py-2.5 rounded-xl text-sm shrink-0"
        >
          <Plus size={16} /> Novo fornecedor
        </button>
      </div>

      {error && <div className="bg-red-50 border border-red-100 rounded-2xl p-3 text-sm text-red-700">{error}</div>}

      {loading ? (
        <p className="text-beetz-dark/50 text-sm">Carregando fornecedores...</p>
      ) : suppliers.length === 0 ? (
        <div className="bg-white rounded-2xl p-10 shadow-soft border border-beetz-dark/5 text-center">
          <Truck size={30} className="mx-auto text-beetz-dark/15 mb-3" />
          <p className="font-semibold text-beetz-dark/70">Nenhum fornecedor cadastrado</p>
          <p className="text-sm text-beetz-dark/40 mt-1 max-w-sm mx-auto">
            Cadastre quem abastece os eventos. Com a chave Pix salva, pagar deixa de depender de procurar no WhatsApp.
          </p>
        </div>
      ) : (
        <>
          {semPix > 0 && (
            <p className="text-xs text-beetz-dark/50 bg-beetz-yellow/15 border border-beetz-yellow/40 rounded-xl px-3 py-2">
              {semPix} fornecedor{semPix === 1 ? '' : 'es'} sem chave Pix cadastrada.
            </p>
          )}

          {suppliers.length > 5 && (
            <div className="relative">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-beetz-dark/30" />
              <input className={`${inputClass} pl-8`} placeholder="Buscar por nome, CNPJ ou chave Pix..."
                value={search} onChange={(e) => setSearch(e.target.value)} />
            </div>
          )}

          <div className="space-y-2">
            {filtered.map((s) => {
              const usos = expenseCountBySupplier.get(s.id) ?? 0
              return (
                <div key={s.id} className="bg-white rounded-2xl p-4 shadow-soft border border-beetz-dark/5">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <p className="font-bold">{s.name}</p>
                      <p className="text-xs text-beetz-dark/45 mt-0.5">
                        {[s.cnpj, s.phone, s.email, s.contact].filter(Boolean).join(' · ') || 'Sem dados de contato'}
                      </p>
                      {usos > 0 && (
                        <p className="text-[11px] text-beetz-dark/35 mt-1">{usos} despesa{usos === 1 ? '' : 's'} vinculada{usos === 1 ? '' : 's'}</p>
                      )}
                    </div>
                    <div className="flex gap-1 shrink-0">
                      <button onClick={() => setModal({ open: true, supplier: s })}
                        className="text-beetz-dark/35 hover:text-beetz-dark p-1.5 rounded-lg hover:bg-beetz-gray" title="Editar">
                        <Pencil size={14} />
                      </button>
                      <button onClick={() => remove(s.id)}
                        className="text-beetz-dark/35 hover:text-red-600 p-1.5 rounded-lg hover:bg-beetz-gray" title="Excluir">
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </div>

                  {s.pix_key && (
                    <button
                      onClick={() => copyPix(s)}
                      className="mt-3 w-full flex items-center justify-between gap-2 bg-beetz-gray/70 hover:bg-beetz-yellow/25 rounded-xl px-3 py-2 transition-colors text-left"
                      title="Copiar chave Pix"
                    >
                      <span className="min-w-0">
                        <span className="text-[10px] font-bold uppercase text-beetz-dark/40">Pix {s.pix_key_type ?? ''}</span>
                        <span className="block text-sm font-mono truncate">{s.pix_key}</span>
                      </span>
                      {copied === s.id
                        ? <span className="flex items-center gap-1 text-xs font-bold text-green-600 shrink-0"><Check size={13} /> copiado</span>
                        : <Copy size={14} className="text-beetz-dark/30 shrink-0" />}
                    </button>
                  )}

                  {s.notes && <p className="text-xs text-beetz-dark/50 mt-2 italic">{s.notes}</p>}
                </div>
              )
            })}
            {filtered.length === 0 && <p className="text-sm text-beetz-dark/40">Nenhum fornecedor encontrado.</p>}
          </div>
        </>
      )}

      {modal.open && (
        <SupplierFormModal
          supplier={modal.supplier}
          onClose={() => setModal({ open: false, supplier: null })}
          onSaved={load}
        />
      )}
    </div>
  )
}
