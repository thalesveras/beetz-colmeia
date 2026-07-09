import { useEffect, useMemo, useState } from 'react'
import { Check, Pencil, Plus, Trash2, Truck, X } from 'lucide-react'
import { useAuth } from '../contexts/AuthContext'
import { createSupplier, deleteSupplier, listAllExpenses, listSuppliers, updateSupplier } from '../lib/dataService'
import type { Expense, Supplier } from '../lib/types'
import { canViewFinancialSummary } from '../lib/permissions'

const inputClass = 'flex-1 border border-beetz-dark/15 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-beetz-yellow'

export default function Suppliers() {
  const { accessRole } = useAuth()
  const [loading, setLoading] = useState(true)
  const [suppliers, setSuppliers] = useState<Supplier[]>([])
  const [expenses, setExpenses] = useState<Expense[]>([])

  const [newName, setNewName] = useState('')
  const [newContact, setNewContact] = useState('')
  const [saving, setSaving] = useState(false)

  const [editingId, setEditingId] = useState<string | null>(null)
  const [editName, setEditName] = useState('')
  const [editContact, setEditContact] = useState('')
  const [error, setError] = useState<string | null>(null)

  async function load() {
    setLoading(true)
    const [sups, exps] = await Promise.all([listSuppliers(), listAllExpenses()])
    setSuppliers(sups)
    setExpenses(exps)
    setLoading(false)
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

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault()
    if (!newName.trim()) return
    setSaving(true)
    await createSupplier(newName.trim(), newContact.trim() || null)
    setSaving(false)
    setNewName('')
    setNewContact('')
    load()
  }

  function startEdit(s: Supplier) {
    setEditingId(s.id)
    setEditName(s.name)
    setEditContact(s.contact ?? '')
    setError(null)
  }

  async function saveEdit(id: string) {
    if (!editName.trim()) return
    await updateSupplier(id, { name: editName.trim(), contact: editContact.trim() || null })
    setEditingId(null)
    load()
  }

  async function remove(id: string) {
    setError(null)
    try {
      await deleteSupplier(id)
      load()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao excluir fornecedor.')
    }
  }

  if (!canViewFinancialSummary(accessRole)) {
    return (
      <div className="bg-white rounded-2xl p-8 shadow-soft border border-beetz-dark/5 text-center">
        <p className="text-4xl mb-3">🔒</p>
        <h1 className="text-xl font-bold mb-1">Acesso restrito</h1>
        <p className="text-sm text-beetz-dark/60">Essa área é exclusiva para a Diretoria.</p>
      </div>
    )
  }

  return (
    <div className="space-y-6 pb-16">
      <div>
        <h1 className="text-2xl md:text-3xl font-extrabold flex items-center gap-2">
          <Truck size={26} /> Fornecedores
        </h1>
        <p className="text-beetz-dark/60 mt-1">Cadastro de fornecedores usados nas despesas dos eventos.</p>
      </div>

      <div className="bg-beetz-gray rounded-2xl p-5">
        <h2 className="font-bold mb-3">Novo fornecedor</h2>
        <form onSubmit={handleAdd} className="flex flex-wrap gap-2">
          <input className={inputClass} placeholder="Nome do fornecedor" value={newName} onChange={(e) => setNewName(e.target.value)} />
          <input className={inputClass} placeholder="Contato (telefone, e-mail...)" value={newContact} onChange={(e) => setNewContact(e.target.value)} />
          <button
            type="submit"
            disabled={saving || !newName.trim()}
            className="flex items-center gap-1.5 honey-gradient text-beetz-dark font-bold px-4 py-2 rounded-xl text-sm disabled:opacity-60"
          >
            <Plus size={16} /> {saving ? 'Salvando...' : 'Adicionar'}
          </button>
        </form>
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}

      {loading ? (
        <p className="text-beetz-dark/50 text-sm">Carregando fornecedores...</p>
      ) : (
        <div className="bg-white rounded-2xl shadow-soft border border-beetz-dark/5 divide-y divide-beetz-dark/5">
          {suppliers.map((s) => (
            <div key={s.id} className="flex flex-wrap items-center gap-3 p-4">
              {editingId === s.id ? (
                <>
                  <input className={inputClass} value={editName} onChange={(e) => setEditName(e.target.value)} />
                  <input className={inputClass} value={editContact} onChange={(e) => setEditContact(e.target.value)} />
                  <button onClick={() => saveEdit(s.id)} className="text-green-600 p-1.5 rounded-lg hover:bg-green-50"><Check size={16} /></button>
                  <button onClick={() => setEditingId(null)} className="text-beetz-dark/40 p-1.5 rounded-lg hover:bg-beetz-gray"><X size={16} /></button>
                </>
              ) : (
                <>
                  <div className="flex-1 min-w-[200px]">
                    <p className="font-semibold text-sm">{s.name}</p>
                    <p className="text-xs text-beetz-dark/50">{s.contact || 'Sem contato cadastrado'}</p>
                  </div>
                  <span className="text-xs font-semibold bg-beetz-gray px-2.5 py-1 rounded-full">
                    {expenseCountBySupplier.get(s.id) ?? 0} despesa(s)
                  </span>
                  <button onClick={() => startEdit(s)} className="text-beetz-dark/40 hover:text-beetz-dark p-1.5 rounded-lg hover:bg-beetz-gray"><Pencil size={14} /></button>
                  <button onClick={() => remove(s.id)} className="text-beetz-dark/40 hover:text-red-600 p-1.5 rounded-lg hover:bg-beetz-gray"><Trash2 size={14} /></button>
                </>
              )}
            </div>
          ))}
          {suppliers.length === 0 && <p className="text-sm text-beetz-dark/50 p-4">Nenhum fornecedor cadastrado ainda.</p>}
        </div>
      )}
    </div>
  )
}
