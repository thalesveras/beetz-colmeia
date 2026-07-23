import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { Receipt } from 'lucide-react'
import { useAuth } from '../contexts/AuthContext'
import { listAllCashierSettlements, listAllSettlementInternals, listEvents, listProfilesLite } from '../lib/dataService'
import type { CashierRoleType, CashierSettlement, CashierSettlementInternal, CashierStatus, EventItem, Profile } from '../lib/types'
import { canMoveSettlementEvent, canReviewCashier, canViewFinancialSummary } from '../lib/permissions'
import EditSettlementModal from './events/EditSettlementModal'

const selectClass = 'rounded-xl border border-beetz-dark/15 text-sm px-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-beetz-yellow bg-white'

const statusColors: Record<CashierStatus, string> = {
  Pendente: 'bg-beetz-yellow/30 text-beetz-dark',
  Aprovado: 'bg-green-100 text-green-700',
  Rejeitado: 'bg-red-100 text-red-700'
}

function currency(v: number) {
  return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

function formatDateTime(iso: string) {
  return new Date(iso).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' })
}

export default function Receipts() {
  const { accessRole } = useAuth()
  const [loading, setLoading] = useState(true)
  const [settlements, setSettlements] = useState<CashierSettlement[]>([])
  const [internals, setInternals] = useState<Map<string, CashierSettlementInternal>>(new Map())
  const [events, setEvents] = useState<EventItem[]>([])
  const [profiles, setProfiles] = useState<Profile[]>([])
  const [eventFilter, setEventFilter] = useState('')
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [roleFilter, setRoleFilter] = useState('')
  const [onlyDevendo, setOnlyDevendo] = useState(false)
  // Recebimento aberto pra edição (modal padrão da casa, o mesmo do evento).
  const [editing, setEditing] = useState<CashierSettlement | null>(null)
  const norm = (s: string) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')

  async function load() {
    setLoading(true)
    const [s, ints, evs, profs] = await Promise.all([
      listAllCashierSettlements(),
      listAllSettlementInternals().catch(() => [] as CashierSettlementInternal[]),
      listEvents(),
      // Lite: era o listProfiles COMPLETO (7,8 MB com fotos base64) que
      // segurava esta tela no "Carregando recebimentos..." — a página só
      // precisa de nomes.
      listProfilesLite()
    ])
    setSettlements(s)
    setInternals(new Map(ints.map((i) => [i.settlement_id, i])))
    setEvents(evs)
    setProfiles(profs)
    setLoading(false)
  }

  useEffect(() => { load() }, [])

  const eventsById = useMemo(() => {
    const map = new Map<string, EventItem>()
    for (const ev of events) map.set(ev.id, ev)
    return map
  }, [events])

  const profileName = (id: string | null) => {
    if (!id) return 'Colaborador(a)'
    const p = profiles.find((pr) => pr.id === id)
    if (!p) return 'Colaborador(a)'
    // Conta sem nome preenchido (ex.: login de teste) mostrava "null null".
    const nome = [p.first_name, p.last_name].filter(Boolean).join(' ').trim()
    return nome || 'Sem nome (perfil incompleto)'
  }

  const filtered = useMemo(() => {
    return settlements
      .filter((s) => !eventFilter || s.event_id === eventFilter)
      .filter((s) => !statusFilter || s.status === statusFilter)
      .filter((s) => !roleFilter || s.role_type === roleFilter)
      .filter((s) => !onlyDevendo || internals.get(s.id)?.status === 'Devendo')
      .filter((s) => !search.trim() || norm(profileName(s.profile_id)).includes(norm(search)))
      .sort((a, b) => (a.created_at < b.created_at ? 1 : -1))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [settlements, eventFilter, statusFilter, roleFilter, onlyDevendo, search, internals, profiles])

  const total = useMemo(() => filtered.reduce((sum, s) => sum + s.total, 0), [filtered])
  const totalCommission = useMemo(() => filtered.reduce((sum, s) => sum + s.commission_amount, 0), [filtered])

  // A conta de quem deve a casa, POR PESSOA, no escopo do evento selecionado
  // (ignora os outros filtros de propósito — é um placar, não uma busca):
  // soma o "falta acertar" de todos os lançamentos Devendo da pessoa.
  const devedores = useMemo(() => {
    const map = new Map<string, { profileId: string; total: number; lancamentos: number; eventos: Set<string> }>()
    for (const s of settlements) {
      if (eventFilter && s.event_id !== eventFilter) continue
      const i = internals.get(s.id)
      if (!i || i.status !== 'Devendo' || !s.profile_id) continue
      const entry = map.get(s.profile_id) ?? { profileId: s.profile_id, total: 0, lancamentos: 0, eventos: new Set<string>() }
      entry.total += i.pending_amount ?? 0
      entry.lancamentos++
      entry.eventos.add(s.event_id)
      map.set(s.profile_id, entry)
    }
    return Array.from(map.values()).sort((a, b) => b.total - a.total)
  }, [settlements, internals, eventFilter])
  const totalDevendo = useMemo(() => devedores.reduce((s, d) => s + d.total, 0), [devedores])
  const acertados = useMemo(() => {
    let n = 0
    for (const s of settlements) {
      if (eventFilter && s.event_id !== eventFilter) continue
      if (internals.get(s.id)?.status === 'Acertado') n++
    }
    return n
  }, [settlements, internals, eventFilter])

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
          <Receipt size={26} /> Recebimentos
        </h1>
        <p className="text-beetz-dark/60 mt-1">Todos os fechamentos de caixa (vendas), de todos os eventos.</p>
      </div>

      <div className="bg-white rounded-2xl p-4 shadow-soft border border-beetz-dark/5">
        <div className="flex flex-wrap items-center gap-3">
          <select value={eventFilter} onChange={(e) => setEventFilter(e.target.value)} className={selectClass}>
            <option value="">Todos os eventos</option>
            {events.map((ev) => <option key={ev.id} value={ev.id}>{ev.name}</option>)}
          </select>
          <input
            className={`${selectClass} w-full sm:w-52`}
            placeholder="Buscar por nome..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className={selectClass}>
            <option value="">Todos os status</option>
            {(['Pendente', 'Aprovado', 'Rejeitado'] as CashierStatus[]).map((st) => <option key={st} value={st}>{st}</option>)}
          </select>
          <select value={roleFilter} onChange={(e) => setRoleFilter(e.target.value)} className={selectClass}>
            <option value="">Caixa e Garçom</option>
            {(['Caixa', 'Garçom'] as CashierRoleType[]).map((r) => <option key={r} value={r}>{r}</option>)}
          </select>
          <button
            onClick={() => setOnlyDevendo((v) => !v)}
            className={`text-xs font-bold px-3 py-2.5 rounded-xl border transition-colors ${
              onlyDevendo ? 'bg-red-600 text-white border-red-600' : 'bg-red-50 text-red-700 border-red-200 hover:bg-red-100'
            }`}
          >
            Só quem tá devendo
          </button>
          {(search.trim() || statusFilter || roleFilter || onlyDevendo || eventFilter) && (
            <button
              onClick={() => { setSearch(''); setStatusFilter(''); setRoleFilter(''); setOnlyDevendo(false); setEventFilter('') }}
              className="text-xs font-semibold text-beetz-dark/50 hover:text-red-600 px-2 py-2"
            >
              Limpar
            </button>
          )}
        </div>
      </div>

      {loading ? (
        <p className="text-beetz-dark/50 text-sm">Carregando recebimentos...</p>
      ) : (
        <>
          <div className="flex flex-wrap items-center justify-between gap-3 bg-beetz-dark text-white rounded-2xl p-5">
            <div>
              <p className="text-white/60 text-xs uppercase tracking-wide font-semibold">Total no filtro aplicado</p>
              <p className="text-2xl font-extrabold">{currency(total)}</p>
              <p className="text-white/50 text-xs mt-1">Comissões de garçom: {currency(totalCommission)}</p>
            </div>
            <div className="text-right">
              <p className="text-white/60 text-sm">{filtered.length} recebimento(s)</p>
              {totalDevendo > 0 && (
                <p className="text-red-400 font-bold text-sm mt-1">Devendo a casa: {currency(totalDevendo)}</p>
              )}
              {acertados > 0 && (
                <p className="text-green-400 text-xs mt-0.5">{acertados} acertado(s) ✓</p>
              )}
            </div>
          </div>

          {/* A conta de quem deve a casa: por pessoa, somando todos os
              lançamentos Devendo do escopo. Tocar no card busca a pessoa. */}
          {devedores.length > 0 && (
            <div className="bg-white rounded-2xl p-5 shadow-soft border border-red-100">
              <h2 className="font-bold text-red-700 mb-1">Quem deve a casa</h2>
              <p className="text-xs text-beetz-dark/50 mb-3">
                Soma do "falta acertar" de cada pessoa{eventFilter ? ' neste evento' : ' em todos os eventos'}.
                Toque num card pra ver os lançamentos da pessoa.
              </p>
              <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-2">
                {devedores.map((d) => (
                  <button
                    key={d.profileId}
                    onClick={() => { setSearch(profileName(d.profileId)); setOnlyDevendo(true) }}
                    className="flex items-center justify-between gap-3 bg-red-50 border border-red-100 rounded-xl px-4 py-3 text-left hover:bg-red-100 transition-colors"
                  >
                    <div className="min-w-0">
                      <p className="font-semibold text-sm truncate">{profileName(d.profileId)}</p>
                      <p className="text-[11px] text-beetz-dark/50">
                        {d.lancamentos} lançamento(s) · {d.eventos.size} evento(s)
                      </p>
                    </div>
                    <span className="font-extrabold text-red-600 whitespace-nowrap">{currency(d.total)}</span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {filtered.length === 0 ? (
            <div className="bg-white rounded-2xl p-8 shadow-soft border border-beetz-dark/5 text-center text-beetz-dark/50 text-sm">
              Nenhum recebimento encontrado com esses filtros.
            </div>
          ) : (
            <div className="bg-white rounded-2xl shadow-soft border border-beetz-dark/5 overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-beetz-dark/10 text-left">
                    <th className="p-3">Status</th>
                    <th className="p-3">Evento</th>
                    <th className="p-3">Colaborador(a)</th>
                    <th className="p-3">Tipo</th>
                    <th className="p-3 text-right">Dinheiro</th>
                    <th className="p-3 text-right">Débito</th>
                    <th className="p-3 text-right">Crédito</th>
                    <th className="p-3 text-right">Pix</th>
                    <th className="p-3 text-right">Total</th>
                    <th className="p-3 text-right">Comissão</th>
                    <th className="p-3">Acerto</th>
                    <th className="p-3">Data</th>
                    {canReviewCashier(accessRole) && <th className="p-3"></th>}
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((s) => {
                    const event = eventsById.get(s.event_id)
                    return (
                      <tr key={s.id} className="border-b border-beetz-dark/5 last:border-0">
                        <td className="p-3">
                          <span className={`text-xs font-semibold px-2 py-1 rounded-full ${statusColors[s.status]}`}>{s.status}</span>
                        </td>
                        <td className="p-3">
                          {event ? (
                            <Link to={`/eventos/${event.id}`} className="font-semibold hover:text-beetz-yellow transition-colors">{event.name}</Link>
                          ) : (
                            <span className="text-beetz-dark/40">Evento removido</span>
                          )}
                        </td>
                        <td className="p-3 text-xs text-beetz-dark/60">{profileName(s.profile_id)}</td>
                        <td className="p-3 text-xs text-beetz-dark/60">{s.role_type}</td>
                        <td className="p-3 text-right whitespace-nowrap">{currency(s.cash_amount)}</td>
                        <td className="p-3 text-right whitespace-nowrap">{currency(s.debit_amount)}</td>
                        <td className="p-3 text-right whitespace-nowrap">{currency(s.credit_amount)}</td>
                        <td className="p-3 text-right whitespace-nowrap">{currency(s.pix_amount)}</td>
                        <td className="p-3 text-right font-bold whitespace-nowrap">{currency(s.total)}</td>
                        <td className="p-3 text-right whitespace-nowrap">{s.role_type === 'Garçom' ? currency(s.commission_amount) : '—'}</td>
                        <td className="p-3 whitespace-nowrap">
                          {(() => {
                            const i = internals.get(s.id)
                            if (!i || i.status === 'Em aberto') return <span className="text-beetz-dark/30 text-xs">—</span>
                            return i.status === 'Acertado' ? (
                              <span className="text-[11px] font-bold bg-green-100 text-green-700 px-2 py-1 rounded-full">Acertado ✓</span>
                            ) : (
                              <span className="text-[11px] font-bold bg-red-100 text-red-700 px-2 py-1 rounded-full">
                                Devendo{i.pending_amount ? ` ${currency(i.pending_amount)}` : ''}
                              </span>
                            )
                          })()}
                        </td>
                        <td className="p-3 text-xs text-beetz-dark/60 whitespace-nowrap">{formatDateTime(s.created_at)}</td>
                        {canReviewCashier(accessRole) && (
                          <td className="p-3 whitespace-nowrap">
                            <button
                              onClick={() => setEditing(s)}
                              className="text-xs font-semibold text-beetz-dark/50 hover:text-beetz-dark px-2 py-1 rounded-lg hover:bg-beetz-gray"
                            >
                              Editar
                            </button>
                          </td>
                        )}
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}

      {/* O MESMO modal do evento, aqui na visão global — com o extra de
          trocar o evento do recebimento (flag can_move_settlement_event). */}
      {editing && (
        <EditSettlementModal
          settlement={editing}
          profiles={profiles}
          canReview={canReviewCashier(accessRole)}
          canMoveEvent={canMoveSettlementEvent(accessRole)}
          onClose={() => setEditing(null)}
          onSaved={() => { setEditing(null); load() }}
        />
      )}
    </div>
  )
}
