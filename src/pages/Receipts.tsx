import { eventLabel } from '../lib/eventLabel'
import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { Receipt } from 'lucide-react'
import { useAuth } from '../contexts/AuthContext'
import { getSettlementReceipt, listAllCashierSettlements, listAllSettlementInternals, listEvents, listProfilesLite, listProfilesPixLite } from '../lib/dataService'
import type { ProfilePixLite } from '../lib/dataService'
import type { CashierRoleType, CashierSettlement, CashierSettlementInternal, CashierStatus, EventItem, Profile } from '../lib/types'
import { canGroupReceipts, canMoveSettlementEvent, canReviewCashier, canViewFinancialSummary } from '../lib/permissions'
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

// Colunas da tabela — cada uma pode ser ocultada/exibida; a escolha fica
// salva no aparelho (localStorage). A coluna de Editar não entra: é ação.
const ALL_COLS: { key: string; label: string }[] = [
  { key: 'status', label: 'Status' },
  { key: 'evento', label: 'Evento' },
  { key: 'colaborador', label: 'Colaborador(a)' },
  { key: 'tipo', label: 'Tipo' },
  { key: 'dinheiro', label: 'Dinheiro' },
  { key: 'debito', label: 'Débito' },
  { key: 'credito', label: 'Crédito' },
  { key: 'pix', label: 'Pix' },
  { key: 'total', label: 'Total' },
  { key: 'comissao', label: 'Comissão' },
  // Relacionadas do PERFIL do colaborador — pra montar a folha de Pix.
  { key: 'chavepix', label: 'Chave Pix' },
  { key: 'titularpix', label: 'Titular Pix' },
  { key: 'acerto', label: 'Acerto' },
  { key: 'data', label: 'Data' }
]
const COLS_STORAGE_KEY = 'colmeia:recebimentos-colunas'

