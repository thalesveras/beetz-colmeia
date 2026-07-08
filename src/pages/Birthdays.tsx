import { useEffect, useState } from 'react'
import { Cake } from 'lucide-react'
import { listDepartments, listProfiles } from '../lib/dataService'
import type { Department, Profile } from '../lib/types'
import Avatar from '../components/ui/Avatar'
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

export default function Birthdays() {
  const [profiles, setProfiles] = useState<Profile[]>([])
  const [departments, setDepartments] = useState<Department[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    Promise.all([listProfiles(), listDepartments()]).then(([p, d]) => {
      setProfiles(p)
      setDepartments(d)
      setLoading(false)
    })
  }, [])

  const now = new Date()
  const currentMonth = now.getMonth() + 1
  const today = now.getDate()

  const birthdayPeople = profiles
    .map((p) => {
      if (!p.birth_date) return null
      const dm = dayAndMonth(p.birth_date)
      if (!dm || dm.month !== currentMonth) return null
      return { profile: p, day: dm.day }
    })
    .filter((x): x is { profile: Profile; day: number } => x !== null)
    .sort((a, b) => a.day - b.day)

  const deptName = (id: string | null) => departments.find((d) => d.id === id)?.name

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl md:text-3xl font-extrabold flex items-center gap-2">
          <Cake size={26} className="text-beetz-yellow" /> Aniversariantes de {MONTHS[currentMonth - 1]}
        </h1>
        <p className="text-beetz-dark/60 mt-1">Quem faz aniversário este mês na colmeia.</p>
      </div>

      {loading ? (
        <p className="text-beetz-dark/50">Carregando...</p>
      ) : birthdayPeople.length === 0 ? (
        <p className="text-beetz-dark/50 bg-white rounded-2xl p-8 text-center border border-beetz-dark/5">
          Ninguém faz aniversário em {MONTHS[currentMonth - 1]}.
        </p>
      ) : (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {birthdayPeople.map(({ profile, day }) => (
            <Link
              key={profile.id}
              to={`/perfil/${profile.id}`}
              className={`bg-white rounded-2xl p-5 shadow-soft border flex flex-col items-center text-center hover:shadow-glow transition-shadow ${
                day === today ? 'border-beetz-yellow ring-2 ring-beetz-yellow/40' : 'border-beetz-dark/5'
              }`}
            >
              <Avatar src={profile.avatar_url} name={`${profile.first_name} ${profile.last_name}`} size="lg" />
              <h3 className="mt-3 font-bold text-base">{profile.first_name} {profile.last_name}</h3>
              {deptName(profile.department_id) && (
                <p className="text-xs text-beetz-dark/40 mt-0.5">{deptName(profile.department_id)}</p>
              )}
              <span
                className={`mt-3 text-[11px] font-semibold px-2.5 py-1 rounded-full ${
                  day === today ? 'bg-beetz-yellow text-beetz-dark' : 'bg-beetz-dark/5 text-beetz-dark/60'
                }`}
              >
                {day === today ? '🎉 Hoje!' : `Dia ${day}`}
              </span>
            </Link>
          ))}
        </div>
      )}
    </div>
  )
}
