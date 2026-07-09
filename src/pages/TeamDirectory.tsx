import { useEffect, useMemo, useState } from 'react'
import { Search } from 'lucide-react'
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

  const cities = useMemo(() => Array.from(new Set(profiles.map((p) => p.city).filter(Boolean))) as string[], [profiles])
  const experiences = ['Nova abelha', 'Em treinamento', 'Colaborador frequente', 'Líder de bar']

  const filtered = profiles.filter((p) => {
    if (search && !`${p.first_name} ${p.last_name}`.toLowerCase().includes(search.toLowerCase())) return false
    if (department && p.department_id !== department) return false
    if (city && p.city !== city) return false
    if (experience && p.experience_level !== experience) return false
    if (eventId && !eventProfileIds.has(p.id)) return false
    return true
  })

  const deptName = (id: string | null) => departments.find((d) => d.id === id)?.name

  // Pré-cadastro não tem histórico de evento nem nível de experiência (nunca
  // fez login), então esses dois filtros simplesmente escondem essa seção —
  // busca, departamento e cidade continuam funcionando normalmente.
  const filteredPending = eventId || experience ? [] : pending.filter((p) => {
    const name = `${p.first_name ?? ''} ${p.last_name ?? ''}`.trim()
    if (search && !name.toLowerCase().includes(search.toLowerCase())) return false
    if (department) {
      const slug = pendingDepartmentHintToSlug(p.department_hint)
      const dept = departments.find((d) => d.slug === slug)
      if (dept?.id !== department) return false
    }
    if (city && p.city !== city) return false
    return true
  })

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

      <div className="bg-white rounded-2xl p-4 shadow-soft border border-beetz-dark/5 grid grid-cols-1 md:grid-cols-5 gap-3">
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
        <select value={experience} onChange={(e) => setExperience(e.target.value)} className="rounded-xl border border-beetz-dark/15 text-sm px-3 py-2">
          <option value="">Toda experiência</option>
          {experiences.map((exp) => <option key={exp} value={exp}>{exp}</option>)}
        </select>
        <select value={eventId} onChange={(e) => setEventId(e.target.value)} className="rounded-xl border border-beetz-dark/15 text-sm px-3 py-2">
          <option value="">Todos os eventos</option>
          {events.map((ev) => <option key={ev.id} value={ev.id}>{ev.name}</option>)}
        </select>
      </div>

      {loading ? (
        <p className="text-beetz-dark/50">Carregando...</p>
      ) : filtered.length === 0 && filteredPending.length === 0 ? (
        <p className="text-beetz-dark/50 bg-white rounded-2xl p-8 text-center border border-beetz-dark/5">Nenhuma abelha encontrada com esses filtros.</p>
      ) : (
        <>
          {filtered.length > 0 && (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              {filtered.map((p) => <ProfileCard key={p.id} profile={p} departmentName={deptName(p.department_id)} />)}
            </div>
          )}

          {filteredPending.length > 0 && (
            <div className="space-y-3">
              <div>
                <h2 className="font-bold text-lg">Pré-cadastro</h2>
                <p className="text-sm text-beetz-dark/50">
                  Já fazem parte da Beetz, mas ainda não criaram conta no app — quando se cadastrarem, viram perfil completo automaticamente.
                </p>
              </div>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                {filteredPending.map((p) => (
                  <PendingProfileCard key={p.id} profile={p} onClick={canViewDetails ? () => setViewingPending(p) : undefined} />
                ))}
              </div>
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