export default function Receipts() {
  const { accessRole } = useAuth()
  // A rota abre LEVE: só a lista de eventos (pro filtro). Os recebimentos
  // em si só descem quando a pessoa toca em Aplicar — e já recortados por
  // evento no banco, sem os comprovantes base64 (eram 148 MB no select antigo).
  const [loading, setLoading] = useState(false)
  const [loaded, setLoaded] = useState(false)
  const [settlements, setSettlements] = useState<CashierSettlement[]>([])
  const [internals, setInternals] = useState<Map<string, CashierSettlementInternal>>(new Map())
  const [events, setEvents] = useState<EventItem[]>([])
  const [profiles, setProfiles] = useState<Profile[]>([])
  // Multi-seleção de eventos: o select acumula; os escolhidos viram chips.
  const [eventFilter, setEventFilter] = useState<string[]>([])
  const [search, setSearch] = useState('')
  // Paginação da tabela detalhada.
  const [pageSize, setPageSize] = useState<50 | 200>(50)
  const [page, setPage] = useState(0)
  // Editar busca o comprovante pesado sob demanda — trava só aquela linha.
  const [abrindoId, setAbrindoId] = useState<string | null>(null)
  const [statusFilter, setStatusFilter] = useState('')
  const [roleFilter, setRoleFilter] = useState('')
  const [onlyDevendo, setOnlyDevendo] = useState(false)
  // Recebimento aberto pra edição (modal padrão da casa, o mesmo do evento).
  const [editing, setEditing] = useState<CashierSettlement | null>(null)
  // Pix do perfil de cada colaborador (relacionado pelo profile_id).
  const [pixByProfile, setPixByProfile] = useState<Map<string, ProfilePixLite>>(new Map())
  const [folhaCopiada, setFolhaCopiada] = useState(false)
  // Agrupar por colaborador: uma linha por PESSOA somando o recorte —
  // menos transferências. Gated pela flag can_group_receipts (matriz).
  const [agrupar, setAgrupar] = useState(false)
  const norm = (s: string) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')

  // Visibilidade das colunas — padrão: todas; lembrada por aparelho.
  const [cols, setCols] = useState<Set<string>>(new Set(ALL_COLS.map((c) => c.key)))
  const [colsOpen, setColsOpen] = useState(false)
  useEffect(() => {
    try {
      const saved = localStorage.getItem(COLS_STORAGE_KEY)
      if (saved) {
        const arr = JSON.parse(saved) as string[]
        if (Array.isArray(arr) && arr.length > 0) setCols(new Set(arr))
      }
    } catch { /* padrão: todas */ }
  }, [])
  function toggleCol(k: string) {
    setCols((prev) => {
      const next = new Set(prev)
      if (next.has(k)) {
        // Sempre sobra ao menos uma coluna — tabela vazia não ajuda ninguém.
        if (next.size > 1) next.delete(k)
      } else {
        next.add(k)
      }
      try { localStorage.setItem(COLS_STORAGE_KEY, JSON.stringify([...next])) } catch { /* sem memória, segue */ }
      return next
    })
  }
  function showAllCols() {
    const all = new Set(ALL_COLS.map((c) => c.key))
    setCols(all)
    try { localStorage.setItem(COLS_STORAGE_KEY, JSON.stringify([...all])) } catch { /* idem */ }
  }
  const col = (k: string) => cols.has(k)

  // Carga inicial: SÓ os eventos do filtro (uma lista de nomes). Nada de
  // recebimentos ainda.
  useEffect(() => { listEvents().then(setEvents).catch(() => setEvents([])) }, [])

  async function aplicar() {
    setLoading(true)
    try {
      const [s, ints, profs, pix] = await Promise.all([
        // Recortado por evento JÁ NO BANCO (sem eventos marcados = todos).
        listAllCashierSettlements(eventFilter),
        listAllSettlementInternals().catch(() => [] as CashierSettlementInternal[]),
        // Lite: nomes sem fotos base64.
        listProfilesLite(),
        // Pix relacionado do perfil (4 campos, leve) — falha aqui não derruba
        // a tela: a coluna aparece vazia.
        listProfilesPixLite().catch(() => [] as ProfilePixLite[])
      ])
      setSettlements(s)
      setInternals(new Map(ints.map((i) => [i.settlement_id, i])))
      setProfiles(profs)
      setPixByProfile(new Map(pix.map((p) => [p.id, p])))
      setLoaded(true)
      setPage(0)
    } finally {
      setLoading(false)
    }
  }

  // Recarrega mantendo o recorte (pós-edição no modal).
  const load = aplicar

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

  // Evento NÃO entra aqui: o recorte de eventos acontece no banco, na hora
  // do Aplicar. Busca/status/tipo/devendo continuam instantâneos no cliente.
  const filtered = useMemo(() => {
    return settlements
      .filter((s) => !statusFilter || s.status === statusFilter)
      .filter((s) => !roleFilter || s.role_type === roleFilter)
      .filter((s) => !onlyDevendo || internals.get(s.id)?.status === 'Devendo')
      .filter((s) => !search.trim() || norm(profileName(s.profile_id)).includes(norm(search)))
      .sort((a, b) => (a.created_at < b.created_at ? 1 : -1))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [settlements, statusFilter, roleFilter, onlyDevendo, search, internals, profiles])

  // Filtro de cliente mudou → volta pra primeira página.
  useEffect(() => { setPage(0) }, [statusFilter, roleFilter, onlyDevendo, search, pageSize, agrupar])

  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize))
  const pageClamped = Math.min(page, totalPages - 1)
  const paginated = useMemo(
    () => filtered.slice(pageClamped * pageSize, (pageClamped + 1) * pageSize),
    [filtered, pageClamped, pageSize]
  )

  const total = useMemo(() => filtered.reduce((sum, s) => sum + s.total, 0), [filtered])
  const totalCommission = useMemo(() => filtered.reduce((sum, s) => sum + s.commission_amount, 0), [filtered])

  // ---- Folha de pagamentos Pix: comissões do recorte filtrado, somadas
  // POR PESSOA, cada uma com a chave Pix do perfil. É a lista que a
  // Diretoria cola no app do banco pra pagar os garçons. ----
  const folhaPix = useMemo(() => {
    const porPessoa = new Map<string, { nome: string; valor: number; lancamentos: number }>()
    for (const s of filtered) {
      if (!s.profile_id || s.commission_amount <= 0) continue
      const atual = porPessoa.get(s.profile_id) ?? { nome: profileName(s.profile_id), valor: 0, lancamentos: 0 }
      atual.valor += s.commission_amount
      atual.lancamentos++
      porPessoa.set(s.profile_id, atual)
    }
    return [...porPessoa.entries()]
      .map(([profileId, dados]) => ({ profileId, ...dados, pix: pixByProfile.get(profileId) ?? null }))
      .sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filtered, pixByProfile, profiles])
  const folhaSemChave = folhaPix.filter((p) => !p.pix?.pix_key?.trim()).length

  // ---- Modo agrupado: uma linha por colaborador, somando o recorte. ----
  const agrupados = useMemo(() => {
    const m = new Map<string, {
      profileId: string; nome: string; lancamentos: number; eventos: Set<string>
      dinheiro: number; debito: number; credito: number; pix: number; total: number; comissao: number
    }>()
    for (const s of filtered) {
      const key = s.profile_id ?? 'sem-perfil'
      const g = m.get(key) ?? {
        profileId: key, nome: profileName(s.profile_id), lancamentos: 0, eventos: new Set<string>(),
        dinheiro: 0, debito: 0, credito: 0, pix: 0, total: 0, comissao: 0
      }
      g.lancamentos++
      g.eventos.add(s.event_id)
      g.dinheiro += s.cash_amount
      g.debito += s.debit_amount
      g.credito += s.credit_amount
      g.pix += s.pix_amount
      g.total += s.total
      g.comissao += s.commission_amount
      m.set(key, g)
    }
    return [...m.values()].sort((a, b) => b.total - a.total)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filtered, profiles])

  async function copiarFolhaPix() {
    const evento = eventFilter.length === 1
      ? (eventsById.get(eventFilter[0])?.name ?? 'evento')
      : eventFilter.length > 1 ? `${eventFilter.length} eventos` : 'todos os eventos'
    const totalFolha = folhaPix.reduce((s, p) => s + p.valor, 0)
    const linhas = folhaPix.map((p) => {
      const chave = p.pix?.pix_key?.trim()
      const tipo = p.pix?.pix_key_type ? ` (${p.pix.pix_key_type})` : ''
      const titular = p.pix?.pix_owner_name?.trim()
      return chave
        ? `${p.nome} — ${currency(p.valor)} — ${chave}${tipo}${titular ? ` — titular: ${titular}` : ''}`
        : `${p.nome} — ${currency(p.valor)} — ⚠️ SEM CHAVE PIX CADASTRADA`
    })
    const texto = [
      `🍯 Folha Pix Beetz — ${evento}`,
      `${folhaPix.length} pagamento(s) · Total ${currency(totalFolha)}${folhaSemChave ? ` · ⚠️ ${folhaSemChave} sem chave` : ''}`,
      '',
      ...linhas
    ].join('\n')
    try {
      await navigator.clipboard.writeText(texto)
      setFolhaCopiada(true)
      setTimeout(() => setFolhaCopiada(false), 2500)
    } catch { /* clipboard bloqueado: nada explode */ }
  }

  // A conta de quem deve a casa, POR PESSOA, no escopo do evento selecionado
  // (ignora os outros filtros de propósito — é um placar, não uma busca):
  // soma o "falta acertar" de todos os lançamentos Devendo da pessoa.
  const devedores = useMemo(() => {
    const map = new Map<string, { profileId: string; total: number; lancamentos: number; eventos: Set<string> }>()
    for (const s of settlements) {
      const i = internals.get(s.id)
      if (!i || i.status !== 'Devendo' || !s.profile_id) continue
      const entry = map.get(s.profile_id) ?? { profileId: s.profile_id, total: 0, lancamentos: 0, eventos: new Set<string>() }
      entry.total += i.pending_amount ?? 0
      entry.lancamentos++
      entry.eventos.add(s.event_id)
      map.set(s.profile_id, entry)
    }
    return Array.from(map.values()).sort((a, b) => b.total - a.total)
  }, [settlements, internals])
  const totalDevendo = useMemo(() => devedores.reduce((s, d) => s + d.total, 0), [devedores])
  const acertados = useMemo(() => {
    let n = 0
    for (const s of settlements) {
      if (internals.get(s.id)?.status === 'Acertado') n++
    }
    return n
  }, [settlements, internals])

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

      <div className="bg-white rounded-2xl p-4 shadow-soft border border-beetz-dark/5 space-y-3">
        {/* Grid no celular (2 colunas certinhas), linha corrida no desktop. */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:flex lg:flex-wrap lg:items-center gap-2 lg:gap-3">
          {/* Multi-seleção: o select ACUMULA eventos; os marcados viram chips. */}
          <select
            value=""
            onChange={(e) => {
              const id = e.target.value
              if (id && !eventFilter.includes(id)) setEventFilter((prev) => [...prev, id])
            }}
            className={`${selectClass} w-full lg:w-auto`}
          >
            <option value="">{eventFilter.length > 0 ? `+ Adicionar evento (${eventFilter.length})` : 'Todos os eventos'}</option>
            {events.filter((ev) => !eventFilter.includes(ev.id)).map((ev) => <option key={ev.id} value={ev.id}>{eventLabel(ev)}</option>)}
          </select>
          <input
            className={`${selectClass} w-full lg:w-52`}
            placeholder="Buscar por nome..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className={`${selectClass} w-full lg:w-auto`}>
            <option value="">Todos os status</option>
            {(['Pendente', 'Aprovado', 'Rejeitado'] as CashierStatus[]).map((st) => <option key={st} value={st}>{st}</option>)}
          </select>
          <select value={roleFilter} onChange={(e) => setRoleFilter(e.target.value)} className={`${selectClass} w-full lg:w-auto`}>
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
          {canGroupReceipts(accessRole) && (
            <button
              onClick={() => setAgrupar((v) => !v)}
              title="Uma linha por pessoa, somando o recorte filtrado — menos transferências pra fazer"
              className={`text-xs font-bold px-3 py-2.5 rounded-xl border transition-colors ${
                agrupar ? 'bg-beetz-dark text-white border-beetz-dark' : 'bg-white text-beetz-dark/60 border-beetz-dark/12 hover:border-beetz-dark/30'
              }`}
            >
              👥 Agrupar por colaborador
            </button>
          )}
        </div>

        {/* Chips dos eventos marcados — X tira um; o recorte muda no Aplicar. */}
        {eventFilter.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {eventFilter.map((id) => (
              <span key={id} className="flex items-center gap-1.5 text-xs font-semibold bg-beetz-yellow/25 border border-beetz-yellow/60 px-2.5 py-1 rounded-full">
                {eventsById.get(id)?.name ?? 'Evento'}
                <button onClick={() => setEventFilter((prev) => prev.filter((x) => x !== id))} className="text-beetz-dark/40 hover:text-beetz-dark font-bold">×</button>
              </span>
            ))}
          </div>
        )}

        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={aplicar}
            disabled={loading}
            className="w-full sm:w-auto honey-gradient text-beetz-dark font-bold px-6 py-2.5 rounded-xl text-sm disabled:opacity-60 active:scale-[0.99] transition-transform"
          >
            {loading ? 'Carregando...' : loaded ? '🔎 Aplicar filtro' : '🔎 Aplicar e carregar'}
          </button>
          {!loaded && !loading && (
            <p className="text-xs text-beetz-dark/45">
              Nada carrega sozinho: escolha os eventos (ou deixe em branco pra todos) e toque em Aplicar.
            </p>
          )}
          {(search.trim() || statusFilter || roleFilter || onlyDevendo || eventFilter.length > 0) && (
            <button
              onClick={() => { setSearch(''); setStatusFilter(''); setRoleFilter(''); setOnlyDevendo(false); setEventFilter([]) }}
              className="text-xs font-semibold text-beetz-dark/50 hover:text-red-600 px-2 py-2"
            >
              Limpar filtros
            </button>
          )}
        </div>
      </div>

      {/* Controle de colunas: oculte/exiba qualquer uma; a escolha fica salva. */}
      {loaded && !loading && (
        <div className="mb-4">
          <button
            onClick={() => setColsOpen((v) => !v)}
            className="text-xs font-semibold px-3.5 py-2 rounded-xl border border-beetz-dark/12 bg-white text-beetz-dark/60 hover:border-beetz-dark/25 transition-colors"
          >
            ☰ Colunas ({cols.size}/{ALL_COLS.length})
          </button>
          {colsOpen && (
            <div className="flex flex-wrap items-center gap-1.5 mt-2 bg-white border border-beetz-dark/8 rounded-2xl p-3">
              {ALL_COLS.map((c) => (
                <button
                  key={c.key}
                  onClick={() => toggleCol(c.key)}
                  className={`text-xs font-semibold px-3 py-1.5 rounded-lg border transition-colors ${
                    col(c.key) ? 'bg-beetz-yellow border-beetz-yellow text-beetz-dark' : 'bg-white border-beetz-dark/12 text-beetz-dark/40'
                  }`}
                >
                  {c.label}
                </button>
              ))}
              {cols.size < ALL_COLS.length && (
                <button onClick={showAllCols} className="text-xs font-semibold text-beetz-dark/40 underline px-2">
                  Mostrar todas
                </button>
              )}
            </div>
          )}
        </div>
      )}

      {loading ? (
        <p className="text-beetz-dark/50 text-sm">Carregando recebimentos...</p>
      ) : !loaded ? (
        <div className="bg-white rounded-2xl p-10 shadow-soft border border-beetz-dark/5 text-center">
          <p className="text-4xl mb-3">🔎</p>
          <p className="font-bold">Escolha o recorte e toque em Aplicar</p>
          <p className="text-sm text-beetz-dark/50 mt-1 max-w-md mx-auto">
            A tela não baixa mais tudo sozinha — marque um ou mais eventos (ou nenhum, pra ver todos) e aplique o filtro.
          </p>
        </div>
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
            {/* A folha: soma as comissões do recorte por pessoa e copia com
                a chave Pix de cada uma — pronto pra colar no app do banco. */}
            {folhaPix.length > 0 && (
              <div className="w-full sm:w-auto">
                <button
                  onClick={copiarFolhaPix}
                  className="w-full sm:w-auto honey-gradient text-beetz-dark font-bold px-4 py-2.5 rounded-xl text-sm"
                >
                  {folhaCopiada ? 'Copiada ✓' : `📋 Copiar folha Pix (${folhaPix.length})`}
                </button>
                {folhaSemChave > 0 && (
                  <p className="text-amber-300 text-[11px] mt-1 text-center sm:text-right">
                    ⚠️ {folhaSemChave} sem chave Pix no perfil
                  </p>
                )}
              </div>
            )}
          </div>

          {/* A conta de quem deve a casa: por pessoa, somando todos os
              lançamentos Devendo do escopo. Tocar no card busca a pessoa. */}
          {devedores.length > 0 && (
            <div className="bg-white rounded-2xl p-5 shadow-soft border border-red-100">
              <h2 className="font-bold text-red-700 mb-1">Quem deve a casa</h2>
              <p className="text-xs text-beetz-dark/50 mb-3">
                Soma do "falta acertar" de cada pessoa no recorte carregado.
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
          ) : agrupar ? (
            /* ---- MODO AGRUPADO: uma linha por pessoa, recorte somado.
                 É a folha de transferências em forma de tabela. ---- */
            <div className="bg-white rounded-2xl shadow-soft border border-beetz-dark/5 overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-beetz-dark/10 text-left">
                    <th className="p-3">Colaborador(a)</th>
                    <th className="p-3 text-right">Lanç.</th>
                    <th className="p-3 text-right">Eventos</th>
                    {col('dinheiro') && <th className="p-3 text-right">Dinheiro</th>}
                    {col('debito') && <th className="p-3 text-right">Débito</th>}
                    {col('credito') && <th className="p-3 text-right">Crédito</th>}
                    {col('pix') && <th className="p-3 text-right">Pix</th>}
                    {col('total') && <th className="p-3 text-right">Total</th>}
                    {col('comissao') && <th className="p-3 text-right">Comissão</th>}
                    {col('chavepix') && <th className="p-3">Chave Pix</th>}
                    {col('titularpix') && <th className="p-3">Titular Pix</th>}
                  </tr>
                </thead>
                <tbody>
                  {agrupados.map((g) => {
                    const px = g.profileId !== 'sem-perfil' ? pixByProfile.get(g.profileId) : null
                    return (
                      <tr key={g.profileId} className="border-b border-beetz-dark/5 last:border-0">
                        <td className="p-3 font-semibold">{g.nome}</td>
                        <td className="p-3 text-right text-beetz-dark/60">{g.lancamentos}</td>
                        <td className="p-3 text-right text-beetz-dark/60">{g.eventos.size}</td>
                        {col('dinheiro') && <td className="p-3 text-right whitespace-nowrap">{currency(g.dinheiro)}</td>}
                        {col('debito') && <td className="p-3 text-right whitespace-nowrap">{currency(g.debito)}</td>}
                        {col('credito') && <td className="p-3 text-right whitespace-nowrap">{currency(g.credito)}</td>}
                        {col('pix') && <td className="p-3 text-right whitespace-nowrap">{currency(g.pix)}</td>}
                        {col('total') && <td className="p-3 text-right font-bold whitespace-nowrap">{currency(g.total)}</td>}
                        {col('comissao') && (
                          <td className="p-3 text-right whitespace-nowrap font-semibold">
                            {g.comissao > 0 ? currency(g.comissao) : '—'}
                          </td>
                        )}
                        {col('chavepix') && (
                          <td className="p-3 text-xs whitespace-nowrap">
                            {px?.pix_key?.trim() ? (
                              <span className="inline-flex items-center gap-1.5 max-w-[220px]">
                                <span className="truncate font-medium" title={px.pix_key}>{px.pix_key}</span>
                                {px.pix_key_type && <span className="text-beetz-dark/40 shrink-0">({px.pix_key_type})</span>}
                              </span>
                            ) : (
                              <span className="text-amber-600 font-semibold">sem chave ⚠️</span>
                            )}
                          </td>
                        )}
                        {col('titularpix') && (
                          <td className="p-3 text-xs text-beetz-dark/60 whitespace-nowrap max-w-[180px] truncate">
                            {px?.pix_owner_name?.trim() || '—'}
                          </td>
                        )}
                      </tr>
                    )
                  })}
                </tbody>
                <tfoot>
                  <tr className="border-t-2 border-beetz-dark/10 font-extrabold bg-beetz-gray/40">
                    <td className="p-3">{agrupados.length} pessoa(s)</td>
                    <td className="p-3 text-right">{filtered.length}</td>
                    <td className="p-3" />
                    {col('dinheiro') && <td className="p-3 text-right whitespace-nowrap">{currency(agrupados.reduce((s, g) => s + g.dinheiro, 0))}</td>}
                    {col('debito') && <td className="p-3 text-right whitespace-nowrap">{currency(agrupados.reduce((s, g) => s + g.debito, 0))}</td>}
                    {col('credito') && <td className="p-3 text-right whitespace-nowrap">{currency(agrupados.reduce((s, g) => s + g.credito, 0))}</td>}
                    {col('pix') && <td className="p-3 text-right whitespace-nowrap">{currency(agrupados.reduce((s, g) => s + g.pix, 0))}</td>}
                    {col('total') && <td className="p-3 text-right whitespace-nowrap">{currency(total)}</td>}
                    {col('comissao') && <td className="p-3 text-right whitespace-nowrap">{currency(totalCommission)}</td>}
                    {col('chavepix') && <td className="p-3" />}
                    {col('titularpix') && <td className="p-3" />}
                  </tr>
                </tfoot>
              </table>
            </div>
          ) : (
            <div className="bg-white rounded-2xl shadow-soft border border-beetz-dark/5 overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-beetz-dark/10 text-left">
                    {col('status') && <th className="p-3">Status</th>}
                    {col('evento') && <th className="p-3">Evento</th>}
                    {col('colaborador') && <th className="p-3">Colaborador(a)</th>}
                    {col('tipo') && <th className="p-3">Tipo</th>}
                    {col('dinheiro') && <th className="p-3 text-right">Dinheiro</th>}
                    {col('debito') && <th className="p-3 text-right">Débito</th>}
                    {col('credito') && <th className="p-3 text-right">Crédito</th>}
                    {col('pix') && <th className="p-3 text-right">Pix</th>}
                    {col('total') && <th className="p-3 text-right">Total</th>}
                    {col('comissao') && <th className="p-3 text-right">Comissão</th>}
                    {col('chavepix') && <th className="p-3">Chave Pix</th>}
                    {col('titularpix') && <th className="p-3">Titular Pix</th>}
                    {col('acerto') && <th className="p-3">Acerto</th>}
                    {col('data') && <th className="p-3">Data</th>}
                    {canReviewCashier(accessRole) && <th className="p-3"></th>}
                  </tr>
                </thead>
                <tbody>
                  {paginated.map((s) => {
                    const event = eventsById.get(s.event_id)
                    return (
                      <tr key={s.id} className="border-b border-beetz-dark/5 last:border-0">
                        {col('status') && (
                          <td className="p-3">
                            <span className={`text-xs font-semibold px-2 py-1 rounded-full ${statusColors[s.status]}`}>{s.status}</span>
                          </td>
                        )}
                        {col('evento') && (
                          <td className="p-3">
                            {event ? (
                              <Link to={`/eventos/${event.id}`} className="font-semibold hover:text-beetz-yellow transition-colors">{event.name}</Link>
                            ) : (
                              <span className="text-beetz-dark/40">Evento removido</span>
                            )}
                          </td>
                        )}
                        {col('colaborador') && <td className="p-3 text-xs text-beetz-dark/60">{profileName(s.profile_id)}</td>}
                        {col('tipo') && <td className="p-3 text-xs text-beetz-dark/60">{s.role_type}</td>}
                        {col('dinheiro') && <td className="p-3 text-right whitespace-nowrap">{currency(s.cash_amount)}</td>}
                        {col('debito') && <td className="p-3 text-right whitespace-nowrap">{currency(s.debit_amount)}</td>}
                        {col('credito') && <td className="p-3 text-right whitespace-nowrap">{currency(s.credit_amount)}</td>}
                        {col('pix') && <td className="p-3 text-right whitespace-nowrap">{currency(s.pix_amount)}</td>}
                        {col('total') && <td className="p-3 text-right font-bold whitespace-nowrap">{currency(s.total)}</td>}
                        {col('comissao') && (
                          <td className="p-3 text-right whitespace-nowrap">{s.role_type === 'Garçom' ? currency(s.commission_amount) : '—'}</td>
                        )}
                        {col('chavepix') && (
                          <td className="p-3 text-xs whitespace-nowrap">
                            {(() => {
                              const px = s.profile_id ? pixByProfile.get(s.profile_id) : null
                              if (!px?.pix_key?.trim()) return <span className="text-amber-600 font-semibold">sem chave ⚠️</span>
                              return (
                                <span className="inline-flex items-center gap-1.5 max-w-[220px]">
                                  <span className="truncate font-medium" title={px.pix_key}>{px.pix_key}</span>
                                  {px.pix_key_type && <span className="text-beetz-dark/40 shrink-0">({px.pix_key_type})</span>}
                                </span>
                              )
                            })()}
                          </td>
                        )}
                        {col('titularpix') && (
                          <td className="p-3 text-xs text-beetz-dark/60 whitespace-nowrap max-w-[180px] truncate">
                            {(s.profile_id && pixByProfile.get(s.profile_id)?.pix_owner_name?.trim()) || '—'}
                          </td>
                        )}
                        {col('acerto') && (
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
                        )}
                        {col('data') && <td className="p-3 text-xs text-beetz-dark/60 whitespace-nowrap">{formatDateTime(s.created_at)}</td>}
                        {canReviewCashier(accessRole) && (
                          <td className="p-3 whitespace-nowrap">
                            <button
                              onClick={async () => {
                                // A lista vem SEM os comprovantes (magra). Aqui
                                // busca o base64 só deste lançamento — sem isso
                                // o salvar do modal apagaria o comprovante.
                                setAbrindoId(s.id)
                                try {
                                  const receipt = await getSettlementReceipt(s.id).catch(() => null)
                                  setEditing({ ...s, receipt_data: receipt })
                                } finally {
                                  setAbrindoId(null)
                                }
                              }}
                              disabled={abrindoId === s.id}
                              className="text-xs font-semibold text-beetz-dark/50 hover:text-beetz-dark px-2 py-1 rounded-lg hover:bg-beetz-gray disabled:opacity-50"
                            >
                              {abrindoId === s.id ? 'Abrindo...' : 'Editar'}
                            </button>
                          </td>
                        )}
                      </tr>
                    )
                  })}
                </tbody>
              </table>

              {/* Paginação: 50 ou 200 por página — os totais lá de cima seguem
                  sendo do recorte INTEIRO, não só da página. */}
              <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 border-t border-beetz-dark/8 bg-beetz-gray/40">
                <p className="text-xs text-beetz-dark/50">
                  {filtered.length === 0 ? '0' : `${pageClamped * pageSize + 1}–${Math.min((pageClamped + 1) * pageSize, filtered.length)}`} de {filtered.length}
                </p>
                <div className="flex items-center gap-2">
                  <select
                    value={pageSize}
                    onChange={(e) => setPageSize(Number(e.target.value) as 50 | 200)}
                    className="rounded-lg border border-beetz-dark/15 text-xs px-2 py-1.5 bg-white"
                  >
                    <option value={50}>50 por página</option>
                    <option value={200}>200 por página</option>
                  </select>
                  <button
                    onClick={() => setPage((p) => Math.max(0, p - 1))}
                    disabled={pageClamped === 0}
                    className="text-sm font-bold px-3 py-1.5 rounded-lg border border-beetz-dark/12 bg-white disabled:opacity-40"
                  >
                    ‹
                  </button>
                  <span className="text-xs font-semibold text-beetz-dark/60">{pageClamped + 1} / {totalPages}</span>
                  <button
                    onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
                    disabled={pageClamped >= totalPages - 1}
                    className="text-sm font-bold px-3 py-1.5 rounded-lg border border-beetz-dark/12 bg-white disabled:opacity-40"
                  >
                    ›
                  </button>
                </div>
              </div>
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
