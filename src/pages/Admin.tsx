import { useState, useEffect } from 'react'
import { useAuth } from '../contexts/AuthContext'
import {
  adminDeleteProfile, inviteTeamMember, listDepartments, listProfiles, updateProfileDepartment
} from '../lib/dataService'
import type { Department, Profile } from '../lib/types'
import { ACCESS_ROLE_LABELS, canManageUsers, computeAccessRole } from '../lib/permissions'
import Avatar from '../components/ui/Avatar'
import EditProfileModal from '../components/admin/EditProfileModal'
import { Lock, Pencil, Trash2, UserPlus } from 'lucide-react'

const DEPARTMENT_HINTS = ['Garçons', 'Caixas', 'Operacional']

export default function Admin() {
  const { accessRole } = useAuth()
  const [profiles, setProfiles] = useState<Profile[]>([])
  const [departments, setDepartments] = useState<Department[]>([])
  const [loading, setLoading] = useState(true)
  const [savingId, setSavingId] = useState<string | null>(null)
  const [editingProfile, setEditingProfile] = useState<Profile | null>(null)
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null)
  const [deletingId, setDeletingId] = useState<string | null>(null)

  const [inviteForm, setInviteForm] = useState({ email: '', first_name: '', last_name: '', role_hint: '', department_hint: '' })
  const [inviting, setInviting] = useState(false)
  const [inviteFeedback, setInviteFeedback] = useState<string | null>(null)
  const [inviteError, setInviteError] = useState<string | null>(null)

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

  async function handleDelete(profileId: string) {
    setDeletingId(profileId)
    try {
      await adminDeleteProfile(profileId)
      setConfirmDeleteId(null)
      await load()
    } catch (err: any) {
      alert(err?.message ?? 'Erro ao apagar perfil.')
    } finally {
      setDeletingId(null)
    }
  }

  async function handleInvite() {
    if (!inviteForm.email.trim()) return
    setInviting(true)
    setInviteError(null)
    setInviteFeedback(null)
    try {
      await inviteTeamMember(inviteForm)
      setInviteFeedback(`${inviteForm.first_name || inviteForm.email} já aparece como pré-cadastro na comunidade.`)
      setInviteForm({ email: '', first_name: '', last_name: '', role_hint: '', department_hint: '' })
    } catch (err: any) {
      setInviteError(err?.message ?? 'Erro ao convidar.')
    } finally {
      setInviting(false)
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl md:text-3xl font-extrabold">Administração</h1>
        <p className="text-beetz-dark/60 mt-1">Gerencie o time: convide gente nova, edite perfis e ajuste departamentos.</p>
      </div>

      <div>
        <h2 className="font-bold mb-3 flex items-center gap-2"><UserPlus size={18} /> Convidar para o time</h2>
        <div className="bg-white rounded-2xl shadow-soft border border-beetz-dark/5 p-5 space-y-3">
          <p className="text-xs text-beetz-dark/50">
            Isso cria um pré-cadastro. Não envia e-mail nenhum — quando a pessoa entrar no app com o Google
            usando esse mesmo endereço, o perfil dela já nasce preenchido e liberado na comunidade.
          </p>
          <div className="grid sm:grid-cols-2 gap-3">
            <input
              placeholder="E-mail *" type="email" value={inviteForm.email}
              onChange={(e) => setInviteForm((f) => ({ ...f, email: e.target.value }))}
              className="rounded-xl border border-beetz-dark/15 text-sm px-3 py-2"
            />
            <div className="grid grid-cols-2 gap-3">
              <input
                placeholder="Nome" value={inviteForm.first_name}
                onChange={(e) => setInviteForm((f) => ({ ...f, first_name: e.target.value }))}
                className="rounded-xl border border-beetz-dark/15 text-sm px-3 py-2"
              />
              <input
                placeholder="Sobrenome" value={inviteForm.last_name}
                onChange={(e) => setInviteForm((f) => ({ ...f, last_name: e.target.value }))}
                className="rounded-xl border border-beetz-dark/15 text-sm px-3 py-2"
              />
            </div>
            <input
              placeholder="Função (ex: Garçom, Bar...)" value={inviteForm.role_hint}
              onChange={(e) => setInviteForm((f) => ({ ...f, role_hint: e.target.value }))}
              className="rounded-xl border border-beetz-dark/15 text-sm px-3 py-2"
            />
            <select
              value={inviteForm.department_hint}
              onChange={(e) => setInviteForm((f) => ({ ...f, department_hint: e.target.value }))}
              className="rounded-xl border border-beetz-dark/15 text-sm px-3 py-2"
            >
              <option value="">Departamento não definido</option>
              {DEPARTMENT_HINTS.map((h) => <option key={h} value={h}>{h}</option>)}
            </select>
          </div>
          {inviteError && <p className="text-sm text-red-600">{inviteError}</p>}
          {inviteFeedback && <p className="text-sm text-green-700">{inviteFeedback}</p>}
          <button
            onClick={handleInvite}
            disabled={inviting || !inviteForm.email.trim()}
            className="honey-gradient text-beetz-dark font-bold px-4 py-2 rounded-xl text-sm disabled:opacity-60"
          >
            {inviting ? 'Convidando...' : 'Convidar'}
          </button>
        </div>
      </div>

      <div>
        <h2 className="font-bold mb-1">Perfis e departamentos</h2>
        <p className="text-xs text-beetz-dark/50 mb-3 flex items-center gap-1.5">
          <Lock size={12} /> Contas da Diretoria aparecem travadas — departamento e exclusão delas só direto no banco, pra ninguém perder acesso por engano.
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

                  <button
                    onClick={() => setEditingProfile(p)}
                    className="flex items-center gap-1.5 text-xs font-semibold text-beetz-dark/70 border border-beetz-dark/15 px-3 py-2 rounded-xl hover:bg-beetz-gray transition-colors"
                  >
                    <Pencil size={13} /> Editar
                  </button>

                  {!isDiretoria && (
                    confirmDeleteId === p.id ? (
                      <div className="flex items-center gap-1.5">
                        <button
                          onClick={() => handleDelete(p.id)}
                          disabled={deletingId === p.id}
                          className="text-xs font-semibold bg-red-600 text-white px-3 py-2 rounded-xl hover:bg-red-700 disabled:opacity-60"
                        >
                          {deletingId === p.id ? 'Apagando...' : 'Confirmar'}
                        </button>
                        <button
                          onClick={() => setConfirmDeleteId(null)}
                          className="text-xs font-semibold text-beetz-dark/50 px-3 py-2 rounded-xl hover:bg-beetz-gray"
                        >
                          Cancelar
                        </button>
                      </div>
                    ) : (
                      <button
                        onClick={() => setConfirmDeleteId(p.id)}
                        className="flex items-center gap-1.5 text-xs font-semibold text-red-600 border border-red-100 bg-red-50 px-3 py-2 rounded-xl hover:bg-red-100 transition-colors"
                      >
                        <Trash2 size={13} /> Apagar
                      </button>
                    )
                  )}
                </div>
              )
            })}
            {profiles.length === 0 && <p className="text-sm text-beetz-dark/50 p-4">Nenhum colaborador cadastrado ainda.</p>}
          </div>
        )}
      </div>

      {editingProfile && (
        <EditProfileModal
          profile={editingProfile}
          onClose={() => setEditingProfile(null)}
          onSaved={load}
        />
      )}
    </div>
  )
}
