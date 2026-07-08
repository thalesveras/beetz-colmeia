import { useEffect, useState } from 'react'
import { Pencil } from 'lucide-react'
import { listDepartments, listPendingProfilesForDirectory, listProfiles, pendingDepartmentHintToSlug, updateDepartmentDetails } from '../lib/dataService'
import { useAuth } from '../contexts/AuthContext'
import { canEditHiveMap, canViewPendingProfileDetails } from '../lib/permissions'
import type { Department, PendingProfileDirectoryItem, Profile } from '../lib/types'
import ProfileCard from '../components/ui/ProfileCard'
import PendingProfileCard from '../components/ui/PendingProfileCard'
import PendingProfileModal from '../components/ui/PendingProfileModal'

export default function HiveMap() {
  const { accessRole } = useAuth()
  const canViewDetails = canViewPendingProfileDetails(accessRole)
  const canEditMap = canEditHiveMap(accessRole)
  const [departments, setDepartments] = useState<Department[]>([])
  const [profiles, setProfiles] = useState<Profile[]>([])
  const [pending, setPending] = useState<PendingProfileDirectoryItem[]>([])
  const [selected, setSelected] = useState<Department | null>(null)
  const [loading, setLoading] = useState(true)
  const [viewingPending, setViewingPending] = useState<PendingProfileDirectoryItem | null>(null)
  const [editingDept, setEditingDept] = useState<Department | null>(null)

  function load() {
    return Promise.all([listDepartments(), listProfiles(), listPendingProfilesForDirectory()]).then(([d, p, pend]) => {
      setDepartments(d)
      setProfiles(p)
      setPending(pend)
      setLoading(false)
      // Mantém o card selecionado em sincronia depois de salvar uma edição.
      setSelected((sel) => (sel ? d.find((x) => x.id === sel.id) ?? sel : sel))
    })
  }

  useEffect(() => { load() }, [])

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
            <div className="flex items-center gap-2 mb-4">
              <h2 className="text-lg font-bold">{selected.icon} Time de {selected.name}</h2>
              {canEditMap && (
                <button
                  onClick={() => setEditingDept(selected)}
                  className="flex items-center gap-1 text-xs font-semibold text-beetz-dark/50 hover:text-beetz-dark px-2 py-1 rounded-lg hover:bg-beetz-gray"
                >
                  <Pencil size={12} /> Editar
                </button>
              )}
            </div>
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
                {pendingOfSelected.map((p) => (
                  <PendingProfileCard key={p.id} profile={p} onClick={canViewDetails ? () => setViewingPending(p) : undefined} />
                ))}
              </div>
            </div>
          )}
        </section>
      )}

      {canViewDetails && viewingPending && (
        <PendingProfileModal
          profile={viewingPending}
          departmentName={departments.find((d) => d.slug === pendingDepartmentHintToSlug(viewingPending.department_hint))?.name}
          onClose={() => setViewingPending(null)}
        />
      )}

      {editingDept && (
        <EditDepartmentModal
          department={editingDept}
          onClose={() => setEditingDept(null)}
          onSaved={load}
        />
      )}
    </div>
  )
}

// Edita nome, ícone e descrição de um departamento — não mexe no perfil de
// acesso (isso continua exclusivo de /configuracoes, só pra Diretoria).
function EditDepartmentModal({ department, onClose, onSaved }: { department: Department; onClose: () => void; onSaved: () => void }) {
  const [name, setName] = useState(department.name)
  const [icon, setIcon] = useState(department.icon)
  const [description, setDescription] = useState(department.description)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSave() {
    setSaving(true)
    setError(null)
    try {
      await updateDepartmentDetails(department.id, { name: name.trim(), icon: icon.trim(), description: description.trim() })
      await onSaved()
      onClose()
    } catch (err: any) {
      setError(err?.message ?? 'Erro ao salvar.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl w-full max-w-md shadow-glow p-5" onClick={(e) => e.stopPropagation()}>
        <h2 className="font-bold text-lg mb-4">Editar departamento</h2>
        {error && <div className="bg-red-50 border border-red-100 text-red-700 text-sm rounded-xl p-3 mb-3">{error}</div>}
        <div className="space-y-3">
          <div className="flex gap-3">
            <div className="w-20">
              <label className="text-xs font-medium block mb-1 text-beetz-dark/70">Ícone</label>
              <input className="w-full border border-beetz-dark/15 rounded-xl px-3 py-2 text-sm text-center" value={icon} onChange={(e) => setIcon(e.target.value)} />
            </div>
            <div className="flex-1">
              <label className="text-xs font-medium block mb-1 text-beetz-dark/70">Nome</label>
              <input className="w-full border border-beetz-dark/15 rounded-xl px-3 py-2 text-sm" value={name} onChange={(e) => setName(e.target.value)} />
            </div>
          </div>
          <div>
            <label className="text-xs font-medium block mb-1 text-beetz-dark/70">Descrição</label>
            <textarea className="w-full border border-beetz-dark/15 rounded-xl px-3 py-2 text-sm" rows={2} value={description} onChange={(e) => setDescription(e.target.value)} />
          </div>
        </div>
        <div className="flex justify-end gap-2 mt-5">
          <button onClick={onClose} className="px-4 py-2 rounded-xl text-sm font-semibold text-beetz-dark/60 hover:bg-beetz-gray">Cancelar</button>
          <button
            onClick={handleSave}
            disabled={saving || !name.trim()}
            className="honey-gradient text-beetz-dark font-bold px-5 py-2 rounded-xl text-sm disabled:opacity-60"
          >
            {saving ? 'Salvando...' : 'Salvar'}
          </button>
        </div>
      </div>
    </div>
  )
}
