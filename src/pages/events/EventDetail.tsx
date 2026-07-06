import { useEffect, useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import {
  addEventMember, getEventById, getProfileById, listEventMembers, listProfiles,
  requestEventParticipation, updateEventMemberStatus
} from '../../lib/dataService'
import type { EventItem, EventMember, Profile } from '../../lib/types'
import Avatar from '../../components/ui/Avatar'
import { Check, Clock, X } from 'lucide-react'
import ExpensesTab from './ExpensesTab'
import CashierTab from './CashierTab'
import StockTab from './StockTab'
import ProductsTab from './ProductsTab'
import ProductionConsumptionTab from './ProductionConsumptionTab'
import TransferRequestsTab from './TransferRequestsTab'
import EventSummaryCard from './EventSummaryCard'
import FinancialSummaryCard from './FinancialSummaryCard'
import { useAuth } from '../../contexts/AuthContext'
import {
  canApproveEventRequests, canManageUsers, canViewCashierTab, canViewExpensesTab,
  canViewFinancialSummary, canViewStockTab
} from '../../lib/permissions'

type TabKey = 'equipe' | 'despesas' | 'recebimentos' | 'estoque' | 'produtos' | 'consumo' | 'transferencias'

export default function EventDetail() {
  const { id } = useParams()
  const { accessRole, userId } = useAuth()

  const tabs: { key: TabKey; label: string }[] = [
    { key: 'equipe', label: 'Equipe' },
    ...(canViewExpensesTab(accessRole) ? [{ key: 'despesas' as TabKey, label: 'Despesas' }] : []),
    ...(canViewCashierTab(accessRole) ? [{ key: 'recebimentos' as TabKey, label: 'Recebimentos' }] : []),
    ...(canViewStockTab(accessRole) ? [{ key: 'produtos' as TabKey, label: 'Produtos' }] : []),
    ...(canViewStockTab(accessRole) ? [{ key: 'estoque' as TabKey, label: 'Estoque' }] : []),
    ...(canViewStockTab(accessRole) ? [{ key: 'consumo' as TabKey, label: 'Consumo da produção' }] : []),
    ...(canViewStockTab(accessRole) ? [{ key: 'transferencias' as TabKey, label: 'Transferências' }] : [])
  ]
  const [event, setEvent] = useState<EventItem | null>(null)
  const [members, setMembers] = useState<(EventMember & { profile: Profile | null })[]>([])
  const [leader, setLeader] = useState<Profile | null>(null)
  const [loading, setLoading] = useState(true)

  const [allProfiles, setAllProfiles] = useState<Profile[]>([])
  const [pickedProfile, setPickedProfile] = useState('')
  const [roleInput, setRoleInput] = useState('')
  const [requestRole, setRequestRole] = useState('')
  const [requesting, setRequesting] = useState(false)
  const [activeTab, setActiveTab] = useState<TabKey>('equipe')

  async function load() {
    if (!id) return
    setLoading(true)
    const ev = await getEventById(id)
    setEvent(ev)
    if (ev?.leader_id) setLeader(await getProfileById(ev.leader_id))
    const rawMembers = await listEventMembers(id)
    const withProfiles = await Promise.all(rawMembers.map(async (m) => ({ ...m, profile: await getProfileById(m.profile_id) })))
    setMembers(withProfiles)
    setAllProfiles(await listProfiles())
    setLoading(false)
  }

  useEffect(() => { load() }, [id])

  async function handleAddMember() {
    if (!id || !pickedProfile) return
    await addEventMember(id, pickedProfile, roleInput || 'Equipe')
    setPickedProfile('')
    setRoleInput('')
    load()
  }

  async function handleRequestParticipation() {
    if (!id || !userId) return
    setRequesting(true)
    await requestEventParticipation(id, userId, requestRole || 'Equipe')
    setRequestRole('')
    setRequesting(false)
    load()
  }

  async function handleReviewRequest(memberId: string, status: EventMember['status']) {
    await updateEventMemberStatus(memberId, status)
    load()
  }

  if (!id) return null
  if (loading || !event) return <p className="p-8 text-beetz-dark/50">Carregando evento...</p>

  const approvedMembers = members.filter((m) => m.status === 'Aprovado')
  const pendingMembers = members.filter((m) => m.status === 'Pendente')
  const myMembership = members.find((m) => m.profile_id === userId)
  const availableProfiles = allProfiles.filter((p) => !members.some((m) => m.profile_id === p.id))

  return (
    <div className="space-y-6 max-w-4xl">
      <Link to="/eventos" className="text-sm text-beetz-dark/50 hover:text-beetz-dark">← Voltar para eventos</Link>

      <EventSummaryCard event={event} canEdit={canManageUsers(accessRole)} onSaved={setEvent} />

      {leader && (
        <div className="bg-white rounded-2xl shadow-soft border border-beetz-dark/5 p-5 flex items-center gap-3">
          <Avatar src={leader.avatar_url} name={`${leader.first_name} ${leader.last_name}`} size="md" />
          <div>
            <p className="text-xs text-beetz-dark/50">Líder responsável</p>
            <Link to={`/perfil/${leader.id}`} className="font-semibold hover:underline">{leader.first_name} {leader.last_name}</Link>
          </div>
        </div>
      )}

      {canViewFinancialSummary(accessRole) && (
        <FinancialSummaryCard event={event} onEventUpdated={setEvent} />
      )}

      <div className="flex gap-1 flex-wrap bg-white rounded-2xl p-1.5 shadow-soft border border-beetz-dark/5 w-fit">
        {tabs.map((t) => (
          <button
            key={t.key}
            onClick={() => setActiveTab(t.key)}
            className={`px-4 py-2 rounded-xl text-sm font-semibold transition-colors ${
              activeTab === t.key ? 'bg-beetz-dark text-white' : 'text-beetz-dark/60 hover:bg-beetz-gray'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {activeTab === 'equipe' && (
        <div className="space-y-4">
          {!myMembership && (
            <div className="bg-white rounded-2xl p-5 shadow-soft border border-beetz-dark/5">
              <p className="font-semibold text-sm mb-3">Quer participar deste evento?</p>
              <div className="flex flex-col sm:flex-row gap-2">
                <input
                  value={requestRole} onChange={(e) => setRequestRole(e.target.value)} placeholder="Função desejada (ex: Garçom, Bar...)"
                  className="flex-1 rounded-xl border border-beetz-dark/15 text-sm px-3 py-2"
                />
                <button
                  onClick={handleRequestParticipation} disabled={requesting}
                  className="honey-gradient text-beetz-dark font-bold text-sm px-4 py-2 rounded-xl disabled:opacity-60"
                >
                  {requesting ? 'Enviando...' : 'Quero participar'}
                </button>
              </div>
            </div>
          )}

          {myMembership?.status === 'Pendente' && (
            <div className="flex items-center gap-2 bg-beetz-yellow/20 border border-beetz-yellow/40 rounded-2xl p-4 text-sm">
              <Clock size={16} className="text-beetz-dark/70 shrink-0" />
              Seu pedido para participar está aguardando aprovação da Diretoria.
            </div>
          )}

          {myMembership?.status === 'Recusado' && (
            <div className="flex items-center gap-2 bg-red-50 border border-red-100 rounded-2xl p-4 text-sm text-red-700">
              <X size={16} className="shrink-0" />
              Seu pedido para participar deste evento foi recusado.
            </div>
          )}

          {canApproveEventRequests(accessRole) && pendingMembers.length > 0 && (
            <div className="bg-white rounded-2xl p-6 shadow-soft border border-beetz-dark/5">
              <h2 className="font-bold mb-4">Pedidos de participação pendentes</h2>
              <div className="space-y-2">
                {pendingMembers.map((m) => m.profile && (
                  <div key={m.id} className="flex flex-wrap items-center gap-3 bg-beetz-gray rounded-xl p-3">
                    <Avatar src={m.profile.avatar_url} name={`${m.profile.first_name} ${m.profile.last_name}`} size="sm" />
                    <div className="flex-1 min-w-[140px]">
                      <p className="font-semibold text-sm">{m.profile.first_name} {m.profile.last_name}</p>
                      <p className="text-xs text-beetz-dark/50">{m.role_in_event}</p>
                    </div>
                    <button
                      onClick={() => handleReviewRequest(m.id, 'Aprovado')}
                      className="flex items-center gap-1.5 text-xs font-semibold bg-green-600 text-white px-3 py-2 rounded-lg hover:bg-green-700 transition-colors"
                    >
                      <Check size={13} /> Aprovar
                    </button>
                    <button
                      onClick={() => handleReviewRequest(m.id, 'Recusado')}
                      className="flex items-center gap-1.5 text-xs font-semibold bg-red-50 text-red-600 px-3 py-2 rounded-lg hover:bg-red-100 transition-colors"
                    >
                      <X size={13} /> Recusar
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="bg-white rounded-2xl p-6 shadow-soft border border-beetz-dark/5">
            <h2 className="font-bold mb-4">Quem vai trabalhar junto</h2>
            {approvedMembers.length === 0 ? (
              <p className="text-sm text-beetz-dark/50">Equipe ainda não escalada.</p>
            ) : (
              <div className="grid sm:grid-cols-2 gap-3">
                {approvedMembers.map((m) => m.profile && (
                  <Link key={m.id} to={`/perfil/${m.profile.id}`} className="flex items-center gap-3 p-3 rounded-xl hover:bg-beetz-gray transition-colors">
                    <Avatar src={m.profile.avatar_url} name={`${m.profile.first_name} ${m.profile.last_name}`} size="md" />
                    <div>
                      <p className="font-semibold text-sm">{m.profile.first_name} {m.profile.last_name}</p>
                      <p className="text-xs text-beetz-dark/50">{m.role_in_event}</p>
                    </div>
                  </Link>
                ))}
              </div>
            )}

            {canManageUsers(accessRole) && (
              <div className="border-t border-beetz-dark/5 mt-5 pt-5 flex flex-col sm:flex-row gap-2">
                <select value={pickedProfile} onChange={(e) => setPickedProfile(e.target.value)} className="flex-1 rounded-xl border border-beetz-dark/15 text-sm px-3 py-2">
                  <option value="">Escalar colaborador(a)...</option>
                  {availableProfiles.map((p) => <option key={p.id} value={p.id}>{p.first_name} {p.last_name}</option>)}
                </select>
                <input
                  value={roleInput} onChange={(e) => setRoleInput(e.target.value)} placeholder="Função no evento"
                  className="sm:w-48 rounded-xl border border-beetz-dark/15 text-sm px-3 py-2"
                />
                <button onClick={handleAddMember} disabled={!pickedProfile} className="bg-beetz-dark text-white font-semibold text-sm px-4 py-2 rounded-xl disabled:opacity-40">
                  Adicionar
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {activeTab === 'despesas' && canViewExpensesTab(accessRole) && (
        <div className="bg-white rounded-2xl p-6 shadow-soft border border-beetz-dark/5">
          <ExpensesTab eventId={id} />
        </div>
      )}

      {activeTab === 'recebimentos' && canViewCashierTab(accessRole) && (
        <div className="bg-white rounded-2xl p-6 shadow-soft border border-beetz-dark/5">
          <CashierTab eventId={id} canViewAll={canManageUsers(accessRole)} isApprovedMember={myMembership?.status === 'Aprovado'} />
        </div>
      )}

      {activeTab === 'produtos' && canViewStockTab(accessRole) && (
        <div className="bg-white rounded-2xl p-6 shadow-soft border border-beetz-dark/5">
          <ProductsTab eventId={id} />
        </div>
      )}

      {activeTab === 'estoque' && canViewStockTab(accessRole) && (
        <div className="bg-white rounded-2xl p-6 shadow-soft border border-beetz-dark/5">
          <StockTab eventId={id} />
        </div>
      )}

      {activeTab === 'consumo' && canViewStockTab(accessRole) && (
        <div className="bg-white rounded-2xl p-6 shadow-soft border border-beetz-dark/5">
          <ProductionConsumptionTab eventId={id} />
        </div>
      )}

      {activeTab === 'transferencias' && canViewStockTab(accessRole) && (
        <div className="bg-white rounded-2xl p-6 shadow-soft border border-beetz-dark/5">
          <TransferRequestsTab eventId={id} canApprove={canManageUsers(accessRole)} />
        </div>
      )}
    </div>
  )
}
