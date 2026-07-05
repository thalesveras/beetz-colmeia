import { Link } from 'react-router-dom'
import Avatar from './Avatar'
import LevelPill from './LevelPill'
import type { Profile } from '../../lib/types'
import { useEffect, useState } from 'react'
import { getProfileStats } from '../../lib/dataService'

export default function ProfileCard({ profile, departmentName }: { profile: Profile; departmentName?: string }) {
  const [eventsCount, setEventsCount] = useState(0)

  useEffect(() => {
    let active = true
    getProfileStats(profile.id).then((s) => { if (active) setEventsCount(s.eventsCount) })
    return () => { active = false }
  }, [profile.id])

  return (
    <div className="bg-white rounded-2xl p-5 shadow-soft border border-beetz-dark/5 flex flex-col items-center text-center hover:shadow-glow transition-shadow">
      <Avatar src={profile.avatar_url} name={`${profile.first_name} ${profile.last_name}`} size="lg" />
      <h3 className="mt-3 font-bold text-base">{profile.first_name} {profile.last_name}</h3>
      <p className="text-sm text-beetz-dark/60">{profile.role || 'Colaborador(a)'}</p>
      {departmentName && <p className="text-xs text-beetz-dark/40 mt-0.5">{departmentName}</p>}
      <p className="text-xs text-beetz-dark/50 mt-1">📍 {profile.city || 'Cidade não informada'}</p>
      <div className="mt-3">
        <LevelPill eventsCount={eventsCount} />
      </div>
      <Link
        to={`/perfil/${profile.id}`}
        className="mt-4 w-full text-center bg-beetz-dark text-beetz-yellow font-semibold text-sm py-2 rounded-xl hover:bg-black transition-colors"
      >
        Ver perfil
      </Link>
    </div>
  )
}
