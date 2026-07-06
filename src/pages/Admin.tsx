import { useEffect, useState } from 'react'
import { useAuth } from '../contexts/AuthContext'
import {
  listDepartments, listPendingProfiles, listProfiles, setProfileApproval, updateProfileDepartment
} from '../lib/dataService'
import type { Department, Profile } from '../lib/types'
import { ACCESS_ROLE_LABELS, canApproveUsers, canManageUsers, computeAccessRole } from '../lib/permissions'
import Avatar from '../components/ui/Avatar'
import { Check, Lock, X } from 'lucide-react'

export default function Admin() {
  const { accessRole } = useAuth()
  const [profiles, setProfiles] = useState<Profile[]>([])
  const [pending, setPending] = useState<Profile[]>([])
  const [departments, setDepartments] = useState<Department[]>([])
  const [loading, setLoading] = useState(true)
  const [savingId, setSavingId] = useState<string | null>(null)

  async function load() {
    setLoading(true)
    const [p, d, pend] = await Promise.all([listProfiles(), listDepartments(), listPendingProfiles()])
    setProfiles(p)
    setDepartments(d)
    setPending(pend)
    setLoading(false)
  }

  useEffect(() => { load() }, [])

  if (!canManageUsers(accessRole) && !canApproveUsers(accessRole)) {
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
    // Trava de segurança: mesmo que algo tente disparar essa função pra um
    // perfil da Diretoria (ex: um bug de UI), a troca é bloqueada aqui também.
    // A edição de departamento da Diretoria só pode ser feita direto no banco,
    // pra evitar que alguém perca o próprio acesso (ou o de outro diretor) por engano.
    const target = profiles.find((p) => p.id === profileId)
    if (target && computeAccessRole(target, departments) === 'diretoria') return
    setSavingId(profileId)
    await updateProfileDepartment(profileId, departmentId)
    await load()
    setSavingId(null)
  }

  async function handleApproval(profileId: string, status: 'Aprovado' | 'Rejeitado') {
    setSavingId(profileId)
    await setProfileApproval(profileId, status)
    await load()
    setSavingId(null)
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl md:text-3xl font-extrabold">Administração</h1>
        <p className="text-beetz-dark/60 mt-1">Aprove novos cadastros e gerencie o departamento de cada colaborador.</p>
      </div>

      {canApproveUsers(accessRole) && (
        <div>
          <h2 className="font-bold mb-3">Aprovações pendentes {pending.length > 0 && `(${pending.length})`}</h2>
          {loading ? (
            <p className="text-sm text-beetz-dark/50">Carregando...</p>
          ) : pending.length === 0 ? (
            <div className="bg-white rounded-2xl shadow-soft border border-beetz-dark/5 p-5">
              <p className="text-sm text-beetz-dark/50">Nenhum cadastro esperando aprovação.</p>
            </div>
          ) : (
            <div className="bg-white rounded-2xl shadow-soft border border-beetz-dark/5 divide-y divide-beetz-dark/5">
              {pending.map((p) => (
                <div key={p.id} className="flex flex-wrap items-center gap-3 p-4">
                  <Avatar src={p.avatar_url} name={`${p.first_name} ${p.last_name}`} size="sm" />
                  <div className="flex-1 min-w-[160px]">
                    <p className="font-semibold text-sm">{p.first_name} {p.last_name}</p>
                    <p className="text-xs text-beetz-dark/50">{p.email}</p>
                  </div>
                  <button
                    onClick={() => handleApproval(p.id, 'Aprovado')}
                    disabled={savingId === p.id}
                    className="flex items-center gap-1.5 text-sm font-semibold bg-green-600 text-white px-3 py-2 rounded-xl hover:bg-green-700 transition-colors disabled:opacity-50"
                  >
                    <Check size={15} /> Aprovar
                  </button>
                  <button
                    onClick={() => handleApproval(p.id, 'Rejeitado')}
                    disabled={savingId === p.id}
                    className="flex items-center gap-1.5 text-sm font-semibold bg-red-50 text-red-600 px-3 py-2 rounded-xl hover:bg-red-100 transition-colors disabled:opacity-50"
                  >
                    <X size={15} /> Rejeitar
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {canManageUsers(accessRole) && (
        <div>
          <h2 className="font-bold mb-1">Departamentos e perfis de acesso</h2>
          <p className="text-xs text-beetz-dark/50 mb-3 flex items-center gap-1.5">
            <Lock size={12} /> Contas da Diretoria aparecem travadas — o departamento delas só pode ser alterado direto no banco, pra ninguém perder acesso por engano.
          </p>
          {loading ? (
            <p className="text-beetz-dark/50">Carregando...</p>
          ) : (
            <div className="bg-white rounded-2xl shadow-soft border border-beetz-dark/5 divide-y divide-beetz-dark/5">
              {profiles.map((p) => {
                const role = computeAccessRole(p, departments)
                const isDiretoria = role === 'diretoria'
                return (
                  <div key={p.id} className="flex flex-wrap items-center gap-3 p-4">
                    <Avatar src={p.avatar_url} name={`${p.first_name} ${p.last_name}`} size="sm" />
                    <div className="flex-1 min-w-[160px]">
                      <p className="font-semibold text-sm">{p.first_name} {p.last_name}</p>
                      <p className="text-xs text-beetz-dark/50">{p.email}</p>
                    </div>
                    <span className="text-xs font-semibold bg-beetz-gray px-2.5 py-1 rounded-full">{ACCESS_ROLE_LABELS[role]}</span>
                    {isDiretoria ? (
                      <div className="flex items-center gap-1.5 text-sm text-beetz-dark/50 border border-beetz-dark/10 bg-beetz-gray/50 rounded-xl px-3 py-2" title="Por segurança, o departamento de quem é Diretoria não pode ser trocado por aqui — evita perda acidental de acesso.">
                        <Lock size={13} />
                        <span>{departments.find((d) => d.id === p.department_id)?.icon} {departments.find((d) => d.id === p.department_id)?.name}</span>
                      </div>
                    ) : (
                      <select
                        value={p.department_id || ''}
                        disabled={savingId === p.id}
                        onChange={(e) => handleChangeDepartment(p.id, e.target.value)}
                        className="text-sm border border-beetz-dark/15 rounded-xl px-3 py-2 disabled:opacity-50"
                      >
                        <option value="" disabled>Selecionar departamento...</option>
                        {departments.map((d) => <option key={d.id} value={d.id}>{d.icon} {d.name}</option>)}
                      </select>
                    )}
                  </div>
                )
              })}
              {profiles.length === 0 && <p className="text-sm text-beetz-dark/50 p-4">Nenhum colaborador aprovado ainda.</p>}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
