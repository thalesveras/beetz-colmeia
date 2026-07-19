import { useEffect, useState } from 'react'
import { Lock, Trash2, X } from 'lucide-react'
import {
  deleteCashierSettlement, listSettlementInternalsForEvent, updateCashierSettlement, upsertSettlementInternal
} from '../../lib/dataService'
import { useAuth } from '../../contexts/AuthContext'
import FileField from '../../components/ui/FileField'
import type { CashierRoleType, CashierSettlement, CashierSettlementInternal, Profile } from '../../lib/types'

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

  // Controle interno do acerto — invisível pro dono (a tabela tem RLS só de
  // revisores; aqui a gente nem tenta carregar sem canReview).
  const { userId } = useAuth()
  const [intStatus, setIntStatus] = useState<CashierSettlementInternal['status']>('Em aberto')
  const [intPending, setIntPending] = useState('')
  const [intNotes, setIntNotes] = useState('')
  const [intReceipt, setIntReceipt] = useState<string | null>(null)
  const [intLoaded, setIntLoaded] = useState(false)
  const [intDirty, setIntDirty] = useState(false)

  useEffect(() => {
    if (!canReview) return
    listSettlementInternalsForEvent(settlement.event_id)
      .then((rows) => {
        const mine = rows.find((r) => r.settlement_id === settlement.id)
        if (mine) {
          setIntStatus(mine.status)
          setIntPending(mine.pending_amount != null ? String(mine.pending_amount) : '')
          setIntNotes(mine.internal_notes ?? '')
          setIntReceipt(mine.payment_receipt_data)
        }
        setIntLoaded(true)
      })
      .catch(() => setIntLoaded(true))
  }, [canReview, settlement.id])

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
      if (canReview && (intDirty || intStatus !== 'Em aberto' || intNotes.trim() || intReceipt)) {
        await upsertSettlementInternal({
          settlement_id: settlement.id,
          status: intStatus,
          pending_amount: intStatus === 'Devendo' && intPending.trim() ? n(intPending) : null,
          internal_notes: intNotes.trim() || null,
          payment_receipt_data: intReceipt,
          updated_by: userId ?? null
        })
      }
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

          {canReview && (
            <div className="bg-beetz-dark text-white rounded-2xl p-4 space-y-3">
              <p className="text-xs font-bold uppercase tracking-wide text-beetz-yellow flex items-center gap-1.5">
                <Lock size={12} /> Controle interno · só quem revisa vê
              </p>
              <div className="grid grid-cols-3 gap-2">
                {(['Em aberto', 'Devendo', 'Acertado'] as const).map((st) => (
                  <button
                    type="button" key={st}
                    onClick={() => { setIntStatus(st); setIntDirty(true) }}
                    disabled={!intLoaded}
                    className={`text-xs font-semibold px-2 py-2 rounded-xl border transition-colors disabled:opacity-40 ${
                      intStatus === st
                        ? st === 'Acertado' ? 'bg-green-500 border-green-500 text-white'
                          : st === 'Devendo' ? 'bg-red-500 border-red-500 text-white'
                          : 'bg-beetz-yellow border-beetz-yellow text-beetz-dark'
                        : 'border-white/20 text-white/60 hover:border-white/40'
                    }`}
                  >
                    {st}
                  </button>
                ))}
              </div>
              {intStatus === 'Devendo' && (
                <div>
                  <label className="text-xs font-medium block mb-1 text-white/60">Quanto falta acertar (R$)</label>
                  <input
                    type="text" inputMode="decimal"
                    className="w-full border border-white/20 bg-white/10 text-white rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-beetz-yellow placeholder:text-white/30"
                    value={intPending} onChange={(e) => { setIntPending(e.target.value); setIntDirty(true) }}
                    placeholder="Ex: 350"
                  />
                </div>
              )}
              <div>
                <label className="text-xs font-medium block mb-1 text-white/60">Anotações internas</label>
                <textarea
                  className="w-full border border-white/20 bg-white/10 text-white rounded-xl px-3 py-2 text-sm min-h-[60px] resize-y focus:outline-none focus:ring-2 focus:ring-beetz-yellow placeholder:text-white/30"
                  value={intNotes} onChange={(e) => { setIntNotes(e.target.value); setIntDirty(true) }}
                  placeholder="Ex: entregou só o cartão, dinheiro fica pro acerto de segunda..."
                />
              </div>
              <div className="bg-white rounded-xl p-3">
                <FileField
                  label="Comprovante de pagamento"
                  value={intReceipt}
                  onChange={(v) => { setIntReceipt(v); setIntDirty(true) }}
                />
              </div>
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
