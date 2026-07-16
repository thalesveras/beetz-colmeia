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

// Lê só dia e mês do birth_date (formato YYYY-MM-DD), nunca o ano —
// aqui a gente celebra aniversário, não expõe idade de ninguém.
function dayAndMonth(birthDate: string): { day: number; month: number } | null {
  const parts = birthDate.split('-')
  if (parts.length !== 3) return null
  const month = Number(parts[1])
  const day = Number(parts[2])
  if (!month || !day) return null
  return { day, month }
}

function normalize(s: string) {
  return s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
}

type BirthdayItem =
  | { kind: 'real'; day: number; month: number; profile: Profile }
  | { kind: 'pending'; day: number; month: number; profile: PendingProfileDirectoryItem }

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
        const dm = dayAndMonth(p.birth_date)
        if (!dm) return null
        return { kind: 'real' as const, day: dm.day, month: dm.month, profile: p }
      })
      .filter((x): x is BirthdayItem & { kind: 'real' } => x !== null)

    // Pré-cadastro já vem só com mês/dia (nunca ano) — a pessoa ainda não se
    // cadastrou, mas já faz parte da Beetz, então merece aparecer aqui também.
    const pend: BirthdayItem[] = pending
      .map((p) => {
        if (!p.birth_month || !p.birth_day) return null
        return { kind: 'pending' as const, day: p.birth_day, month: p.birth_month, profile: p }
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

  const activeFilters = [search.trim() ? 1 : 0, dept ? 1 : 0, kind !== 'todos' ? 1 : 0, onlyToday ? 1 : 0]
    .reduce((a, b) => a + b, 0)

  function clearFilters() {
    setSearch(''); setDept(''); setKind('todos'); setOnlyToday(false)
  }

  const todayCount = allItems.filter((i) => i.month === thisMonth && i.day === today).length

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
        <p className="text-beetz-dark/60 mt-1">
          Quem faz aniversário na colmeia — cadastrado(a) ou não.
          {todayCount > 0 && ` Hoje tem ${todayCount} aniversariante${todayCount > 1 ? 's' : ''}! 🎉`}
        </p>
      </div>

      {/* Navegação de mês — o coração da tela, fica sempre visível */}
      <div className="flex items-center gap-2">
        <button
          onClick={() => setMonth((m) => (m === 1 ? 12 : m - 1))}
          className="p-2 rounded-xl bg-white border border-beetz-dark/10 hover:bg-beetz-gray"
          aria-label="Mês anterior"
        >
          <ChevronLeft size={16} />
        </button>
        <select value={month} onChange={(e) => setMonth(Number(e.target.value))} className={`${inputClass} font-semibold capitalize flex-1 sm:flex-none sm:min-w-[160px]`}>
          {MONTHS.map((m, i) => (
            <option key={m} value={i + 1}>{m}{i + 1 === thisMonth ? ' (mês atual)' : ''}</option>
          ))}
        </select>
        <button
          onClick={() => setMonth((m) => (m === 12 ? 1 : m + 1))}
          className="p-2 rounded-xl bg-white border border-beetz-dark/10 hover:bg-beetz-gray"
          aria-label="Próximo mês"
        >
          <ChevronRight size={16} />
        </button>

        <button
          onClick={() => setShowFilters((v) => !v)}
          className={`ml-auto flex items-center gap-1.5 text-sm font-semibold px-3 py-2 rounded-xl border transition-colors ${
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

      {showFilters && (
        <div className="bg-white rounded-2xl p-4 border border-beetz-dark/5 shadow-soft space-y-3">
          <div className="grid sm:grid-cols-3 gap-3">
            <div className="relative">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-beetz-dark/30" />
              <input
                placeholder="Buscar por nome"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className={`${inputClass} w-full pl-9`}
              />
            </div>
            <select value={dept} onChange={(e) => setDept(e.target.value)} className={`${inputClass} w-full`}>
              <option value="">Todos os departamentos</option>
              {departments.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
            </select>
            <select value={kind} onChange={(e) => setKind(e.target.value as KindFilter)} className={`${inputClass} w-full`}>
              <option value="todos">Cadastrados e pré-cadastros</option>
              <option value="cadastrados">Só cadastrados</option>
              <option value="pre">Só pré-cadastros</option>
            </select>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <label className="flex items-center gap-2 text-sm text-beetz-dark/70">
              <input
                type="checkbox"
                checked={onlyToday}
                onChange={(e) => { setOnlyToday(e.target.checked); if (e.target.checked) setMonth(thisMonth) }}
              />
              Só quem faz hoje
            </label>
            {activeFilters > 0 && (
              <button onClick={clearFilters} className="text-xs font-semibold text-beetz-dark/50 hover:text-beetz-dark ml-auto">
                Limpar filtros
              </button>
            )}
          </div>
        </div>
      )}

      {loading ? (
        <p className="text-beetz-dark/50">Carregando...</p>
      ) : filtered.length === 0 ? (
        <p className="text-beetz-dark/50 bg-white rounded-2xl p-8 text-center border border-beetz-dark/5">
          {activeFilters > 0
            ? 'Nenhum aniversariante com esses filtros.'
            : `Ninguém faz aniversário em ${MONTHS[month - 1]}.`}
        </p>
      ) : (
        <>
          <p className="text-xs text-beetz-dark/40">
            {filtered.length} {filtered.length === 1 ? 'pessoa' : 'pessoas'} em {MONTHS[month - 1]}
          </p>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {filtered.map((item) => {
              const { day } = item
              const isToday = day === today && item.month === thisMonth
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
                  <span className="mt-2 text-[10px] font-semibold text-beetz-dark/40">Ainda não se cadastrou</span>
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
