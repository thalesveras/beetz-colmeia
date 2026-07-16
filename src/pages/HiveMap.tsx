import { useEffect, useMemo, useState } from 'react'
import { ChevronLeft, ChevronRight, Pencil, Search } from 'lucide-react'
import { listDepartments, listPendingProfilesForDirectory, listProfiles, pendingDepartmentHintToSlug, updateDepartmentDetails } from '../lib/dataService'
import { useAuth } from '../contexts/AuthContext'
import { canEditHiveMap, canViewHiveMap, canViewPendingProfileDetails } from '../lib/permissions'
import type { Department, PendingProfileDirectoryItem, Profile } from '../lib/types'
import ProfileCard from '../components/ui/ProfileCard'
import PendingProfileCard from '../components/ui/PendingProfileCard'
import PendingProfileModal from '../components/ui/PendingProfileModal'

// Setor grande tem centenas de pessoas (Caixas passa de 600), então listar
// tudo de uma vez trava a tela e ninguém acha ninguém. Mesmo tamanho de página
// e mesma paginação da Turma, pra as duas telas se comportarem igual.
const PAGE_SIZE = 24

// Mostra primeira, última, atual e vizinhas — o resto vira reticências.
function getPageNumbers(current: number, total: number): (number | 'ellipsis')[] {
  if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1)
  const pages: (number | 'ellipsis')[] = [1]
  if (current > 3) pages.push('ellipsis')
  for (let i = Math.max(2, current - 1); i <= Math.min(total - 1, current + 1); i++) pages.push(i)
  if (current < total - 2) pages.push('ellipsis')
  pages.push(total)
  return pages
}

function normalize(s: string) {
  return s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
}

interface PagerProps {
  page: number
  totalPages: number
  onChange: (p: number) => void
}

