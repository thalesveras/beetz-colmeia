import { useEffect, useState } from 'react'
import { Cake } from 'lucide-react'
import { listDepartments, listPendingProfilesForDirectory, listProfiles, pendingDepartmentHintToSlug } from '../lib/dataService'
import type { Department, PendingProfileDirectoryItem, Profile } from '../lib/types'
import Avatar from '../components/ui/Avatar'
import PendingProfileModal from '../components/ui/PendingProfileModal'
import { Link } from 'react-router-dom'

const MONTHS = [
  'janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho',
  'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'
]

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

type BirthdayItem =
  | { kind: 'real'; day: number; profile: Profile }
  | { kind: 'pending'; day: number; profile: PendingProfileDirectoryItem }

export default function Birthdays() {
  const [profiles, setProfiles] = useState<Profile[]>([])
  const [pending, setPending] = useState<PendingProfileDirectoryItem[]>([])
  const [departments, setDepartments] = useState<Department[]>([])
  const [loading, setLoading] = useState(true)
  const [viewingPending, setViewingPending] = useState<PendingProfileDirectoryItem | null>(null)

  useEffect(() => {
    Promise.all([listProfiles(), listDepartments(), listPendingProfilesForDirectory()]).then(([p, d, pend]) => {
      setProfiles(p)
      setDepartments(d)
      setPending(pend)
      setLoading(false)
    })
  }, [])

  const now = new Date()
  const currentMonth = now.getMonth() + 1
  const today = now.getDate()

  const realBirthdays: BirthdayItem[] = profiles
    .map((p) => {
      if (!p.birth_date) return null
      const dm = dayAndMonth(p.birth_date)
      if (!dm || dm.month !== currentMonth) return null
      return { kind: 'real' as const, day: dm.day, profile: p }
    })
    .filter((x): x is BirthdayItem & { kind: 'real' } => x !== null)

  // Pré-cadastro já vem só com mês/dia (nunca ano) — a pessoa ainda não se
  // cadastrou, mas já faz parte da Beetz, então merece aparecer aqui também.
  const pendingBirthdays: BirthdayItem[] = pending
    .map((p) => {
      if (!p.birth_month || !p.birth_day || p.birth_month !== currentMonth) return null
      return { kind: 'pending' as const, day: p.birth_day, profile: p }
    })
    .filter((x): x is BirthdayItem & { kind: 'pending' } => x !== null)

  const birthdayPeople = [...realBirthdays, ...pendingBirthdays].sort((a, b) => a.day - b.day)

  const deptName = (id: string | null) => departments.find((d) => d.id === id)?.name
  const pendingDeptName = (hint: string | null) => departments.find((d) => d.slug === pendingDepartmentHintToSlug(hint))?.name

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl md:text-3xl font-extrabold flex items-center gap-2">
          <Cake size={26} className="text-beetz-yellow" /> Aniversariantes de {MONTHS[currentMonth - 1]}
        </h1>
        <p className="text-beetz-dark/60 mt-1">Quem faz aniversário este mês na colmeia — cadastrado(a) ou não.</p>
      </div>

      {loading ? (
        <p className="text-beetz-dark/50">Carregando...</p>
      ) : birthdayPeople.length === 0 ? (
        <p className="text-beetz-dark/50 bg-white rounded-2xl p-8 text-center border border-beetz-dark/5">
          Ninguém faz aniversário em {MONTHS[currentMonth - 1]}.
        </p>
      ) : (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {birthdayPeople.map((item) => {
            const { day } = item
            const isToday = day === today
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

            if (item.kind === 'real') {
              const profile = item.profile
              return (
                <Link key={profile.id} to={`/perfil/${profile.id}`} className={cardClass}>
                  <Avatar src={profile.avatar_url} name={`${profile.first_name} ${profile.last_name}`} size="lg" />
                  <h3 className="mt-3 font-bold text-base">{profile.first_name} {profile.last_name}</h3>
                  {deptName(profile.department_id) && (
                    <p className="text-xs text-beetz-dark/40 mt-0.5">{deptName(profile.department_id)}</p>
                  )}
                  {badge}
                </Link>
              )
            }

            const profile = item.profile
            const name = `${profile.first_name ?? ''} ${profile.last_name ?? ''}`.trim() || 'Sem nome'
            return (
              <button key={profile.id} type="button" onClick={() => setViewingPending(profile)} className={cardClass}>
                <Avatar src={profile.avatar_url} name={name} size="lg" />
                <h3 className="mt-3 font-bold text-base">{name}</h3>
                <p className="text-xs text-beetz-dark/40 mt-0.5">{pendingDeptName(profile.department_hint) || profile.role_hint || 'Colaborador(a)'}</p>
                {badge}
                <span className="mt-2 text-[10px] font-semibold text-beetz-dark/40">Ainda não se cadastrou</span>
              </button>
            )
          })}
        </div>
      )}

      {viewingPending && (
        <PendingProfileModal
          profile={viewingPending}
          departmentName={pendingDeptName(viewingPending.department_hint)}
          onClose={() => setViewingPending(null)}
        />
      )}
    </div>
  )
}
