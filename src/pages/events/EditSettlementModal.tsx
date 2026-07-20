import { useEffect, useState } from 'react'
import { Lock, Trash2, X } from 'lucide-react'
import {
  createExpense, deleteCashierSettlement, listSettlementInternalsForEvent, updateCashierSettlement, upsertSettlementInternal
} from '../../lib/dataService'
import { useAuth } from '../../contexts/AuthContext'
import FileField from '../../components/ui/FileField'
import SmartReceiptField from '../../components/ui/SmartReceiptField'
import type { ExtractedPayments } from '../../components/ui/SmartReceiptField'
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
  const [receipt, setReceipt] = useState<string | null>(settlement.receipt_data ?? null)
  const [saving, setSaving] = useState(false)
  const [removing, setRemoving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Releitura do comprovante na edição só completa buraco: valor que já está
  // preenchido (> 0) não é sobrescrito pelo OCR.
  function applyPayments(p: ExtractedPayments) {
    if (p.dinheiro != null) setCash((c) => (Number(c.replace(',', '.')) > 0 ? c : String(p.dinheiro)))
    if (p.debito != null) setDebit((c) => (Number(c.replace(',', '.')) > 0 ? c : String(p.debito)))
    if (p.credito != null) setCredit((c) => (Number(c.replace(',', '.')) > 0 ? c : String(p.credito)))
    if (p.pix != null) setPix((c) => (Number(c.replace(',', '.')) > 0 ? c : String(p.pix)))
  }

  // Controle interno do acerto — invisível pro dono (a tabela tem RLS só de
  // revisores; aqui a gente nem tenta carregar sem canReview).
  const { userId } = useAuth()
  const [intStatus, setIntStatus] = useState<CashierSettlementInternal['status']>('Em aberto')
  const [intPending, setIntPending] = useState('')
  const [intNotes, setIntNotes] = useState('')
  const [intReceipt, setIntReceipt] = useState<string | null>(null)
  const [intReceivableId, setIntReceivableId] = useState<string | null>(null)
  const [genReceivable, setGenReceivable] = useState(true)
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
          setIntReceivableId(mine.receivable_expense_id ?? null)
        }
        setIntLoaded(true)
      })
      .catch(() => setIntLoaded(true))
  }, [canReview, settlement.id])

  const n = (v: string) => Number(v.replace(',', '.')) || 0
  const total = n(cash) + n(debit) + n(credit) + n(pix)
  const commission = roleType === 'Garçom' ? total * 0.1 : 0

  // A conta do Devendo: o que falta acertar entra CONTRA a comissão da pessoa.
  // Comissão cobre → paga-se só a diferença na hora do pagamento. Não cobre →
  // o excedente vira "a receber" no Financeiro (despesa com valor negativo,
  // que soma A FAVOR no fechamento e não deixa a dívida se perder).
  const pendingValue = intStatus === 'Devendo' ? n(intPending) : 0
  const saldoComissao = commission - pendingValue
  const receivableValue = saldoComissao < 0 ? -saldoComissao : 0

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
        notes: notes.trim() || null,
        receipt_data: receipt
      })
      if (canReview && (intDirty || intStatus !== 'Em aberto' || intNotes.trim() || intReceipt)) {
        // Devendo além da comissão + opção ligada + ainda sem lançamento →
        // gera o "a receber" UMA vez e grava o vínculo junto do controle.
        let receivableId = intReceivableId
        if (intStatus === 'Devendo' && receivableValue > 0.004 && genReceivable && !receivableId) {
          const person = personName(profileId || settlement.profile_id)
          const exp = await createExpense({
            event_id: settlement.event_id,
            status: 'Pendente',
            category: 'Equipe',
            description: `A receber — ${person} deve ${currency(receivableValue)} além da comissão (acerto)`,
            quantity: 1,
            unit_value: -receivableValue,
            dex_fee: 0,
            receipt_data: null, payment_method: null, signature_data: null, repasse_data: null,
            created_by: userId ?? null,
            team_member_id: profileId || settlement.profile_id || null,
            supplier_id: null, pending_team_member_id: null
          })
          receivableId = exp.id
          setIntReceivableId(exp.id)
        }
        await upsertSettlementInternal({
          settlement_id: settlement.id,
          status: intStatus,
          pending_amount: intStatus === 'Devendo' && intPending.trim() ? n(intPending) : null,
          internal_notes: intNotes.trim() || null,
          payment_receipt_data: intReceipt,
          receivable_expense_id: receivableId,
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

          {/* A foto que o garçom/caixa mandou no lançamento — quem revisa vê,
              amplia, troca ou manda reler (a releitura só completa campo zerado). */}
          <Field label="Comprovante do fechamento">
            <SmartReceiptField variant="pagamentos" value={receipt} onChange={setReceipt} onExtractedPayments={applyPayments} />
            {receipt && (
              <a
                href={receipt} target="_blank" rel="noreferrer"
                className="inline-block text-[11px] font-semibold text-beetz-dark/50 hover:text-beetz-dark mt-1 underline"
              >
                Abrir em tamanho cheio
              </a>
            )}
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
                <div className="space-y-2">
                  <div>
                    <label className="text-xs font-medium block mb-1 text-white/60">Quanto falta acertar (R$)</label>
                    <input
                      type="text" inputMode="decimal"
                      className="w-full border border-white/20 bg-white/10 text-white rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-beetz-yellow placeholder:text-white/30"
                      value={intPending} onChange={(e) => { setIntPending(e.target.value); setIntDirty(true) }}
                      placeholder="Ex: 350"
                    />
                  </div>

                  {/* A conta da comissão, ao vivo: cobre ou não cobre? */}
                  {pendingValue > 0 && (
                    <div className="bg-white/10 rounded-xl px-3 py-2.5 space-y-1 text-xs">
                      <div className="flex justify-between text-white/60">
                        <span>Comissão deste acerto</span><span>{currency(commission)}</span>
                      </div>
                      <div className="flex justify-between text-white/60">
                        <span>Falta acertar</span><span>− {currency(pendingValue)}</span>
                      </div>
                      {saldoComissao >= 0 ? (
                        <p className="text-green-400 font-semibold border-t border-white/10 pt-1.5">
                          A comissão cobre: na hora de pagar, pague {currency(saldoComissao)} em vez de {currency(commission)}.
                        </p>
                      ) : (
                        <p className="text-red-400 font-semibold border-t border-white/10 pt-1.5">
                          Deve {currency(receivableValue)} além da comissão.
                        </p>
                      )}
                    </div>
                  )}

                  {receivableValue > 0.004 && (
                    intReceivableId ? (
                      <p className="text-[11px] text-white/50">
                        ✓ Lançamento "a receber" já gerado no Financeiro do evento — quando pagar, aprove-o lá.
                      </p>
                    ) : (
                      <label className="flex items-start gap-2 cursor-pointer">
                        <input
                          type="checkbox" checked={genReceivable}
                          onChange={(e) => { setGenReceivable(e.target.checked); setIntDirty(true) }}
                          className="mt-0.5 rounded border-white/30"
                        />
                        <span className="text-[11px] text-white/60">
                          Gerar lançamento <span className="font-semibold text-white/90">"a receber" de {currency(receivableValue)}</span> no
                          Financeiro do evento ao salvar (entra como crédito — soma a favor no fechamento).
                        </span>
                      </label>
                    )
                  )}
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
