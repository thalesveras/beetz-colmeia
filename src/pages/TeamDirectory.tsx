import { useEffect, useMemo, useState } from 'react'
import { ChevronLeft, ChevronRight, Filter, Search, X } from 'lucide-react'
import {
  listDepartments, listEvents, listEventMembers, listPendingProfilesForDirectory, listProfiles,
  pendingDepartmentHintToSlug
} from '../lib/dataService'
import { useAuth } from '../contexts/AuthContext'
import { canViewPendingProfileDetails, canViewTeamDirectory } from '../lib/permissions'
import type { Department, EventItem, PendingProfileDirectoryItem, Profile } from '../lib/types'
import ProfileCard from '../components/ui/ProfileCard'
import PendingProfileCard from '../components/ui/PendingProfileCard'
import PendingProfileModal from '../components/ui/PendingProfileModal'

const PAGE_SIZE = 24

// Gera a lista de números de página com "..." nos intervalos, sempre
// mantendo a primeira, a última e uma vizinhança da página atual visíveis —
// evita uma barra de 40 botões quando a turma cresce.
function getPageNumbers(current: number, total: number): (number | 'ellipsis')[] {
  if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1)
  const pages: (number | 'ellipsis')[] = [1]
  if (current > 3) pages.push('ellipsis')
  const start = Math.max(2, current - 1)
  const end = Math.min(total - 1, current + 1)
  for (let i = start; i <= end; i++) pages.push(i)
  if (current < total - 2) pages.push('ellipsis')
  pages.push(total)
  return pages
}

type CombinedEntry =
  | { key: string; name: string; kind: 'profile'; profile: Profile }
  | { key: string; name: string; kind: 'pending'; profile: PendingProfileDirectoryItem }

