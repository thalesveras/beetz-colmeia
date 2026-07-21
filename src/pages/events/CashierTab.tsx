import { useEffect, useMemo, useState } from 'react'
import { useAuth } from '../../contexts/AuthContext'
import {
  createCashierSettlement, listCashierSettlementsForEvent, listProfiles,
  listSettlementInternalsForEvent, updateCashierSettlementStatus
} from '../../lib/dataService'
import type { CashierRoleType, CashierSettlement, CashierStatus, Profile } from '../../lib/types'
import Avatar from '../../components/ui/Avatar'
import EditSettlementModal from './EditSettlementModal'
import SmartReceiptField from '../../components/ui/SmartReceiptField'
import type { ExtractedPayments } from '../../components/ui/SmartReceiptField'
import { ChevronRight, Plus } from 'lucide-react'
import { canReviewCashier } from '../../lib/permissions'

const roleTypes: CashierRoleType[] = ['Caixa', 'Garçom']
const statuses: CashierStatus[] = ['Pendente', 'Aprovado', 'Rejeitado']
const inputClass = 'w-full border border-beetz-dark/15 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-beetz-yellow'

const statusColors: Record<CashierStatus, string> = {
  Pendente: 'bg-beetz-yellow/30 text-beetz-dark',
  Aprovado: 'bg-green-100 text-green-700',
  Rejeitado: 'bg-red-100 text-red-700'
}

