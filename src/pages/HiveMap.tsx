import { useEffect, useState } from 'react'
import { listDepartments, listPendingProfilesForDirectory, listProfiles, pendingDepartmentHintToSlug } from '../lib/dataService'
import type { Department, PendingProfileDirectoryItem, Profile } from '../lib/types'
import ProfileCard from '../components/ui/ProfileCard'
import PendingProfileCard from '../components/ui/PendingProfileCard'

export default function HiveMap() {
  const [departments, setDepartments] = useState<Department[]>([])
  const [profiles, setProfiles] = useState<Profile[]>([])
  const [pending, setPending] = useState<PendingProfileDirectoryItem[]>([])
  const [selected, setSelected] = useState<Department | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    Promise.all([listDepartments(), listProfiles(), listPendingProfilesForDirectory()]).then(([d, p, pend]) => {
      setDepartments(d)
      setProfiles(p)
      setPending(pend)
      setLoading(false)
    })
  }, [])

  const pendingForDept = (slug: string) => pending.filter((p) => pendingDepartmentHintToSlug(p.department_hint) === slug)
  const countFor = (dept: Department) => profiles.filter((p) => p.department_id === dept.id).length + pendingForDept(dept.slug).length
  const membersOfSelected = selected ? profiles.filter((p) => p.department_id === selected.id) : []
  const pendingOfSelected = selected ? pendingForDept(selected.slug) : []

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl md:text-3xl font-extrabold">Mapa da colmeia</h1>
        <p className="text-beetz-dark/60 mt-1">Cada setor é um favo que sustenta a Beetz. Clique para conhecer o time.</p>
      </div>

      {loading ? (
        <p className="text-beetz-dark/50">Carregando...</p>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
          {departments.map((d) => (
            <button
              key={d.id}
              onClick={() => setSelected(d)}
              className={`text-left rounded-2xl p-5 border transition-all ${
                selected?.id === d.id
                  ? 'bg-beetz-dark text-white border-beetz-dark shadow-glow'
                  : 'bg-white border-beetz-dark/5 shadow-soft hover:shadow-glow'
              }`}
            >
              <div className="text-3xl mb-2">{d.icon}</div>
              <h3 className="font-bold">{d.name}</h3>
              <p className={`text-xs mt-1 ${selected?.id === d.id ? 'text-white/60' : 'text-beetz-dark/50'}`}>{d.description}</p>
              <p className={`text-xs font-semibold mt-3 ${selected?.id === d.id ? 'text-beetz-yellow' : 'text-beetz-dark/70'}`}>
                {countFor(d)} abelha(s)
              </p>
            </button>
          ))}
        </div>
      )}

      {selected && (
        <section className="space-y-6">
          <div>
            <h2 className="text-lg font-bold mb-4">{selected.icon} Time de {selected.name}</h2>
            {membersOfSelected.length === 0 ? (
              <p className="text-sm text-beetz-dark/50 bg-white rounded-2xl p-6 border border-beetz-dark/5">Ninguém cadastrado neste setor ainda.</p>
            ) : (
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                {membersOfSelected.map((p) => <ProfileCard key={p.id} profile={p} />)}
              </div>
            )}
          </div>

          {pendingOfSelected.length > 0 && (
            <div>
              <h3 className="font-bold mb-1">Pré-cadastro</h3>
              <p className="text-sm text-beetz-dark/50 mb-4">
                Já fazem parte da Beetz, mas ainda não criaram conta no app.
              </p>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                {pendingOfSelected.map((p) => <PendingProfileCard key={p.id} profile={p} />)}
              </div>
            </div>
          )}
        </section>
      )}
    </div>
  )
}
