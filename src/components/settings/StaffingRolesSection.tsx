import { useEffect, useMemo, useState } from 'react'
import { Check, Pencil, Plus, Trash2, Wallet, X } from 'lucide-react'
import {
  createStaffingRole, deleteStaffingRole, listDepartments, listStaffingRoles, updateStaffingRole
} from '../../lib/dataService'
import type { Department, StaffingRole } from '../../lib/types'

// Catálogo de funções da escala com valores padrão, por departamento.
// É a fonte que preenche as vagas dos eventos: quem monta a escala escolhe
// "Garçom — R$ 150" e não digita mais função nem valor na mão. Mudar o valor
// aqui só afeta vagas NOVAS — as antigas guardam o valor da época, que é o
// combinado que valia quando a pessoa aceitou.

const inputClass = 'rounded-xl border border-beetz-dark/15 text-sm px-3 py-2 focus:outline-none focus:ring-2 focus:ring-beetz-yellow'
const SEM_DEPTO = 'Sem departamento'

function brl(v: number) {
  return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

export default function StaffingRolesSection() {
  const [roles, setRoles] = useState<StaffingRole[]>([])
  const [departments, setDepartments] = useState<Department[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  const [name, setName] = useState('')
  const [deptId, setDeptId] = useState('')
  const [value, setValue] = useState('')
  const [payType, setPayType] = useState<'fixed' | 'percent'>('fixed')

  const [editingId, setEditingId] = useState<string | null>(null)
  const [eName, setEName] = useState('')
  const [eDeptId, setEDeptId] = useState('')
  const [eValue, setEValue] = useState('')
  const [ePayType, setEPayType] = useState<'fixed' | 'percent'>('fixed')

  async function load() {
    setLoading(true)
    try {
      const [r, d] = await Promise.all([listStaffingRoles(), listDepartments()])
      setRoles(r)
      setDepartments(d)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao carregar as funções.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [])

  const deptName = (id: string | null) => departments.find((d) => d.id === id)?.name ?? SEM_DEPTO

  const grouped = useMemo(() => {
    const map = new Map<string, StaffingRole[]>()
    for (const r of roles) {
      const key = deptName(r.department_id)
      map.set(key, [...(map.get(key) ?? []), r])
    }
    return Array.from(map.entries())
      .map(([dept, items]) => ({ dept, items: items.sort((a, b) => a.name.localeCompare(b.name, 'pt-BR')) }))
      .sort((a, b) => {
        if (a.dept === SEM_DEPTO) return 1
        if (b.dept === SEM_DEPTO) return -1
        return a.dept.localeCompare(b.dept, 'pt-BR')
      })
  }, [roles, departments])

  function parseValue(v: string): number {
    const n = Number(v.replace(',', '.'))
    return Number.isNaN(n) || n < 0 ? 0 : n
  }

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault()
    if (!name.trim()) return
    setSaving(true); setError(null)
    try {
      await createStaffingRole({
        name: name.trim(),
        department_id: deptId || null,
        pay_type: payType,
        default_value: payType === 'fixed' ? parseValue(value) : 0,
        default_percent: payType === 'percent' ? parseValue(value) : null
      })
      setName(''); setValue('')
      // Departamento NÃO limpa: cadastrar as funções de um depto em sequência
      // é o caso comum na primeira configuração.
      await load()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao criar a função.')
    } finally {
      setSaving(false)
    }
  }

  function startEdit(r: StaffingRole) {
    setEditingId(r.id); setEName(r.name)
    setEDeptId(r.department_id ?? '')
    setEPayType(r.pay_type)
    setEValue(r.pay_type === 'percent' ? String(r.default_percent ?? '') : String(r.default_value))
    setError(null)
  }

  async function saveEdit(id: string) {
    if (!eName.trim()) return
    setSaving(true); setError(null)
    try {
      await updateStaffingRole(id, {
        name: eName.trim(),
        department_id: eDeptId || null,
        pay_type: ePayType,
        default_value: ePayType === 'fixed' ? parseValue(eValue) : 0,
        default_percent: ePayType === 'percent' ? parseValue(eValue) : null
      })
      setEditingId(null)
      await load()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao salvar a função.')
    } finally {
      setSaving(false)
    }
  }

  async function toggleActive(r: StaffingRole) {
    setError(null)
    try {
      await updateStaffingRole(r.id, { active: !r.active })
      await load()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao pausar/ativar a função.')
    }
  }

  async function remove(r: StaffingRole) {
    if (!window.confirm(`Excluir a função "${r.name}"? Vagas antigas continuam valendo (guardam rótulo e valor da época).`)) return
    setError(null)
    try {
      await deleteStaffingRole(r.id)
      await load()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao excluir a função.')
    }
  }

  return (
    <div className="bg-white rounded-2xl p-5 md:p-6 shadow-soft border border-beetz-dark/5">
      <h2 className="text-lg font-bold mb-1 flex items-center gap-2"><Wallet size={18} /> Funções & valores da escala</h2>
      <p className="text-sm text-beetz-dark/60 mb-4">
        Cadastre as funções que a Beetz já conhece (Garçom, Caixa, Líder de bar...) com o pagamento padrão:
        valor fixo por evento ou percentual sobre o que a própria pessoa registrar em Recebimentos (caso do Garçom, 8–10%).
        Quem monta a escala escolhe a função e o combinado entra sozinho — ajustável por pessoa quando precisar.
        Função pausada some do seletor de vagas sem apagar histórico.
      </p>

      {error && <p className="text-sm text-red-600 bg-red-50 border border-red-100 rounded-xl px-3 py-2 mb-4">{error}</p>}

      <form onSubmit={handleAdd} className="bg-beetz-gray/60 rounded-2xl p-3 mb-5 space-y-2">
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          <input className={`${inputClass} w-full min-w-0 col-span-2 sm:col-span-1`} placeholder="Função (ex: Garçom)" value={name} onChange={(e) => setName(e.target.value)} />
          <select className={`${inputClass} w-full min-w-0`} value={deptId} onChange={(e) => setDeptId(e.target.value)}>
            <option value="">Sem departamento</option>
            {departments.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
          </select>
          {/* Como paga: fixo por evento ou comissão sobre o que a pessoa
              registrar em Recebimentos (caso Garçom, 8–10% das vendas). */}
          <select className={`${inputClass} w-full min-w-0`} value={payType} onChange={(e) => setPayType(e.target.value as 'fixed' | 'percent')}>
            <option value="fixed">Valor fixo</option>
            <option value="percent">% das vendas</option>
          </select>
          <input
            type="text" inputMode="decimal" className={`${inputClass} w-full min-w-0`}
            placeholder={payType === 'percent' ? '% padrão (ex: 8)' : 'Valor por evento (R$)'}
            value={value} onChange={(e) => setValue(e.target.value)}
          />
        </div>
        <button
          disabled={saving || !name.trim()}
          className="w-full sm:w-auto flex items-center justify-center gap-1.5 honey-gradient text-beetz-dark font-bold px-4 py-2.5 rounded-xl text-sm disabled:opacity-60"
        >
          <Plus size={15} /> {saving ? 'Salvando...' : 'Adicionar função'}
        </button>
      </form>

      {loading ? (
        <p className="text-sm text-beetz-dark/40">Carregando...</p>
      ) : roles.length === 0 ? (
        <p className="text-sm text-beetz-dark/40">Nenhuma função cadastrada ainda — comece pelas mais usadas (Garçom, Caixa...).</p>
      ) : (
        <div className="space-y-5">
          {grouped.map(({ dept, items }) => (
            <div key={dept}>
              <p className={`text-[11px] font-bold uppercase tracking-wide mb-2 px-1 ${
                dept === SEM_DEPTO ? 'text-beetz-dark/25' : 'text-beetz-dark/40'
              }`}>
                {dept} · {items.length}
              </p>
              <div className="space-y-1.5">
                {items.map((r) => (
                  editingId === r.id ? (
                    <div key={r.id} className="bg-beetz-gray/60 rounded-xl p-2 space-y-2">
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                        <input className={`${inputClass} w-full min-w-0 col-span-2 sm:col-span-1`} value={eName} onChange={(e) => setEName(e.target.value)} />
                        <select className={`${inputClass} w-full min-w-0`} value={eDeptId} onChange={(e) => setEDeptId(e.target.value)}>
                          <option value="">Sem departamento</option>
                          {departments.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
                        </select>
                        <select className={`${inputClass} w-full min-w-0`} value={ePayType} onChange={(e) => setEPayType(e.target.value as 'fixed' | 'percent')}>
                          <option value="fixed">Valor fixo</option>
                          <option value="percent">% das vendas</option>
                        </select>
                        <input type="text" inputMode="decimal" className={`${inputClass} w-full min-w-0`} placeholder={ePayType === 'percent' ? '% padrão' : 'R$'} value={eValue} onChange={(e) => setEValue(e.target.value)} />
                      </div>
                      <div className="flex justify-end gap-2">
                        <button onClick={() => setEditingId(null)} className="text-beetz-dark/50 text-xs font-semibold px-3 py-1.5 rounded-xl hover:bg-white flex items-center gap-1">
                          <X size={13} /> Cancelar
                        </button>
                        <button onClick={() => saveEdit(r.id)} disabled={saving} className="bg-green-600 text-white text-xs font-semibold px-3 py-1.5 rounded-xl disabled:opacity-50 flex items-center gap-1">
                          <Check size={13} /> Salvar
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div key={r.id} className={`flex flex-wrap items-center gap-2 rounded-xl px-3 py-2 ${r.active ? 'bg-beetz-gray' : 'bg-beetz-gray/40 opacity-60'}`}>
                      <span className="text-sm font-semibold flex-1 min-w-[120px]">{r.name}</span>
                      <span className="text-sm font-bold">
                        {r.pay_type === 'percent'
                          ? (r.default_percent != null ? `${r.default_percent}% das vendas` : '% a definir')
                          : (r.default_value > 0 ? brl(r.default_value) : '—')}
                      </span>
                      <button
                        onClick={() => toggleActive(r)}
                        className={`text-[11px] font-bold px-2.5 py-1 rounded-full transition-colors ${
                          r.active ? 'bg-green-100 text-green-700 hover:bg-green-200' : 'bg-beetz-dark/10 text-beetz-dark/50 hover:bg-beetz-dark/20'
                        }`}
                        title={r.active ? 'Pausar (some do seletor de vagas)' : 'Reativar'}
                      >
                        {r.active ? 'Ativa' : 'Pausada'}
                      </button>
                      <button onClick={() => startEdit(r)} className="text-beetz-dark/40 hover:text-beetz-dark p-1.5 rounded-lg hover:bg-white"><Pencil size={13} /></button>
                      <button onClick={() => remove(r)} className="text-beetz-dark/40 hover:text-red-600 p-1.5 rounded-lg hover:bg-white"><Trash2 size={13} /></button>
                    </div>
                  )
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
