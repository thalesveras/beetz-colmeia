import { useEffect, useState } from 'react'
import { useAuth } from '../../contexts/AuthContext'
import { createCashierSettlement, listCashierSettlementsForEvent, listProfiles } from '../../lib/dataService'
import type { CashierRoleType, CashierSettlement, Profile } from '../../lib/types'
import Avatar from '../../components/ui/Avatar'
import { Plus } from 'lucide-react'

const roleTypes: CashierRoleType[] = ['Caixa', 'Garçom']
const inputClass = 'w-full border border-beetz-dark/15 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-beetz-yellow'

function currency(v: number) {
  return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

export default function CashierTab({ eventId }: { eventId: string }) {
  const { userId } = useAuth()
  const [settlements, setSettlements] = useState<CashierSettlement[]>([])
  const [profiles, setProfiles] = useState<Profile[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [saving, setSaving] = useState(false)

  const [profileId, setProfileId] = useState('')
  const [roleType, setRoleType] = useState<CashierRoleType>('Caixa')
  const [cash, setCash] = useState(0)
  const [debit, setDebit] = useState(0)
  const [credit, setCredit] = useState(0)
  const [pix, setPix] = useState(0)
  const [notes, setNotes] = useState('')

  async function load() {
    setLoading(true)
    const [s, p] = await Promise.all([listCashierSettlementsForEvent(eventId), listProfiles()])
    setSettlements(s)
    setProfiles(p)
    setLoading(false)
  }

  useEffect(() => { load() }, [eventId])

  const profileName = (id: string | null) => {
    const p = profiles.find((pr) => pr.id === id)
    return p ? `${p.first_name} ${p.last_name}` : 'Colaborador(a)'
  }

  const formTotal = cash + debit + credit + pix
  const formCommission = roleType === 'Garçom' ? formTotal * 0.1 : 0

  const grandTotal = settlements.reduce((sum, s) => sum + s.total, 0)
  const grandCommission = settlements.reduce((sum, s) => sum + s.commission_amount, 0)

  function resetForm() {
    setProfileId(''); setRoleType('Caixa'); setCash(0); setDebit(0); setCredit(0); setPix(0); setNotes('')
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!profileId || !userId) return
    setSaving(true)
    await createCashierSettlement({
      event_id: eventId,
      profile_id: profileId,
      role_type: roleType,
      cash_amount: cash,
      debit_amount: debit,
      credit_amount: credit,
      pix_amount: pix,
      notes: notes || null,
      created_by: userId
    })
    setSaving(false)
    resetForm()
    setShowForm(false)
    load()
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <p className="text-sm text-beetz-dark/60">
          {loading ? 'Carregando...' : `Apurado: ${currency(grandTotal)} · Comissões de garçom: ${currency(grandCommission)}`}
        </p>
        <button
          onClick={() => setShowForm((v) => !v)}
          className="flex items-center gap-1.5 text-sm font-semibold bg-beetz-dark text-white px-3 py-2 rounded-xl hover:bg-black transition-colors"
        >
          <Plus size={16} /> Novo recebimento
        </button>
      </div>

      {showForm && (
        <form onSubmit={handleSubmit} className="bg-beetz-gray rounded-2xl p-5 space-y-4">
          <div className="grid sm:grid-cols-2 gap-4">
            <div>
              <label className="text-sm font-medium block mb-1">Colaborador(a)</label>
              <select required className={inputClass} value={profileId} onChange={(e) => setProfileId(e.target.value)}>
                <option value="">Selecionar...</option>
                {profiles.map((p) => <option key={p.id} value={p.id}>{p.first_name} {p.last_name}</option>)}
              </select>
            </div>
            <div>
              <label className="text-sm font-medium block mb-1">Tipo</label>
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
            </div>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            <div><label className="text-sm font-medium block mb-1">Dinheiro</label><input type="number" min={0} step="0.01" className={inputClass} value={cash} onChange={(e) => setCash(Number(e.target.value))} /></div>
            <div><label className="text-sm font-medium block mb-1">Débito</label><input type="number" min={0} step="0.01" className={inputClass} value={debit} onChange={(e) => setDebit(Number(e.target.value))} /></div>
            <div><label className="text-sm font-medium block mb-1">Crédito</label><input type="number" min={0} step="0.01" className={inputClass} value={credit} onChange={(e) => setCredit(Number(e.target.value))} /></div>
            <div><label className="text-sm font-medium block mb-1">Pix</label><input type="number" min={0} step="0.01" className={inputClass} value={pix} onChange={(e) => setPix(Number(e.target.value))} /></div>
          </div>

          <div>
            <label className="text-sm font-medium block mb-1">Observações</label>
            <input className={inputClass} value={notes} onChange={(e) => setNotes(e.target.value)} />
          </div>

          <div className="bg-white rounded-xl px-4 py-3 flex justify-between items-center flex-wrap gap-2">
            <span className="text-sm font-medium text-beetz-dark/60">Total apurado</span>
            <span className="font-bold">{currency(formTotal)}</span>
          </div>
          {roleType === 'Garçom' && (
            <div className="bg-beetz-yellow/20 rounded-xl px-4 py-3 flex justify-between items-center">
              <span className="text-sm font-medium text-beetz-dark/70">Comissão do garçom (10%)</span>
              <span className="font-bold">{currency(formCommission)}</span>
            </div>
          )}

          <div className="flex justify-end gap-2 pt-1">
            <button type="button" onClick={() => setShowForm(false)} className="text-sm font-semibold text-beetz-dark/50 px-4 py-2">Cancelar</button>
            <button type="submit" disabled={saving} className="honey-gradient text-beetz-dark font-bold px-5 py-2 rounded-xl text-sm disabled:opacity-60">
              {saving ? 'Salvando...' : 'Salvar recebimento'}
            </button>
          </div>
        </form>
      )}

      {!loading && (
        <div className="space-y-2">
          {settlements.map((s) => (
            <div key={s.id} className="flex flex-wrap items-center gap-3 bg-white border border-beetz-dark/5 rounded-xl p-4">
              <Avatar name={profileName(s.profile_id)} size="sm" />
              <div className="flex-1 min-w-[160px]">
                <p className="font-semibold text-sm">{profileName(s.profile_id)}</p>
                <p className="text-xs text-beetz-dark/50">
                  {s.role_type} · 💵 {currency(s.cash_amount)} · 💳 {currency(s.debit_amount + s.credit_amount)} · Pix {currency(s.pix_amount)}
                </p>
              </div>
              <div className="text-right">
                <p className="font-bold text-sm">{currency(s.total)}</p>
                {s.role_type === 'Garçom' && <p className="text-xs text-beetz-dark/50">comissão {currency(s.commission_amount)}</p>}
              </div>
            </div>
          ))}
          {settlements.length === 0 && <p className="text-sm text-beetz-dark/50">Nenhum recebimento registrado ainda.</p>}
        </div>
      )}
    </div>
  )
}
