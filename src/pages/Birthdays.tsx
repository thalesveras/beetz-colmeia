import { useEffect, useMemo, useState } from 'react'
import { Cake, ChevronLeft, ChevronRight, Filter, Mail, Search } from 'lucide-react'
import { listDepartments, listPendingProfilesForDirectory, listProfiles, pendingDepartmentHintToSlug } from '../lib/dataService'
import type { BirthdayEmailTarget } from '../lib/dataService'
import { useAuth } from '../contexts/AuthContext'
import { canSendBirthdayEmail, canViewBirthdays, canViewPendingProfileDetails } from '../lib/permissions'
import type { Department, PendingProfileDirectoryItem, Profile } from '../lib/types'
import Avatar from '../components/ui/Avatar'
import PendingProfileModal from '../components/ui/PendingProfileModal'
import BirthdayEmailModal from '../components/ui/BirthdayEmailModal'
import { Link } from 'react-router-dom'

const MONTHS = [
  'janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho',
  'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'
]

const inputClass = 'rounded-xl border border-beetz-dark/15 text-sm px-3 py-2 focus:outline-none focus:ring-2 focus:ring-beetz-yellow'

// Lê o birth_date (formato YYYY-MM-DD) inteiro: dia e mês posicionam o card,
// ano vira a idade no card — pedido do dono, que trocou o antigo selo
// "Ainda não se cadastrou" pela idade de cada pessoa.
function parseBirthDate(birthDate: string): { day: number; month: number; year: number | null } | null {
  const parts = birthDate.split('-')
  if (parts.length !== 3) return null
  const year = Number(parts[0])
  const month = Number(parts[1])
  const day = Number(parts[2])
  if (!month || !day) return null
  return { day, month, year: year || null }
}

// Idade que a pessoa COMPLETA no aniversário deste ano (é o número que se
// canta no parabéns, mesmo que o dia ainda não tenha chegado). Fora de
// 14–100 vira null: idade absurda é typo de cadastro, e typo não ganha
// vitrine no card.
function turningAge(year: number | null, currentYear: number): number | null {
  if (!year) return null
  const age = currentYear - year
  return age >= 14 && age <= 100 ? age : null
}

function normalize(s: string) {
  return s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
}

type BirthdayItem =
  | { kind: 'real'; day: number; month: number; year: number | null; profile: Profile }
  | { kind: 'pending'; day: number; month: number; year: number | null; profile: PendingProfileDirectoryItem }

type KindFilter = 'todos' | 'cadastrados' | 'pre'