function currency(v: number) {
  return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

interface Props {
  eventId: string
  canViewAll: boolean
  isApprovedMember: boolean
}

export default function CashierTab({ eventId, canViewAll, isApprovedMember }: Props) {
  const { userId, profile, accessRole } = useAuth()
  const [settlements, setSettlements] = useState<CashierSettlement[]>([])
  // Controle interno: RLS devolve vazio pra quem não revisa — sem badge, sem erro.
  const [internals, setInternals] = useState<Map<string, { status: string; pending_amount: number | null }>>(new Map())
  const [profiles, setProfiles] = useState<Profile[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [saving, setSaving] = useState(false)
  const [editing, setEditing] = useState<CashierSettlement | null>(null)
  const canAdd = canViewAll || isApprovedMember

  const [profileId, setProfileId] = useState('')
  const [roleType, setRoleType] = useState<CashierRoleType>('Caixa')
  const [cash, setCash] = useState(0)
  const [debit, setDebit] = useState(0)
  const [credit, setCredit] = useState(0)
  const [pix, setPix] = useState(0)
  const [notes, setNotes] = useState('')
  const [receipt, setReceipt] = useState<string | null>(null)

  // O que o OCR leu do fechamento entra nos campos — sem apagar o que já foi
  // digitado: só preenche quem ainda está em zero.
  function applyPayments(p: ExtractedPayments) {
    if (p.dinheiro != null) setCash((c) => (c > 0 ? c : p.dinheiro!))
    if (p.debito != null) setDebit((c) => (c > 0 ? c : p.debito!))
    if (p.credito != null) setCredit((c) => (c > 0 ? c : p.credito!))
    if (p.pix != null) setPix((c) => (c > 0 ? c : p.pix!))
  }

  async function load() {
    setLoading(true)
    const [s, p, ints] = await Promise.all([
      listCashierSettlementsForEvent(eventId),
      listProfiles(),
      listSettlementInternalsForEvent(eventId).catch(() => [])
    ])
    setInternals(new Map(ints.map((i) => [i.settlement_id, { status: i.status, pending_amount: i.pending_amount }] as const)))
    setSettlements(s)
    setProfiles(p)
    setLoading(false)
  }

  useEffect(() => { load() }, [eventId])

  // Quem não é Diretoria só pode fechar caixa em nome de si mesmo(a) — o campo
  // fica travado no próprio usuário em vez de um seletor de colaborador(a).
  useEffect(() => {
    if (!canViewAll && userId) setProfileId(userId)
  }, [canViewAll, userId])

  const profileName = (id: string | null) => {
    const p = profiles.find((pr) => pr.id === id)
    return p ? `${p.first_name} ${p.last_name}` : 'Colaborador(a)'
  }

  const formTotal = cash + debit + credit + pix
  const formCommission = roleType === 'Garçom' ? formTotal * 0.1 : 0

  // Quem não é Diretoria só enxerga os próprios fechamentos, não os da equipe toda.
  const visibleSettlements = canViewAll ? settlements : settlements.filter((s) => s.profile_id === userId)

  const grandTotal = visibleSettlements.reduce((sum, s) => sum + s.total, 0)
  const grandCommission = visibleSettlements.reduce((sum, s) => sum + s.commission_amount, 0)

  // Quem tá devendo, somado e contado — o número que a Diretoria caça no fim
  // do evento. Pra quem não revisa, internals chega vazio pela RLS e os chips
  // simplesmente não aparecem.
  const devendoResumo = useMemo(() => {
    let total = 0
    let pessoas = 0
    let acertados = 0
    for (const s of visibleSettlements) {
      const i = internals.get(s.id)
      if (!i) continue
      if (i.status === 'Devendo') { pessoas++; total += i.pending_amount ?? 0 }
      if (i.status === 'Acertado') acertados++
    }
    return { total, pessoas, acertados }
  }, [visibleSettlements, internals])

  // Filtro avançado da lista: busca por nome + status + tipo + "só devendo".
  const [search, setSearch] = useState('')
  const [filterStatus, setFilterStatus] = useState('')
  const [filterRole, setFilterRole] = useState('')
  const [onlyDevendo, setOnlyDevendo] = useState(false)
  const norm = (s: string) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')

  const filteredSettlements = useMemo(() => visibleSettlements.filter((s) => {
    if (filterStatus && s.status !== filterStatus) return false
    if (filterRole && s.role_type !== filterRole) return false
    if (onlyDevendo && internals.get(s.id)?.status !== 'Devendo') return false
    if (search.trim() && !norm(profileName(s.profile_id)).includes(norm(search))) return false
    return true
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }), [visibleSettlements, internals, filterStatus, filterRole, onlyDevendo, search, profiles])
  const filtersActive = !!(search.trim() || filterStatus || filterRole || onlyDevendo)

  function resetForm() {
    setProfileId(canViewAll ? '' : (userId ?? '')); setRoleType('Caixa'); setCash(0); setDebit(0); setCredit(0); setPix(0); setNotes(''); setReceipt(null)
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
      receipt_data: receipt,
      notes: notes || null,
      created_by: userId
    })
    setSaving(false)
    resetForm()
    setShowForm(false)
    load()
  }

  async function handleStatusChange(id: string, status: CashierStatus) {
    await updateCashierSettlementStatus(id, status)
    load()
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <p className="text-sm text-beetz-dark/60">
          {loading
            ? 'Carregando...'
            : `${canViewAll ? 'Apurado' : 'Seu apurado'}: ${currency(grandTotal)} · Comissões de garçom: ${currency(grandCommission)}`}
        </p>
        {canAdd && (
          <button
            onClick={() => setShowForm((v) => !v)}
            className="flex items-center gap-1.5 text-sm font-semibold bg-beetz-dark text-white px-3 py-2 rounded-xl hover:bg-black transition-colors"
          >
            <Plus size={16} /> Novo recebimento
          </button>
        )}
      </div>

      {/* O placar do acerto interno: quem deve, quanto, e quantos já
          acertaram. O chip vermelho é BOTÃO — toca e a lista filtra na hora. */}
      {!loading && (devendoResumo.pessoas > 0 || devendoResumo.acertados > 0) && (
        <div className="flex flex-wrap gap-1.5">
          {devendoResumo.pessoas > 0 && (
            <button
              onClick={() => setOnlyDevendo((v) => !v)}
              className={`text-xs font-bold px-3 py-1.5 rounded-full border transition-colors ${
                onlyDevendo ? 'bg-red-600 text-white border-red-600' : 'bg-red-50 text-red-700 border-red-200 hover:bg-red-100'
              }`}
            >
              Devendo {currency(devendoResumo.total)} · {devendoResumo.pessoas} pessoa(s)
            </button>
          )}
          {devendoResumo.acertados > 0 && (
            <span className="text-xs font-bold bg-green-50 text-green-700 border border-green-200 px-3 py-1.5 rounded-full">
              {devendoResumo.acertados} acertado(s) ✓
            </span>
          )}
        </div>
      )}

      {/* Filtro avançado — aparece quando há o que filtrar. */}
      {!loading && visibleSettlements.length > 1 && (
        <div className="flex flex-wrap items-center gap-2">
          <input
            className={`${inputClass} w-full sm:w-52`}
            placeholder="Buscar por nome..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <select value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)} className={`${inputClass} w-auto`}>
            <option value="">Todos os status</option>
            {statuses.map((st) => <option key={st} value={st}>{st}</option>)}
          </select>
          <select value={filterRole} onChange={(e) => setFilterRole(e.target.value)} className={`${inputClass} w-auto`}>
            <option value="">Caixa e Garçom</option>
            {roleTypes.map((r) => <option key={r} value={r}>{r}</option>)}
          </select>
          {filtersActive && (
            <button
              onClick={() => { setSearch(''); setFilterStatus(''); setFilterRole(''); setOnlyDevendo(false) }}
              className="text-xs font-semibold text-beetz-dark/50 hover:text-red-600 px-2 py-2"
            >
              Limpar filtros
            </button>
          )}
        </div>
      )}

      {!canAdd && (
        <p className="text-sm text-beetz-dark/50 bg-beetz-gray rounded-xl p-4">
          Para lançar um fechamento você precisa ter sua participação neste evento aprovada pela Diretoria
          primeiro — veja a aba Equipe.
        </p>
      )}

      {showForm && canAdd && (
        <form onSubmit={handleSubmit} className="bg-beetz-gray rounded-2xl p-5 space-y-4">
          <div className="grid sm:grid-cols-2 gap-4">
            <div>
              <label className="text-sm font-medium block mb-1">Colaborador(a)</label>
              {canViewAll ? (
                <select required className={inputClass} value={profileId} onChange={(e) => setProfileId(e.target.value)}>
                  <option value="">Selecionar...</option>
                  {profiles.map((p) => <option key={p.id} value={p.id}>{p.first_name} {p.last_name}</option>)}
                </select>
              ) : (
                <div className={`${inputClass} bg-white text-beetz-dark/70`}>
                  {profile ? `${profile.first_name} ${profile.last_name} (você)` : 'Você'}
                </div>
              )}
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

          {/* Foto do fechamento primeiro: solta o print da maquininha e os 4
              valores de baixo já chegam preenchidos — só conferir e salvar. */}
          <div>
            <label className="text-sm font-medium block mb-1">Comprovante do fechamento</label>
            <SmartReceiptField variant="pagamentos" value={receipt} onChange={setReceipt} onExtractedPayments={applyPayments} />
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
          {filteredSettlements.map((s) => {
            const canEditThis = canReviewCashier(accessRole) || (s.profile_id === userId && s.status === 'Pendente')
            return (
            <div
              key={s.id}
              onClick={() => { if (canEditThis) setEditing(s) }}
              className={`flex flex-wrap items-center gap-3 bg-white border border-beetz-dark/5 rounded-xl p-4 transition ${
                canEditThis ? 'cursor-pointer hover:border-beetz-yellow/60 hover:shadow-glow active:scale-[0.99]' : ''
              }`}
              title={canEditThis ? 'Toque pra editar' : undefined}
            >
              {canReviewCashier(accessRole) ? (
                <select
                  value={s.status}
                  onClick={(e) => e.stopPropagation()}
                  onChange={(e) => handleStatusChange(s.id, e.target.value as CashierStatus)}
                  className={`text-xs font-semibold px-2.5 py-1 rounded-full border-0 ${statusColors[s.status]}`}
                >
                  {statuses.map((st) => <option key={st} value={st}>{st}</option>)}
                </select>
              ) : (
                <span className={`text-xs font-semibold px-2.5 py-1 rounded-full ${statusColors[s.status]}`}>{s.status}</span>
              )}
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
                {(() => {
                  const internal = internals.get(s.id)
                  if (!internal || internal.status === 'Em aberto') return null
                  return internal.status === 'Acertado' ? (
                    <span className="inline-block text-[10px] font-bold bg-green-100 text-green-700 px-1.5 py-0.5 rounded-full mt-0.5">Acertado ✓</span>
                  ) : (
                    <span className="inline-block text-[10px] font-bold bg-red-100 text-red-700 px-1.5 py-0.5 rounded-full mt-0.5">
                      Devendo{internal.pending_amount ? ` ${currency(internal.pending_amount)}` : ''}
                    </span>
                  )
                })()}
              </div>
              {canEditThis && <ChevronRight size={15} className="text-beetz-dark/25" />}
            </div>
            )
          })}
          {filteredSettlements.length === 0 && (
            <p className="text-sm text-beetz-dark/50">
              {visibleSettlements.length > 0
                ? 'Nenhum recebimento com esses filtros.'
                : canViewAll ? 'Nenhum recebimento registrado ainda.' : 'Você ainda não registrou nenhum recebimento neste evento.'}
            </p>
          )}
        </div>
      )}

      {editing && (
        <EditSettlementModal
          settlement={editing}
          profiles={profiles}
          canReview={canReviewCashier(accessRole)}
          onClose={() => setEditing(null)}
          onSaved={load}
        />
      )}
    </div>
  )
}