export default function TeamDirectory() {
  const { accessRole } = useAuth()
  const canViewDetails = canViewPendingProfileDetails(accessRole)
  const [profiles, setProfiles] = useState<Profile[]>([])
  const [pending, setPending] = useState<PendingProfileDirectoryItem[]>([])
  const [departments, setDepartments] = useState<Department[]>([])
  const [events, setEvents] = useState<EventItem[]>([])
  const [eventProfileIds, setEventProfileIds] = useState<Set<string>>(new Set())
  const [loading, setLoading] = useState(true)
  const [viewingPending, setViewingPending] = useState<PendingProfileDirectoryItem | null>(null)

  const [search, setSearch] = useState('')
  const [department, setDepartment] = useState('')
  const [city, setCity] = useState('')
  const [experience, setExperience] = useState('')
  const [eventId, setEventId] = useState('')
  const [role, setRole] = useState('')
  const [registrationStatus, setRegistrationStatus] = useState<'' | 'completo' | 'pendente'>('')
  const [showAdvanced, setShowAdvanced] = useState(false)
  const [page, setPage] = useState(1)

  useEffect(() => {
    Promise.all([listProfiles(), listDepartments(), listEvents(), listPendingProfilesForDirectory()]).then(
      ([p, d, e, pend]) => {
        setProfiles(p)
        setDepartments(d)
        setEvents(e)
        setPending(pend)
        setLoading(false)
      }
    )
  }, [])

  useEffect(() => {
    if (!eventId) { setEventProfileIds(new Set()); return }
    listEventMembers(eventId).then((members) => setEventProfileIds(new Set(members.map((m) => m.profile_id))))
  }, [eventId])

  useEffect(() => {
    setPage(1)
  }, [search, department, city, experience, eventId, role, registrationStatus])

  const cities = useMemo(() => Array.from(new Set(profiles.map((p) => p.city).filter(Boolean))) as string[], [profiles])
  const experiences = ['Nova abelha', 'Em treinamento', 'Colaborador frequente', 'Líder de bar']
  const roles = useMemo(() => {
    const set = new Set<string>()
    profiles.forEach((p) => p.role && set.add(p.role))
    pending.forEach((p) => p.role_hint && set.add(p.role_hint))
    return Array.from(set).sort((a, b) => a.localeCompare(b, 'pt-BR'))
  }, [profiles, pending])

  const filtered = profiles.filter((p) => {
    if (registrationStatus === 'pendente') return false
    if (search && !`${p.first_name} ${p.last_name}`.toLowerCase().includes(search.toLowerCase())) return false
    if (department && p.department_id !== department) return false
    if (city && p.city !== city) return false
    if (experience && p.experience_level !== experience) return false
    if (eventId && !eventProfileIds.has(p.id)) return false
    if (role && p.role !== role) return false
    return true
  })

  const deptName = (id: string | null) => departments.find((d) => d.id === id)?.name

  // Pré-cadastro não tem histórico de evento nem nível de experiência (nunca
  // fez login), então esses dois filtros simplesmente escondem essa seção —
  // busca, departamento, cidade e cargo continuam funcionando normalmente.
  const filteredPending = registrationStatus === 'completo' || eventId || experience ? [] : pending.filter((p) => {
    const name = `${p.first_name ?? ''} ${p.last_name ?? ''}`.trim()
    if (search && !name.toLowerCase().includes(search.toLowerCase())) return false
    if (department) {
      const slug = pendingDepartmentHintToSlug(p.department_hint)
      const dept = departments.find((d) => d.slug === slug)
      if (dept?.id !== department) return false
    }
    if (city && p.city !== city) return false
    if (role && p.role_hint !== role) return false
    return true
  })

  const combined: CombinedEntry[] = useMemo(() => {
    const items: CombinedEntry[] = [
      ...filtered.map((p) => ({ key: `p-${p.id}`, name: `${p.first_name} ${p.last_name}`.trim(), kind: 'profile' as const, profile: p })),
      ...filteredPending.map((p) => ({
        key: `x-${p.id}`,
        name: `${p.first_name ?? ''} ${p.last_name ?? ''}`.trim() || 'Sem nome',
        kind: 'pending' as const,
        profile: p
      }))
    ]
    return items.sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'))
  }, [filtered, filteredPending])

  const totalPages = Math.max(1, Math.ceil(combined.length / PAGE_SIZE))
  const pageSafe = Math.min(page, totalPages)
  const pageStart = (pageSafe - 1) * PAGE_SIZE
  const pageItems = combined.slice(pageStart, pageStart + PAGE_SIZE)

  const advancedActiveCount = [experience, eventId, role, registrationStatus].filter(Boolean).length
  const anyFilterActive = !!(search || department || city || experience || eventId || role || registrationStatus)

  function clearFilters() {
    setSearch(''); setDepartment(''); setCity(''); setExperience(''); setEventId(''); setRole(''); setRegistrationStatus('')
  }

  if (!canViewTeamDirectory(accessRole)) {
    return (
      <div className="bg-white rounded-2xl p-8 shadow-soft border border-beetz-dark/5 text-center">
        <p className="text-4xl mb-3">🔒</p>
        <h1 className="text-xl font-bold mb-1">Acesso restrito</h1>
        <p className="text-sm text-beetz-dark/60">Seu perfil de acesso não tem permissão pra ver a turma.</p>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl md:text-3xl font-extrabold">Conheça a turma</h1>
        <p className="text-beetz-dark/60 mt-1">Todas as abelhas que fazem a colmeia funcionar.</p>
      </div>

      <div className="bg-white rounded-2xl p-4 shadow-soft border border-beetz-dark/5 space-y-3">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
          <div className="relative md:col-span-1">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-beetz-dark/40" />
            <input
              value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Buscar por nome"
              className="w-full pl-9 pr-3 py-2 rounded-xl border border-beetz-dark/15 text-sm focus:outline-none focus:ring-2 focus:ring-beetz-yellow"
            />
          </div>
          <select value={department} onChange={(e) => setDepartment(e.target.value)} className="rounded-xl border border-beetz-dark/15 text-sm px-3 py-2">
            <option value="">Todos os departamentos</option>
            {departments.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
          </select>
          <select value={city} onChange={(e) => setCity(e.target.value)} className="rounded-xl border border-beetz-dark/15 text-sm px-3 py-2">
            <option value="">Todas as cidades</option>
            {cities.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setShowAdvanced((v) => !v)}
              className={`flex-1 flex items-center justify-center gap-1.5 text-sm font-semibold px-3 py-2 rounded-xl border transition-colors ${
                showAdvanced || advancedActiveCount > 0
                  ? 'bg-beetz-dark text-white border-beetz-dark'
                  : 'border-beetz-dark/15 text-beetz-dark/70 hover:bg-beetz-gray'
              }`}
            >
              <Filter size={15} /> Mais filtros
              {advancedActiveCount > 0 && (
                <span className="bg-beetz-yellow text-beetz-dark text-[11px] font-bold w-5 h-5 rounded-full flex items-center justify-center">
                  {advancedActiveCount}
                </span>
              )}
            </button>
            {anyFilterActive && (
              <button
                type="button"
                onClick={clearFilters}
                title="Limpar filtros"
                className="shrink-0 flex items-center justify-center px-3 py-2 rounded-xl border border-beetz-dark/15 text-beetz-dark/50 hover:text-red-600 hover:border-red-200 hover:bg-red-50 transition-colors"
              >
                <X size={16} />
              </button>
            )}
          </div>
        </div>

        {showAdvanced && (
          <div className="grid grid-cols-1 md:grid-cols-4 gap-3 pt-3 border-t border-beetz-dark/10">
            <select value={experience} onChange={(e) => setExperience(e.target.value)} className="rounded-xl border border-beetz-dark/15 text-sm px-3 py-2">
              <option value="">Toda experiência</option>
              {experiences.map((exp) => <option key={exp} value={exp}>{exp}</option>)}
            </select>
            <select value={eventId} onChange={(e) => setEventId(e.target.value)} className="rounded-xl border border-beetz-dark/15 text-sm px-3 py-2">
              <option value="">Todos os eventos</option>
              {events.map((ev) => <option key={ev.id} value={ev.id}>{ev.name}</option>)}
            </select>
            <select value={role} onChange={(e) => setRole(e.target.value)} className="rounded-xl border border-beetz-dark/15 text-sm px-3 py-2">
              <option value="">Todos os cargos</option>
              {roles.map((r) => <option key={r} value={r}>{r}</option>)}
            </select>
            <select
              value={registrationStatus}
              onChange={(e) => setRegistrationStatus(e.target.value as '' | 'completo' | 'pendente')}
              className="rounded-xl border border-beetz-dark/15 text-sm px-3 py-2"
            >
              <option value="">Todos os cadastros</option>
              <option value="completo">Só cadastro completo</option>
              <option value="pendente">Só pré-cadastro</option>
            </select>
          </div>
        )}
      </div>

      {loading ? (
        <p className="text-beetz-dark/50">Carregando...</p>
      ) : combined.length === 0 ? (
        <p className="text-beetz-dark/50 bg-white rounded-2xl p-8 text-center border border-beetz-dark/5">Nenhuma abelha encontrada com esses filtros.</p>
      ) : (
        <>
          <div className="flex items-center justify-between flex-wrap gap-2">
            <p className="text-sm text-beetz-dark/50">
              Mostrando {pageStart + 1}–{Math.min(pageStart + PAGE_SIZE, combined.length)} de {combined.length} abelha(s)
            </p>
            {filteredPending.length > 0 && (
              <p className="text-xs text-beetz-dark/40">
                Cards com borda tracejada ainda não criaram conta no app.
              </p>
            )}
          </div>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {pageItems.map((item) =>
              item.kind === 'profile' ? (
                <ProfileCard key={item.key} profile={item.profile} departmentName={deptName(item.profile.department_id)} />
              ) : (
                <PendingProfileCard
                  key={item.key}
                  profile={item.profile}
                  onClick={canViewDetails ? () => setViewingPending(item.profile) : undefined}
                />
              )
            )}
          </div>

          {totalPages > 1 && (
            <div className="flex items-center justify-center gap-1.5 pt-2">
              <button
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={pageSafe === 1}
                className="p-2 rounded-xl border border-beetz-dark/15 text-beetz-dark/60 hover:bg-beetz-gray disabled:opacity-30 disabled:hover:bg-transparent transition-colors"
              >
                <ChevronLeft size={16} />
              </button>
              {getPageNumbers(pageSafe, totalPages).map((p, i) =>
                p === 'ellipsis' ? (
                  <span key={`e-${i}`} className="px-2 text-beetz-dark/30 text-sm">…</span>
                ) : (
                  <button
                    key={p}
                    onClick={() => setPage(p)}
                    className={`min-w-[2.25rem] h-9 px-2 rounded-xl text-sm font-semibold transition-colors ${
                      p === pageSafe ? 'bg-beetz-dark text-white' : 'text-beetz-dark/60 hover:bg-beetz-gray'
                    }`}
                  >
                    {p}
                  </button>
                )
              )}
              <button
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={pageSafe === totalPages}
                className="p-2 rounded-xl border border-beetz-dark/15 text-beetz-dark/60 hover:bg-beetz-gray disabled:opacity-30 disabled:hover:bg-transparent transition-colors"
              >
                <ChevronRight size={16} />
              </button>
            </div>
          )}
        </>
      )}

      {canViewDetails && viewingPending && (
        <PendingProfileModal
          profile={viewingPending}
          departmentName={departments.find((d) => d.slug === pendingDepartmentHintToSlug(viewingPending.department_hint))?.name}
          onClose={() => setViewingPending(null)}
        />
      )}
    </div>
  )
}