export default function Birthdays() {
  const { accessRole } = useAuth()
  const canViewDetails = canViewPendingProfileDetails(accessRole)
  // Antes isso era canManageUsers: quem administrava a colmeia mandava
  // parabéns, e quem não administrava não mandava — duas coisas sem relação
  // amarradas na mesma chave. Agora tem flag própria.
  const canSendEmail = canSendBirthdayEmail(accessRole)

  const [profiles, setProfiles] = useState<Profile[]>([])
  const [pending, setPending] = useState<PendingProfileDirectoryItem[]>([])
  const [departments, setDepartments] = useState<Department[]>([])
  const [loading, setLoading] = useState(true)
  const [viewingPending, setViewingPending] = useState<PendingProfileDirectoryItem | null>(null)
  const [emailing, setEmailing] = useState<
    { target: BirthdayEmailTarget; name: string; firstName: string; avatarUrl: string | null } | null
  >(null)

  const now = new Date()
  const today = now.getDate()
  const thisMonth = now.getMonth() + 1

  // Antes a tela era travada no mês atual, sem jeito de ver os outros —
  // agora o mês é só o valor inicial.
  const [month, setMonth] = useState(thisMonth)
  const [search, setSearch] = useState('')
  const [dept, setDept] = useState('')
  const [kind, setKind] = useState<KindFilter>('todos')
  const [onlyToday, setOnlyToday] = useState(false)
  const [showFilters, setShowFilters] = useState(false)

  useEffect(() => {
    Promise.all([listProfiles(), listDepartments(), listPendingProfilesForDirectory()]).then(([p, d, pend]) => {
      setProfiles(p)
      setDepartments(d)
      setPending(pend)
      setLoading(false)
    })
  }, [])

  const deptName = (id: string | null) => departments.find((d) => d.id === id)?.name
  const pendingDeptName = (hint: string | null) => departments.find((d) => d.slug === pendingDepartmentHintToSlug(hint))?.name

  const allItems: BirthdayItem[] = useMemo(() => {
    const real: BirthdayItem[] = profiles
      .map((p) => {
        if (!p.birth_date) return null
        const dm = parseBirthDate(p.birth_date)
        if (!dm) return null
        return { kind: 'real' as const, day: dm.day, month: dm.month, year: dm.year, profile: p }
      })
      .filter((x): x is BirthdayItem & { kind: 'real' } => x !== null)

    // Pré-cadastro: a pessoa ainda não se cadastrou, mas já faz parte da
    // Beetz, então merece aparecer aqui também. O birth_year pode ser null
    // enquanto a sincronização do Zoho não rodar de novo — aí o card sai sem
    // idade, nunca com idade inventada.
    const pend: BirthdayItem[] = pending
      .map((p) => {
        if (!p.birth_month || !p.birth_day) return null
        return { kind: 'pending' as const, day: p.birth_day, month: p.birth_month, year: p.birth_year, profile: p }
      })
      .filter((x): x is BirthdayItem & { kind: 'pending' } => x !== null)

    return [...real, ...pend]
  }, [profiles, pending])

  const filtered = useMemo(() => {
    const q = normalize(search.trim())
    return allItems
      .filter((item) => item.month === month)
      .filter((item) => (onlyToday ? item.day === today && month === thisMonth : true))
      .filter((item) => {
        if (kind === 'cadastrados') return item.kind === 'real'
        if (kind === 'pre') return item.kind === 'pending'
        return true
      })
      .filter((item) => {
        if (!dept) return true
        return item.kind === 'real'
          ? item.profile.department_id === dept
          : pendingDepartmentHintToSlug(item.profile.department_hint) === departments.find((d) => d.id === dept)?.slug
      })
      .filter((item) => {
        if (!q) return true
        const name = `${item.profile.first_name ?? ''} ${item.profile.last_name ?? ''}`
        return normalize(name).includes(q)
      })
      .sort((a, b) => a.day - b.day)
  }, [allItems, month, onlyToday, today, thisMonth, kind, dept, search, departments])

  // "Hoje" saiu da conta: virou pill própria, com estado à vista — o badge
  // do botão Filtros conta só os filtros escondidos no painel.
  const activeFilters = [search.trim() ? 1 : 0, dept ? 1 : 0, kind !== 'todos' ? 1 : 0]
    .reduce((a, b) => a + b, 0)

  function clearFilters() {
    setSearch(''); setDept(''); setKind('todos')
  }

  const itensDeHoje = useMemo(
    () => allItems.filter((i) => i.month === thisMonth && i.day === today).sort((a, b) =>
      `${a.profile.first_name ?? ''}`.localeCompare(`${b.profile.first_name ?? ''}`, 'pt-BR')),
    [allItems, thisMonth, today]
  )
  const todayCount = itensDeHoje.length
  const mesAtualCount = allItems.filter((i) => i.month === thisMonth).length

  // Era a única tela do menu Comunidade sem trava — Turma, Mapa e Ranking
  // todas checam permissão, e essa entrava direto pra qualquer um.
  if (!canViewBirthdays(accessRole)) {
    return (
      <div className="bg-white rounded-2xl p-8 shadow-soft border border-beetz-dark/5 text-center">
        <p className="text-4xl mb-3">🔒</p>
        <h1 className="text-xl font-bold mb-1">Acesso restrito</h1>
        <p className="text-sm text-beetz-dark/60">Seu perfil de acesso não tem permissão pra ver os aniversariantes.</p>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl md:text-3xl font-extrabold flex items-center gap-2">
          <Cake size={26} className="text-beetz-yellow" /> Aniversariantes
        </h1>
        <p className="text-beetz-dark/60 mt-1">Quem faz aniversário na colmeia — cadastrado(a) ou não.</p>
      </div>

      {/* 🎉 A faixa do dia: quem faz aniversário HOJE ganha o palco, sempre
          visível, independente do mês que você está folheando. Avatares
          deslizam de lado (rolagem contida) e cada um abre o perfil. */}
      {!loading && todayCount > 0 && (
        <div className="relative overflow-hidden dark-gradient text-white rounded-2xl p-4">
          <div className="absolute inset-0 opacity-10 bg-honeycomb" style={{ backgroundSize: '24px 24px' }} />
          <div className="relative">
            <p className="text-sm font-extrabold text-beetz-yellow mb-3">
              🎉 {todayCount === 1 ? 'Tem parabéns HOJE' : `${todayCount} parabéns pra dar HOJE`}
            </p>
            <div className="flex gap-4 overflow-x-auto no-scrollbar pb-1">
              {itensDeHoje.map((item) => {
                const nome = `${item.profile.first_name ?? ''} ${item.profile.last_name ?? ''}`.trim()
                const idade = turningAge(item.year, now.getFullYear())
                const miolo = (
                  <>
                    <span className="rounded-full ring-2 ring-beetz-yellow">
                      <Avatar src={item.profile.avatar_url} name={nome} size="md" />
                    </span>
                    <span className="text-[11px] font-semibold truncate max-w-[64px]">{item.profile.first_name}</span>
                    {idade !== null && <span className="text-[10px] text-beetz-yellow font-bold">{idade} anos 🎂</span>}
                  </>
                )
                const classe = 'flex flex-col items-center gap-1 shrink-0 w-16 text-center'
                return item.kind === 'real' ? (
                  <Link key={`h-${item.profile.id}`} to={`/perfil/${item.profile.id}`} className={classe}>{miolo}</Link>
                ) : (
                  <button key={`h-${item.profile.id}`} onClick={() => canViewDetails && setViewingPending(item.profile)} className={classe}>{miolo}</button>
                )
              })}
            </div>
          </div>
        </div>
      )}

      {/* Filtros inteligentes: os dois recortes que respondem 90% das visitas
          viram pills de um toque — o resto mora no botão Filtros. */}
      {!loading && (
        <div className="flex gap-1.5 overflow-x-auto pb-1 md:flex-wrap md:overflow-visible md:pb-0">
          {todayCount > 0 && (
            <button
              onClick={() => { setOnlyToday(!onlyToday); setMonth(thisMonth) }}
              className={`shrink-0 text-sm font-semibold px-3.5 py-2 rounded-xl transition-colors ${
                onlyToday ? 'bg-beetz-yellow text-beetz-dark' : 'bg-white text-beetz-dark/60 border border-beetz-dark/10'
              }`}
            >
              🎂 Hoje ({todayCount})
            </button>
          )}
          <button
            onClick={() => { setMonth(thisMonth); setOnlyToday(false) }}
            className={`shrink-0 text-sm font-semibold px-3.5 py-2 rounded-xl transition-colors ${
              month === thisMonth && !onlyToday ? 'bg-beetz-dark text-white' : 'bg-white text-beetz-dark/60 border border-beetz-dark/10'
            }`}
          >
            Este mês ({mesAtualCount})
          </button>
        </div>
      )}

      {/* Navegação de mês: select encolhe (min-w-0) e ninguém mais é
          empurrado pra fora da tela; se apertar, o Filtros desce de linha. */}
      <div className="flex items-center gap-2 flex-wrap">
        <button
          onClick={() => { setMonth((m) => (m === 1 ? 12 : m - 1)); setOnlyToday(false) }}
          className="shrink-0 p-2 rounded-xl bg-white border border-beetz-dark/10 hover:bg-beetz-gray"
          aria-label="Mês anterior"
        >
          <ChevronLeft size={16} />
        </button>
        <select
          value={month}
          onChange={(e) => { setMonth(Number(e.target.value)); setOnlyToday(false) }}
          className={`${inputClass} font-semibold capitalize flex-1 min-w-0 sm:flex-none sm:min-w-[160px]`}
        >
          {MONTHS.map((m, i) => (
            <option key={m} value={i + 1}>{m}{i + 1 === thisMonth ? ' (mês atual)' : ''}</option>
          ))}
        </select>
        <button
          onClick={() => { setMonth((m) => (m === 12 ? 1 : m + 1)); setOnlyToday(false) }}
          className="shrink-0 p-2 rounded-xl bg-white border border-beetz-dark/10 hover:bg-beetz-gray"
          aria-label="Próximo mês"
        >
          <ChevronRight size={16} />
        </button>

        <button
          onClick={() => setShowFilters((v) => !v)}
          className={`ml-auto shrink-0 flex items-center gap-1.5 text-sm font-semibold px-3 py-2 rounded-xl border transition-colors ${
            showFilters || activeFilters > 0
              ? 'bg-beetz-dark text-white border-beetz-dark'
              : 'bg-white text-beetz-dark/70 border-beetz-dark/10 hover:bg-beetz-gray'
          }`}
        >
          <Filter size={14} /> Filtros
          {activeFilters > 0 && (
            <span className="bg-beetz-yellow text-beetz-dark text-[10px] font-bold w-4 h-4 rounded-full flex items-center justify-center">
              {activeFilters}
            </span>
          )}
        </button>
      </div>

      {/* Painel compacto: busca em cima, selects dividindo a linha no celular.
          O antigo checkbox "Só quem faz hoje" virou a pill 🎂 Hoje lá em cima. */}
      {showFilters && (
        <div className="bg-white rounded-2xl p-4 border border-beetz-dark/5 shadow-soft space-y-3">
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            <div className="relative col-span-2 sm:col-span-1">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-beetz-dark/30" />
              <input
                placeholder="Buscar por nome"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className={`${inputClass} w-full pl-9`}
              />
            </div>
            <select value={dept} onChange={(e) => setDept(e.target.value)} className={`${inputClass} w-full min-w-0`}>
              <option value="">Todos os departamentos</option>
              {departments.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
            </select>
            <select value={kind} onChange={(e) => setKind(e.target.value as KindFilter)} className={`${inputClass} w-full min-w-0`}>
              <option value="todos">Cadastrados e pré-cadastros</option>
              <option value="cadastrados">Só cadastrados</option>
              <option value="pre">Só pré-cadastros</option>
            </select>
          </div>
          {activeFilters > 0 && (
            <div className="flex justify-end">
              <button onClick={clearFilters} className="text-xs font-semibold text-beetz-dark/50 hover:text-beetz-dark">
                Limpar filtros
              </button>
            </div>
          )}
        </div>
      )}

      {loading ? (
        <p className="text-beetz-dark/50">Carregando...</p>
      ) : filtered.length === 0 ? (
        <p className="text-beetz-dark/50 bg-white rounded-2xl p-8 text-center border border-beetz-dark/5">
          {onlyToday
            ? 'Ninguém apaga velinha hoje — espia o resto do mês! 🎂'
            : activeFilters > 0
              ? 'Nenhum aniversariante com esses filtros.'
              : `Ninguém faz aniversário em ${MONTHS[month - 1]}.`}
        </p>
      ) : (
        <>
          <p className="text-xs text-beetz-dark/40">
            {onlyToday
              ? `${filtered.length} ${filtered.length === 1 ? 'pessoa apaga velinha' : 'pessoas apagam velinha'} hoje`
              : `${filtered.length} ${filtered.length === 1 ? 'pessoa' : 'pessoas'} em ${MONTHS[month - 1]}`}
          </p>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {filtered.map((item) => {
              const { day } = item
              const isToday = day === today && item.month === thisMonth
              const age = turningAge(item.year, now.getFullYear())
              // No lugar do antigo "Ainda não se cadastrou": a idade que a
              // pessoa faz — em cadastrados e pré-cadastros igualmente.
              const ageLine = age !== null ? (
                <span className="mt-2 text-[11px] font-semibold text-beetz-dark/45">
                  {isToday ? `${age} anos hoje! 🎂` : `Faz ${age} anos`}
                </span>
              ) : null
              const cardClass = `bg-white rounded-2xl p-5 shadow-soft border flex flex-col items-center text-center transition-shadow ${
                isToday ? 'border-beetz-yellow ring-2 ring-beetz-yellow/40' : 'border-beetz-dark/5'
              } ${item.kind === 'pending' ? 'border-dashed opacity-90' : 'hover:shadow-glow'}`

              const badge = (
                <span
                  className={`mt-3 text-[11px] font-semibold px-2.5 py-1 rounded-full ${
                    isToday ? 'bg-beetz-yellow text-beetz-dark' : 'bg-beetz-dark/5 text-beetz-dark/60'
                  }`}
                >
                  {isToday ? '🎉 Hoje!' : `Dia ${day}`}
                </span>
              )

              const name = `${item.profile.first_name ?? ''} ${item.profile.last_name ?? ''}`.trim() || 'Sem nome'
              const emailButton = canSendEmail && (
                <button
                  onClick={(e: React.MouseEvent) => {
                    e.preventDefault()
                    e.stopPropagation()
                    setEmailing({
                      target: item.kind === 'real'
                        ? { kind: 'profile', id: item.profile.id }
                        : { kind: 'pending', id: item.profile.id },
                      name,
                      firstName: item.profile.first_name ?? '',
                      avatarUrl: item.profile.avatar_url
                    })
                  }}
                  className="mt-3 flex items-center gap-1.5 text-xs font-bold honey-gradient text-beetz-dark px-3 py-1.5 rounded-lg"
                >
                  <Mail size={12} /> Parabenizar
                </button>
              )

              if (item.kind === 'real') {
                const profile = item.profile
                return (
                  <div key={profile.id} className={cardClass}>
                    <Link to={`/perfil/${profile.id}`} className="flex flex-col items-center">
                      <Avatar src={profile.avatar_url} name={name} size="lg" />
                      <h3 className="mt-3 font-bold text-base">{name}</h3>
                      {deptName(profile.department_id) && (
                        <p className="text-xs text-beetz-dark/40 mt-0.5">{deptName(profile.department_id)}</p>
                      )}
                      {badge}
                      {ageLine}
                    </Link>
                    {emailButton}
                  </div>
                )
              }

              const profile = item.profile
              const inner = (
                <>
                  <Avatar src={profile.avatar_url} name={name} size="lg" />
                  <h3 className="mt-3 font-bold text-base">{name}</h3>
                  <p className="text-xs text-beetz-dark/40 mt-0.5">{pendingDeptName(profile.department_hint) || profile.role_hint || 'Colaborador(a)'}</p>
                  {badge}
                  {ageLine}
                </>
              )
              return (
                <div key={profile.id} className={cardClass}>
                  {canViewDetails ? (
                    <button type="button" onClick={() => setViewingPending(profile)} className="flex flex-col items-center">
                      {inner}
                    </button>
                  ) : (
                    <div className="flex flex-col items-center">{inner}</div>
                  )}
                  {emailButton}
                </div>
              )
            })}
          </div>
        </>
      )}

      {canViewDetails && viewingPending && (
        <PendingProfileModal
          profile={viewingPending}
          departmentName={pendingDeptName(viewingPending.department_hint)}
          onClose={() => setViewingPending(null)}
        />
      )}

      {emailing && (
        <BirthdayEmailModal
          target={emailing.target}
          name={emailing.name}
          firstName={emailing.firstName}
          avatarUrl={emailing.avatarUrl}
          onClose={() => setEmailing(null)}
        />
      )}
    </div>
  )
}
