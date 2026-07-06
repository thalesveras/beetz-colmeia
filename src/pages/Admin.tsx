import { useEffect, useState } from 'react'
import { useAuth } from '../contexts/AuthContext'
import { listDepartments, listProfiles, updateProfileDepartment } from '../lib/dataService'
import type { Department, Profile } from '../lib/types'
import { ACCESS_ROLE_LABELS, canManageUsers, computeAccessRole } from '../lib/permissions'
import Avatar from '../components/ui/Avatar'

export default function Admin() {
  const { accessRole } = useAuth()
  const [profiles, setProfiles] = useState<Profile[]>([])
  const [departments, setDepartments] = useState<Department[]>([])
  const [loading, setLoading] = useState(true)
  const [savingId, setSavingId] = useState<string | null>(null)

  async function load() {
    setLoading(true)
    const [p, d] = await Promise.all([listProfiles(), listDepartments()])
    setProfiles(p)
    setDepartments(d)
    setLoading(false)
  }

  useEffect(() => { load() }, [])

  if (!canManageUsers(accessRole)) {
    return (
      <div className="bg-white rounded-2xl p-8 shadow-soft border border-beetz-dark/5 text-center">
        <p className="text-4xl mb-3">🔒</p>
        <h1 className="text-xl font-bold mb-1">Acesso restrito</h1>
        <p className="text-sm text-beetz-dark/60">Essa área é exclusiva para a Diretoria.</p>
      </div>
    )
  }

  async function handleChangeDepartment(profileId: string, departmentId: string) {
    if (!departmentId) return
    setSavingId(profileId)
    await updateProfileDepartment(profileId, departmentId)
    await load()
    setSavingId(null)
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl md:text-3xl font-extrabold">Administração</h1>
        <p className="text-beetz-dark/60 mt-1">Gerencie o departamento (e o papel de acesso) de cada colaborador.</p>
      </div>

      {loading ? (
        <p className="text-beetz-dark/50">Carregando...</p>
      ) : (
        <div className="bg-white rounded-2xl shadow-soft border border-beetz-dark/5 divide-y divide-beetz-dark/5">
          {profiles.map((p) => {
            const role = computeAccessRole(p, departments)
            return (
              <div key={p.id} className="flex flex-wrap items-center gap-3 p-4">
                <Avatar src={p.avatar_url} name={`${p.first_name} ${p.last_name}`} size="sm" />
                <div className="flex-1 min-w-[160px]">
                  <p className="font-semibold text-sm">{p.first_name} {p.last_name}</p>
                  <p className="text-xs text-beetz-dark/50">{p.email}</p>
                </div>
                <span className="text-xs font-semibold bg-beetz-gray px-2.5 py-1 rounded-full">{ACCESS_ROLE_LABELS[role]}</span>
                <select
                  value={p.department_id || ''}
                  disabled={savingId === p.id}
                  onChange={(e) => handleChangeDepartment(p.id, e.target.value)}
                  className="text-sm border border-beetz-dark/15 rounded-xl px-3 py-2 disabled:opacity-50"
                >
                  <option value="" disabled>Selecionar departamento...</option>
                  {departments.map((d) => <option key={d.id} value={d.id}>{d.icon} {d.name}</option>)}
                </select>
              </div>
            )
          })}
          {profiles.length === 0 && <p className="text-sm text-beetz-dark/50 p-4">Nenhum colaborador cadastrado ainda.</p>}
        </div>
      )}
    </div>
  )
}
