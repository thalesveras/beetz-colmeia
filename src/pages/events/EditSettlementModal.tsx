import { useState } from 'react'
import { Trash2, X } from 'lucide-react'
import { deleteCashierSettlement, updateCashierSettlement } from '../../lib/dataService'
import type { CashierRoleType, CashierSettlement, Profile } from '../../lib/types'

// Modal de edição de um recebimento (fechamento de caixa/garçom), no padrão
// elegante da casa. Total e comissão recalculam ao vivo — no banco são colunas
// geradas, então aqui é só espelho do que vai acontecer.
// Quem pode: Diretoria edita tudo e exclui; o dono corrige o próprio
// lançamento enquanto Pendente (o RLS garante que ele não se auto-aprova).

const inputClass = 'w-full border border-beetz-dark/15 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-beetz-yellow'
const roleTypes: CashierRoleType[] = ['Caixa', 'Garçom']

function currency(v: number) {
  return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <div><label className="text-xs font-medium block mb-1 text-beetz-dark/70">{label}</label>{children}</div>
}

interface Props {
  settlement: CashierSettlement
  profiles: Profile[]
  /** Diretoria: troca a pessoa, edita qualquer status e pode excluir. */
  canReview: boolean
  onClose: () => void
  onSaved: () => void
}

export default function EditSettlementModal({ settlement, profiles, canReview, onClose, onSaved }: Props) {
  const [profileId, setProfileId] = useState(settlement.profile_id ?? '')
  const [roleType, setRoleType] = useState<CashierRoleType>(settlement.role_type)
  const [cash, setCash] = useState(String(settlement.cash_amount))
  const [debit, setDebit] = useState(String(settlement.debit_amount))
  const [credit, setCredit] = useState(String(settlement.credit_amount))
  const [pix, setPix] = useState(String(settlement.pix_amount))
  const [notes, setNotes] = useState(settlement.notes ?? '')
  const [saving, setSaving] = useState(false)
  const [removing, setRemoving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const n = (v: string) => Number(v.replace(',', '.')) || 0
  const total = n(cash) + n(debit) + n(credit) + n(pix)
  const commission = roleType === 'Garçom' ? total * 0.1 : 0

  const personName = (id: string | null) => {
    const p = profiles.find((pr) => pr.id === id)
    return p ? `${p.first_name} ${p.last_name}` : 'Colaborador(a)'
  }

  async function handleSave() {
    setSaving(true); setError(null)
    try {
      await updateCashierSettlement(settlement.id, {
        ...(canReview ? { profile_id: profileId || null } : {}),
        role_type: roleType,
        cash_amount: n(cash),
        debit_amount: n(debit),
        credit_amount: n(credit),
        pix_amount: n(pix),
        notes: notes.trim() || null
      })
      onSaved()
      onClose()
    } catch (e: any) {
      setError(e?.message ?? 'Não foi possível salvar (pode ser falta de permissão).')
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete() {
    if (!window.confirm('Excluir este recebimento? O valor sai do apurado do evento.')) return
    setRemoving(true); setError(null)
    try {
      await deleteCashierSettlement(settlement.id)
      onSaved()
      onClose()
    } catch (e: any) {
      setError(e?.message ?? 'Não foi possível excluir.')
      setRemoving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-3xl w-full max-w-lg max-h-[88vh] overflow-y-auto p-6" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start justify-between mb-5">
          <div>
            <h3 className="text-lg font-extrabold">Editar recebimento</h3>
            <p className="text-xs text-beetz-dark/50 mt-0.5">
              {settlement.status === 'Pendente' ? 'Lançamento pendente de revisão.' : `Status atual: ${settlement.status}.`}
            </p>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-beetz-gray" aria-label="Fechar"><X size={18} /></button>
        </div>

        {error && <p className="text-sm text-red-600 bg-red-50 border border-red-100 rounded-xl px-3 py-2 mb-4">{error}</p>}

        <div className="space-y-4">
          <Field label="Colaborador(a)">
            {canReview ? (
              <select className={inputClass} value={profileId} onChange={(e) => setProfileId(e.target.value)}>
                <option value="">Sem pessoa vinculada</option>
                {profiles.map((p) => <option key={p.id} value={p.id}>{p.first_name} {p.last_name}</option>)}
              </select>
            ) : (
              <div className={`${inputClass} bg-beetz-gray/50 text-beetz-dark/70`}>{personName(settlement.profile_id)}</div>
            )}
          </Field>

          <Field label="Tipo">
            <div className="grid grid-cols-2 gap-2">
              {roleTypes.map((r) => (
                <button
                  type="button" key={r} onClick={() => setRoleType(r)}
                  className={`text-sm font-medium px-3 py-2.5 rounded-xl border transition-colors ${
                    roleType === r ? 'bg-beetz-yellow border-beetz-yellow text-beetz-dark' : 'border-beetz-dark/15 text-beetz-dark/70 bg-white'
                  }`}
                >
                  {r} {r === 'Garçom' && '(10%)'}
                </button>
              ))}
            </div>
          </Field>

          <div className="grid grid-cols-2 gap-3">
            <Field label="Dinheiro (R$)">
              <input type="text" inputMode="decimal" className={inputClass} value={cash} onChange={(e) => setCash(e.target.value)} />
            </Field>
            <Field label="Débito (R$)">
              <input type="text" inputMode="decimal" className={inputClass} value={debit} onChange={(e) => setDebit(e.target.value)} />
            </Field>
            <Field label="Crédito (R$)">
              <input type="text" inputMode="decimal" className={inputClass} value={credit} onChange={(e) => setCredit(e.target.value)} />
            </Field>
            <Field label="Pix (R$)">
              <input type="text" inputMode="decimal" className={inputClass} value={pix} onChange={(e) => setPix(e.target.value)} />
            </Field>
          </div>

          <Field label="Observações">
            <input className={inputClass} value={notes} onChange={(e) => setNotes(e.target.value)} />
          </Field>

          <div className="bg-beetz-gray/60 rounded-xl px-4 py-2.5 flex items-center justify-between">
            <span className="text-sm text-beetz-dark/60">Total apurado</span>
            <span className="text-lg font-extrabold">{currency(total)}</span>
          </div>
          {roleType === 'Garçom' && (
            <div className="bg-beetz-yellow/20 rounded-xl px-4 py-2.5 flex items-center justify-between">
              <span className="text-sm text-beetz-dark/70">Comissão do garçom (10%)</span>
              <span className="font-bold">{currency(commission)}</span>
            </div>
          )}

          <div className="flex flex-wrap items-center gap-2 pt-2">
            <button
              onClick={handleSave}
              disabled={saving || removing}
              className="honey-gradient text-beetz-dark font-bold px-5 py-2.5 rounded-xl text-sm disabled:opacity-60"
            >
              {saving ? 'Salvando...' : 'Salvar alterações'}
            </button>
            <button onClick={onClose} className="text-sm text-beetz-dark/50 hover:text-beetz-dark px-3">Cancelar</button>
            {canReview && (
              <button
                onClick={handleDelete}
                disabled={saving || removing}
                className="ml-auto flex items-center gap-1.5 text-sm font-semibold text-red-600 hover:bg-red-50 px-3 py-2 rounded-xl disabled:opacity-60"
              >
                <Trash2 size={14} /> {removing ? 'Excluindo...' : 'Excluir'}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
