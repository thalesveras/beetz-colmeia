import { useEffect, useState } from 'react'
import { HandCoins, Plus, Trash2 } from 'lucide-react'
import { useAuth } from '../../contexts/AuthContext'
import { createEventRepasse, deleteEventRepasse, listEventRepasses, listProfiles } from '../../lib/dataService'
import type { EventRepasse, Profile } from '../../lib/types'

const inputClass = 'w-full border border-beetz-dark/15 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-beetz-yellow'

function currency(v: number) {
  return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

function formatDate(d: string) {
  return new Date(d + 'T00:00:00').toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' })
}

// Ledger de repasses financeiros à produtora do evento — pagamentos de
// verdade, sem relação com o estoque. Nasceu dentro do cartão de Fechamento
// (Diretoria), mas agora vive como aba própria do evento pra ficar mais
// fácil de lançar/consultar sem precisar abrir o fechamento inteiro. O
// Fechamento continua mostrando o total (ver FinancialSummaryCard).
export default function RepassesTab({ eventId, canManage }: { eventId: string; canManage: boolean }) {
  const { userId } = useAuth()
  const [repasses, setRepasses] = useState<EventRepasse[]>([])
  const [profiles, setProfiles] = useState<Profile[]>([])
  const [loading, setLoading] = useState(true)

  const [newAmount, setNewAmount] = useState(0)
  const [newDate, setNewDate] = useState(new Date().toISOString().slice(0, 10))
  const [newNotes, setNewNotes] = useState('')
  const [saving, setSaving] = useState(false)
  const [deletingId, setDeletingId] = useState<string | null>(null)

  async function load() {
    setLoading(true)
    const [r, p] = await Promise.all([listEventRepasses(eventId), listProfiles()])
    setRepasses(r)
    setProfiles(p)
    setLoading(false)
  }

  useEffect(() => { load() }, [eventId])

  const creatorName = (id: string | null) => {
    if (!id) return '—'
    const p = profiles.find((pr) => pr.id === id)
    return p ? `${p.first_name} ${p.last_name}` : '—'
  }

  const total = repasses.reduce((sum, r) => sum + r.amount, 0)

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault()
    if (newAmount <= 0) return
    setSaving(true)
    await createEventRepasse({
      event_id: eventId, amount: newAmount, paid_at: newDate, notes: newNotes.trim() || null, created_by: userId ?? null
    })
    setSaving(false)
    setNewAmount(0)
    setNewDate(new Date().toISOString().slice(0, 10))
    setNewNotes('')
    load()
  }

  async function handleDelete(id: string) {
    setDeletingId(id)
    await deleteEventRepasse(id)
    setDeletingId(null)
    load()
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <h2 className="font-bold text-lg flex items-center gap-2"><HandCoins size={18} /> Repasses à produtora</h2>
          <p className="text-sm text-beetz-dark/50 mt-0.5">Lançamentos de pagamento pra quem produziu este evento.</p>
        </div>
        <p className="text-sm text-beetz-dark/60">
          Total: <span className="font-bold text-beetz-dark">{currency(total)}</span>
        </p>
      </div>

      {canManage && (
        <form onSubmit={handleAdd} className="bg-beetz-gray rounded-2xl p-5 grid sm:grid-cols-[1fr_1fr_2fr_auto] gap-3 items-end">
          <div>
            <label className="text-sm font-medium block mb-1">Valor (R$)</label>
            <input type="number" min={0.01} step="0.01" className={inputClass} value={newAmount || ''} onChange={(e) => setNewAmount(Number(e.target.value))} />
          </div>
          <div>
            <label className="text-sm font-medium block mb-1">Data</label>
            <input type="date" className={inputClass} value={newDate} onChange={(e) => setNewDate(e.target.value)} />
          </div>
          <div>
            <label className="text-sm font-medium block mb-1">Observações</label>
            <input className={inputClass} placeholder="Opcional" value={newNotes} onChange={(e) => setNewNotes(e.target.value)} />
          </div>
          <button
            type="submit"
            disabled={saving || newAmount <= 0}
            className="flex items-center gap-1.5 honey-gradient text-beetz-dark font-bold px-4 py-2 rounded-xl text-sm disabled:opacity-60 h-fit"
          >
            <Plus size={14} /> {saving ? 'Salvando...' : 'Lançar'}
          </button>
        </form>
      )}

      {loading ? (
        <p className="text-sm text-beetz-dark/50">Carregando lançamentos...</p>
      ) : (
        <div className="bg-white rounded-2xl shadow-soft border border-beetz-dark/5 divide-y divide-beetz-dark/5">
          {repasses.map((r) => (
            <div key={r.id} className="flex flex-wrap items-center gap-3 p-4">
              <div className="flex-1 min-w-[160px]">
                <p className="font-semibold text-sm">{currency(r.amount)}</p>
                <p className="text-xs text-beetz-dark/50">
                  {formatDate(r.paid_at)} · Registrado por: {creatorName(r.created_by)}
                  {r.notes ? ` · ${r.notes}` : ''}
                </p>
              </div>
              {canManage && (
                <button
                  onClick={() => handleDelete(r.id)}
                  disabled={deletingId === r.id}
                  className="text-beetz-dark/40 hover:text-red-600 p-1.5 rounded-lg hover:bg-beetz-gray disabled:opacity-50"
                >
                  <Trash2 size={14} />
                </button>
              )}
            </div>
          ))}
          {repasses.length === 0 && <p className="text-sm text-beetz-dark/50 p-4">Nenhum repasse lançado ainda.</p>}
        </div>
      )}
    </div>
  )
}