function Pager({ page, totalPages, onChange }: PagerProps) {
  if (totalPages <= 1) return null
  return (
    <div className="flex items-center justify-center gap-1 mt-4">
      <button
        onClick={() => onChange(Math.max(1, page - 1))}
        disabled={page === 1}
        className="p-2 rounded-lg hover:bg-beetz-gray disabled:opacity-30 disabled:hover:bg-transparent"
        aria-label="Página anterior"
      >
        <ChevronLeft size={15} />
      </button>
      {getPageNumbers(page, totalPages).map((p, i) =>
        p === 'ellipsis' ? (
          <span key={`e${i}`} className="px-1.5 text-beetz-dark/30 text-sm">…</span>
        ) : (
          <button
            key={p}
            onClick={() => onChange(p)}
            className={`min-w-[32px] h-8 px-2 rounded-lg text-sm font-semibold transition-colors ${
              p === page ? 'bg-beetz-dark text-white' : 'text-beetz-dark/60 hover:bg-beetz-gray'
            }`}
          >
            {p}
          </button>
        )
      )}
      <button
        onClick={() => onChange(Math.min(totalPages, page + 1))}
        disabled={page === totalPages}
        className="p-2 rounded-lg hover:bg-beetz-gray disabled:opacity-30 disabled:hover:bg-transparent"
        aria-label="Próxima página"
      >
        <ChevronRight size={15} />
      </button>
    </div>
  )
}

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
  // Uma página por lista: as duas convivem na mesma tela e navegar numa não
  // pode mexer na outra.
  const [memberPage, setMemberPage] = useState(1)
  const [pendingPage, setPendingPage] = useState(1)
  const [search, setSearch] = useState('')

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

  const q = normalize(search.trim())
  const matches = (first: string | null, last: string | null) =>
    !q || normalize(`${first ?? ''} ${last ?? ''}`).includes(q)

  const membersOfSelected = useMemo(
    () => (selected ? profiles.filter((p) => p.department_id === selected.id && matches(p.first_name, p.last_name)) : []),
    [selected, profiles, q]
  )
  const pendingOfSelected = useMemo(
    () => (selected
      ? pending.filter((p) => pendingDepartmentHintToSlug(p.department_hint) === selected.slug && matches(p.first_name, p.last_name))
      : []),
    [selected, pending, q]
  )

  const memberTotalPages = Math.max(1, Math.ceil(membersOfSelected.length / PAGE_SIZE))
  const pendingTotalPages = Math.max(1, Math.ceil(pendingOfSelected.length / PAGE_SIZE))
  // Clamp: se o filtro encolher a lista, a página atual pode não existir mais.
  const memberPageSafe = Math.min(memberPage, memberTotalPages)
  const pendingPageSafe = Math.min(pendingPage, pendingTotalPages)
  const memberPageItems = membersOfSelected.slice((memberPageSafe - 1) * PAGE_SIZE, memberPageSafe * PAGE_SIZE)
  const pendingPageItems = pendingOfSelected.slice((pendingPageSafe - 1) * PAGE_SIZE, pendingPageSafe * PAGE_SIZE)

  // Trocar de setor ou buscar sempre volta pro começo — senão você cai na
  // página 12 de um setor que só tem 3.
  useEffect(() => { setMemberPage(1); setPendingPage(1) }, [selected?.id, search])

  if (!canViewHiveMap(accessRole)) {
    return (
      <div className="bg-white rounded-2xl p-8 shadow-soft border border-beetz-dark/5 text-center">
        <p className="text-4xl mb-3">🔒</p>
        <h1 className="text-xl font-bold mb-1">Acesso restrito</h1>
        <p className="text-sm text-beetz-dark/60">Seu perfil de acesso não tem permissão pra ver o Mapa da Colmeia.</p>
      </div>
    )
  }

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
            <div className="flex flex-wrap items-center gap-2 mb-4">
              <h2 className="text-lg font-bold">{selected.icon} Time de {selected.name}</h2>
              {canEditMap && (
                <button
                  onClick={() => setEditingDept(selected)}
                  className="flex items-center gap-1 text-xs font-semibold text-beetz-dark/50 hover:text-beetz-dark px-2 py-1 rounded-lg hover:bg-beetz-gray"
                >
                  <Pencil size={12} /> Editar
                </button>
              )}
              {/* Num setor de 600 pessoas, folhear página por página não acha
                  ninguém — a busca é o que torna a paginação usável. */}
              <div className="relative ml-auto w-full sm:w-64">
                <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-beetz-dark/30" />
                <input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder={`Buscar em ${selected.name}`}
                  className="w-full pl-9 pr-3 py-2 rounded-xl border border-beetz-dark/15 text-sm focus:outline-none focus:ring-2 focus:ring-beetz-yellow"
                />
              </div>
            </div>

            {membersOfSelected.length === 0 ? (
              <p className="text-sm text-beetz-dark/50 bg-white rounded-2xl p-6 border border-beetz-dark/5">
                {search.trim() ? 'Ninguém com esse nome neste setor.' : 'Ninguém cadastrado neste setor ainda.'}
              </p>
            ) : (
              <>
                <p className="text-xs text-beetz-dark/40 mb-3">
                  {membersOfSelected.length} cadastrado(s)
                  {memberTotalPages > 1 && ` · página ${memberPageSafe} de ${memberTotalPages}`}
                </p>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  {memberPageItems.map((p) => <ProfileCard key={p.id} profile={p} />)}
                </div>
                <Pager page={memberPageSafe} totalPages={memberTotalPages} onChange={setMemberPage} />
              </>
            )}
          </div>

          {pendingOfSelected.length > 0 && (
            <div>
              <h3 className="font-bold mb-1">Pré-cadastro</h3>
              <p className="text-sm text-beetz-dark/50 mb-1">
                Já fazem parte da Beetz, mas ainda não criaram conta no app.
              </p>
              <p className="text-xs text-beetz-dark/40 mb-3">
                {pendingOfSelected.length} pessoa(s)
                {pendingTotalPages > 1 && ` · página ${pendingPageSafe} de ${pendingTotalPages}`}
              </p>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                {pendingPageItems.map((p) => (
                  <PendingProfileCard key={p.id} profile={p} onClick={canViewDetails ? () => setViewingPending(p) : undefined} />
                ))}
              </div>
              <Pager page={pendingPageSafe} totalPages={pendingTotalPages} onChange={setPendingPage} />
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
