import { useEffect, useState } from 'react'
import { Lock, Pencil, Search, Trash2 } from 'lucide-react'
import { adminDeleteProfile, getProducerAuthIds, listDepartments, listProfiles, updateProfileDepartment } from '../../lib/dataService'
import type { Department, Profile } from '../../lib/types'
import { ACCESS_ROLE_LABELS, computeAccessRole } from '../../lib/permissions'
import Avatar from '../ui/Avatar'
import EditProfileModal from './EditProfileModal'

// Lista de perfis com troca de departamento, edição e exclusão. Estava solto
// dentro do Admin.tsx; virou componente quando a página passou a ter abas.
export default function ProfilesSection() {
  const [profiles, setProfiles] = useState<Profile[]>([])
  const [departments, setDepartments] = useState<Department[]>([])
  const [loading, setLoading] = useState(true)
  const [savingId, setSavingId] = useState<string | null>(null)
  const [editingProfile, setEditingProfile] = useState<Profile | null>(null)
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null)
  const [deletingId, setDeletingId] = useState<string | null>(null)

  const [search, setSearch] = useState('')
  const [departmentFilter, setDepartmentFilter] = useState('')

  const [producerIds, setProducerIds] = useState<Set<string>>(new Set())

  async function load() {
    setLoading(true)
    const [p, d, prod] = await Promise.all([
      listProfiles(), listDepartments(),
      getProducerAuthIds().catch(() => new Set<string>())
    ])
    setProfiles(p)
    setDepartments(d)
    setProducerIds(prod)
    setLoading(false)
  }

  useEffect(() => { load() }, [])

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

  // Login do portal do produtor: tem ficha em Produtores e NÃO é colaborador —
  // não entra no "Sem departamento" (departamento = acesso interno da equipe).
  const ehProdutor = (p: Profile) => !p.department_id && producerIds.has(p.id)

  // 'sem' é sentinela: mostra quem AINDA não tem departamento — é essa turma
  // que precisa de ajuste, e antes ela não tinha filtro pra aparecer sozinha.
  const produtores = profiles.filter(ehProdutor).length
  const semDepartamento = profiles.filter((p) => !p.department_id && !producerIds.has(p.id)).length
  const filteredProfiles = profiles.filter((p) => {
    if (departmentFilter === 'sem') { if (p.department_id || ehProdutor(p)) return false }
    else if (departmentFilter === 'produtor') { if (!ehProdutor(p)) return false }
    else if (departmentFilter && p.department_id !== departmentFilter) return false
    if (search && !`${p.first_name} ${p.last_name}`.toLowerCase().includes(search.toLowerCase())) return false
    return true
  })

  return (
    <div>
      <h2 className="font-bold mb-1">Perfis e departamentos</h2>
      <p className="text-xs text-beetz-dark/50 mb-3 flex items-center gap-1.5">
        <Lock size={12} /> Contas da Diretoria aparecem travadas — departamento e exclusão delas só direto no banco, pra ninguém perder acesso por engano.
      </p>

      <div className="mb-4 space-y-3">
        <div className="relative max-w-sm">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-beetz-dark/40" />
          <input
            value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Buscar por nome"
            className="w-full pl-9 pr-3 py-2 rounded-xl border border-beetz-dark/15 text-sm focus:outline-none focus:ring-2 focus:ring-beetz-yellow"
          />
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            onClick={() => setDepartmentFilter('')}
            className={`text-sm font-semibold px-3.5 py-2 rounded-xl transition-colors ${
              departmentFilter === '' ? 'bg-beetz-dark text-white' : 'bg-beetz-gray text-beetz-dark/70 hover:bg-beetz-dark/10'
            }`}
          >
            Todas as funções
          </button>
          {departments.map((d) => (
            <button
              key={d.id}
              onClick={() => setDepartmentFilter(d.id)}
              className={`text-sm font-semibold px-3.5 py-2 rounded-xl transition-colors ${
                departmentFilter === d.id ? 'bg-beetz-dark text-white' : 'bg-beetz-gray text-beetz-dark/70 hover:bg-beetz-dark/10'
              }`}
            >
              {d.icon} {d.name}
            </button>
          ))}
          {semDepartamento > 0 && (
            <button
              onClick={() => setDepartmentFilter('sem')}
              title="Quem ainda não tem departamento definido — é essa turma que precisa de ajuste"
              className={`text-sm font-semibold px-3.5 py-2 rounded-xl transition-colors ${
                departmentFilter === 'sem'
                  ? 'bg-amber-500 text-white'
                  : 'bg-amber-50 text-amber-700 border border-amber-200 hover:bg-amber-100'
              }`}
            >
              ⚠️ Sem departamento ({semDepartamento})
            </button>
          )}
          {produtores > 0 && (
            <button
              onClick={() => setDepartmentFilter('produtor')}
              title="Logins do portal do produtor — têm ficha em Produtores e acessam produtor.beetz.bar. Não são colaboradores e não precisam de departamento."
              className={`text-sm font-semibold px-3.5 py-2 rounded-xl transition-colors ${
                departmentFilter === 'produtor'
                  ? 'bg-beetz-dark text-white'
                  : 'bg-beetz-yellow/25 text-beetz-dark border border-beetz-yellow/60 hover:bg-beetz-yellow/40'
              }`}
            >
              🤝 Produtores ({produtores})
            </button>
          )}
        </div>
        <p className="text-xs text-beetz-dark/40">{filteredProfiles.length} de {profiles.length} perfil(s)</p>
      </div>

      {loading ? (
        <p className="text-beetz-dark/50">Carregando...</p>
      ) : filteredProfiles.length === 0 ? (
        <p className="text-sm text-beetz-dark/50 bg-white rounded-2xl p-6 text-center border border-beetz-dark/5">Nenhum perfil encontrado com esses filtros.</p>
      ) : (
        <div className="bg-white rounded-2xl shadow-soft border border-beetz-dark/5 divide-y divide-beetz-dark/5">
          {filteredProfiles.map((p) => {
            const role = computeAccessRole(p, departments)
            const isDiretoria = role === 'diretoria'
            return (
              /* Mobile: dois andares por pessoa — identidade em cima,
                 controles numa fileira firme embaixo (o "Apagar" órfão
                 caindo sozinho pra 3ª linha era o caos do celular). */
              <div key={p.id} className="p-4 space-y-2.5 sm:space-y-0 sm:flex sm:flex-wrap sm:items-center sm:gap-3">
                <div className="flex items-center gap-3 min-w-0 sm:flex-1 sm:min-w-[200px]">
                  <Avatar src={p.avatar_url} name={`${p.first_name} ${p.last_name}`} size="sm" />
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-sm truncate">{p.first_name} {p.last_name}</p>
                    <p className="text-xs text-beetz-dark/50 truncate">{p.email}</p>
                  </div>
                  <span className="sm:hidden shrink-0 text-[10px] font-semibold bg-beetz-gray px-2 py-1 rounded-full">
                    {(ACCESS_ROLE_LABELS[role] ?? role).split(' (')[0]}
                  </span>
                </div>
                <span className="hidden sm:inline text-xs font-semibold bg-beetz-gray px-2.5 py-1 rounded-full">{ACCESS_ROLE_LABELS[role]}</span>
                <div className="flex items-center gap-2 sm:contents">
                {isDiretoria ? (
                  <div className="flex items-center gap-1.5 text-sm text-beetz-dark/50 border border-beetz-dark/10 bg-beetz-gray/50 rounded-xl px-3 py-2" title="Por segurança, o departamento de quem é Diretoria não pode ser trocado por aqui — evita perda acidental de acesso.">
                    <Lock size={13} />
                    <span>{departments.find((d) => d.id === p.department_id)?.icon} {departments.find((d) => d.id === p.department_id)?.name}</span>
                  </div>
                ) : ehProdutor(p) ? (
                  /* Produtor externo: o acesso dele é o portal do produtor — não
                     recebe departamento (departamento = acesso interno da equipe). */
                  <div
                    className="flex items-center gap-1.5 text-sm font-semibold text-beetz-dark border border-beetz-yellow/60 bg-beetz-yellow/15 rounded-xl px-3 py-2"
                    title="Login do portal do produtor (produtor.beetz.bar) — tem ficha na página Produtores. Não dê departamento: departamento é o que dá acesso interno da equipe."
                  >
                    🤝 <span>Produtor externo · portal</span>
                  </div>
                ) : (
                  <select
                    value={p.department_id || ''}
                    disabled={savingId === p.id}
                    onChange={(e) => handleChangeDepartment(p.id, e.target.value)}
                    className="flex-1 min-w-0 sm:flex-none text-sm border border-beetz-dark/15 rounded-xl px-3 py-2 disabled:opacity-50 bg-white"
                  >
                    <option value="" disabled>Selecionar departamento...</option>
                    {departments.map((d) => <option key={d.id} value={d.id}>{d.icon} {d.name}</option>)}
                  </select>
                )}

                <button
                  onClick={() => setEditingProfile(p)}
                  className="shrink-0 flex items-center gap-1.5 text-xs font-semibold text-beetz-dark/70 border border-beetz-dark/15 px-3 py-2 rounded-xl hover:bg-beetz-gray transition-colors"
                >
                  <Pencil size={13} /><span className="hidden sm:inline"> Editar</span>
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
                      className="shrink-0 flex items-center gap-1.5 text-xs font-semibold text-red-600 border border-red-100 bg-red-50 px-3 py-2 rounded-xl hover:bg-red-100 transition-colors"
                    >
                      <Trash2 size={13} /><span className="hidden sm:inline"> Apagar</span>
                    </button>
                  )
                )}
                </div>
              </div>
            )
          })}
        </div>
      )}

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
