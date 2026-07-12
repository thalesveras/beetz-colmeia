import { useEffect, useState } from 'react'
import { ExternalLink, Link2, Pencil, Trash2, X, Check, Rocket } from 'lucide-react'
import { useAuth } from '../../contexts/AuthContext'
import { createLinkRedirect, deleteLinkRedirect, deployRedirectWorker, listLinkRedirects, updateLinkRedirect } from '../../lib/dataService'
import type { LinkRedirect } from '../../lib/types'

const inputClass = 'rounded-xl border border-beetz-dark/15 text-sm px-3 py-2 focus:outline-none focus:ring-2 focus:ring-beetz-yellow'

// Redirecionadores do site público beetz.bar (ex: /cardapio -> um link
// externo). Isso aqui só cadastra a regra no banco — quem de fato redireciona
// é um Cloudflare Worker publicado na frente do beetz.bar (o domínio hoje é
// WordPress, então o redirecionamento precisa acontecer na borda do
// Cloudflare, antes de chegar no site). O Worker consulta essa tabela em
// tempo real a cada visita. Uma vez publicado (botão "Publicar mecanismo"
// abaixo — só precisa uma vez, ou de novo se o mecanismo mudar), qualquer
// regra criada/editada/apagada aqui já vale na hora.
export default function RedirectsSection() {
  const { userId } = useAuth()
  const [redirects, setRedirects] = useState<LinkRedirect[]>([])
  const [loading, setLoading] = useState(true)

  const [newPath, setNewPath] = useState('')
  const [newDestination, setNewDestination] = useState('')
  const [newNotes, setNewNotes] = useState('')
  const [saving, setSaving] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)

  const [editingId, setEditingId] = useState<string | null>(null)
  const [editPath, setEditPath] = useState('')
  const [editDestination, setEditDestination] = useState('')
  const [editNotes, setEditNotes] = useState('')

  const [deploying, setDeploying] = useState(false)
  const [deployResult, setDeployResult] = useState<string | null>(null)
  const [deployError, setDeployError] = useState<string | null>(null)

  async function load() {
    setLoading(true)
    setRedirects(await listLinkRedirects())
    setLoading(false)
  }

  useEffect(() => { load() }, [])

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault()
    if (!newPath.trim() || !newDestination.trim()) return
    setSaving(true)
    setFormError(null)
    try {
      await createLinkRedirect({ path: newPath, destination_url: newDestination.trim(), notes: newNotes.trim() || null, created_by: userId ?? null })
      setNewPath(''); setNewDestination(''); setNewNotes('')
      load()
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Erro ao criar redirecionador (o caminho já pode estar em uso).')
    } finally {
      setSaving(false)
    }
  }

  function startEdit(r: LinkRedirect) {
    setEditingId(r.id); setEditPath(r.path); setEditDestination(r.destination_url); setEditNotes(r.notes ?? '')
  }

  async function saveEdit(id: string) {
    if (!editPath.trim() || !editDestination.trim()) return
    await updateLinkRedirect(id, { path: editPath, destination_url: editDestination.trim(), notes: editNotes.trim() || null })
    setEditingId(null)
    load()
  }

  async function toggleActive(r: LinkRedirect) {
    await updateLinkRedirect(r.id, { is_active: !r.is_active })
    load()
  }

  async function handleDelete(id: string) {
    await deleteLinkRedirect(id)
    load()
  }

  async function handleDeployWorker() {
    setDeploying(true)
    setDeployResult(null)
    setDeployError(null)
    try {
      const result = await deployRedirectWorker()
      setDeployResult(
        result.route_action === 'updated'
          ? 'Mecanismo atualizado no Cloudflare. Os redirecionadores já valem na hora.'
          : 'Mecanismo publicado no Cloudflare. Os redirecionadores já valem na hora.'
      )
    } catch (err) {
      setDeployError(err instanceof Error ? err.message : 'Erro ao publicar o mecanismo no Cloudflare.')
    } finally {
      setDeploying(false)
    }
  }

  return (
    <div>
      <h2 className="font-bold mb-1 flex items-center gap-2"><Link2 size={18} /> Redirecionadores (beetz.bar)</h2>
      <p className="text-xs text-beetz-dark/50 mb-3">
        Ex: <code className="bg-beetz-gray px-1.5 py-0.5 rounded">/cardapio</code> → um link do iFood, WhatsApp, formulário etc.
        Vale na hora, sem precisar reimplantar nada — desde que o mecanismo abaixo já tenha sido publicado uma vez.
      </p>

      <div className="bg-beetz-dark text-white rounded-2xl p-4 mb-4 flex flex-wrap items-center gap-3">
        <Rocket size={18} className="text-beetz-yellow shrink-0" />
        <div className="flex-1 min-w-[220px]">
          <p className="text-sm font-semibold">Mecanismo de redirecionamento (Cloudflare Worker)</p>
          <p className="text-xs text-white/50">
            beetz.bar é WordPress — precisa desse Worker na borda do Cloudflare pra interceptar as rotas. Clique uma vez pra publicar (ou de novo se algo mudar). Precisa dos secrets{' '}
            <code className="bg-white/10 px-1 py-0.5 rounded">CLOUDFLARE_API_TOKEN</code>,{' '}
            <code className="bg-white/10 px-1 py-0.5 rounded">CLOUDFLARE_ACCOUNT_ID</code> e{' '}
            <code className="bg-white/10 px-1 py-0.5 rounded">CLOUDFLARE_ZONE_ID</code> no Supabase, com o token tendo permissão de Workers (Edit) além de DNS.
          </p>
        </div>
        <button
          onClick={handleDeployWorker}
          disabled={deploying}
          className="honey-gradient text-beetz-dark font-bold px-4 py-2 rounded-xl text-sm disabled:opacity-60 shrink-0"
        >
          {deploying ? 'Publicando...' : 'Publicar mecanismo'}
        </button>
        {deployResult && <p className="text-xs text-green-300 w-full">{deployResult}</p>}
        {deployError && <p className="text-xs text-red-300 w-full">{deployError}</p>}
      </div>

      <form onSubmit={handleCreate} className="bg-white rounded-2xl shadow-soft border border-beetz-dark/5 p-5 space-y-3 mb-4">
        <div className="grid sm:grid-cols-2 gap-3">
          <input
            placeholder="/cardapio" value={newPath} onChange={(e) => setNewPath(e.target.value)}
            className={inputClass}
          />
          <input
            placeholder="https://destino.com/..." value={newDestination} onChange={(e) => setNewDestination(e.target.value)}
            className={inputClass}
          />
        </div>
        <input
          placeholder="Observações (opcional)" value={newNotes} onChange={(e) => setNewNotes(e.target.value)}
          className={`${inputClass} w-full`}
        />
        {formError && <p className="text-sm text-red-600">{formError}</p>}
        <button
          type="submit" disabled={saving || !newPath.trim() || !newDestination.trim()}
          className="honey-gradient text-beetz-dark font-bold px-4 py-2 rounded-xl text-sm disabled:opacity-60"
        >
          {saving ? 'Salvando...' : 'Criar redirecionador'}
        </button>
      </form>

      {loading ? (
        <p className="text-beetz-dark/50 text-sm">Carregando...</p>
      ) : redirects.length === 0 ? (
        <p className="text-sm text-beetz-dark/50 bg-white rounded-2xl p-6 text-center border border-beetz-dark/5">Nenhum redirecionador cadastrado ainda.</p>
      ) : (
        <div className="bg-white rounded-2xl shadow-soft border border-beetz-dark/5 divide-y divide-beetz-dark/5">
          {redirects.map((r) => (
            <div key={r.id} className="p-4">
              {editingId === r.id ? (
                <div className="space-y-2">
                  <div className="grid sm:grid-cols-2 gap-2">
                    <input className={`${inputClass} w-full`} value={editPath} onChange={(e) => setEditPath(e.target.value)} />
                    <input className={`${inputClass} w-full`} value={editDestination} onChange={(e) => setEditDestination(e.target.value)} />
                  </div>
                  <input className={`${inputClass} w-full`} placeholder="Observações" value={editNotes} onChange={(e) => setEditNotes(e.target.value)} />
                  <div className="flex gap-2">
                    <button onClick={() => saveEdit(r.id)} className="flex items-center gap-1 text-xs font-semibold bg-beetz-dark text-white px-3 py-1.5 rounded-lg">
                      <Check size={13} /> Salvar
                    </button>
                    <button onClick={() => setEditingId(null)} className="text-xs font-semibold text-beetz-dark/50 px-3 py-1.5 rounded-lg hover:bg-beetz-gray">Cancelar</button>
                  </div>
                </div>
              ) : (
                <div className="flex flex-wrap items-center gap-3">
                  <button
                    onClick={() => toggleActive(r)}
                    className={`text-xs font-semibold px-2.5 py-1 rounded-full ${r.is_active ? 'bg-green-100 text-green-700' : 'bg-beetz-dark/10 text-beetz-dark/50'}`}
                    title={r.is_active ? 'Clique pra desativar' : 'Clique pra ativar'}
                  >
                    {r.is_active ? 'Ativo' : 'Inativo'}
                  </button>
                  <div className="flex-1 min-w-[220px]">
                    <p className="font-semibold text-sm flex items-center gap-1.5">
                      beetz.bar<span className="text-beetz-dark/80">{r.path}</span>
                      <ExternalLink size={12} className="text-beetz-dark/30" />
                    </p>
                    <p className="text-xs text-beetz-dark/50 truncate">
                      → {r.destination_url}{r.notes ? ` · ${r.notes}` : ''}
                    </p>
                  </div>
                  <button onClick={() => startEdit(r)} className="text-beetz-dark/40 hover:text-beetz-dark p-1.5 rounded-lg hover:bg-beetz-gray"><Pencil size={14} /></button>
                  <button onClick={() => handleDelete(r.id)} className="text-beetz-dark/40 hover:text-red-600 p-1.5 rounded-lg hover:bg-beetz-gray"><Trash2 size={14} /></button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
