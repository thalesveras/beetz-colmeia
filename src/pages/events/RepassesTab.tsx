import { useEffect, useState } from 'react'
import { HandCoins, Plus, Trash2, X } from 'lucide-react'
import { useAuth } from '../../contexts/AuthContext'
import { createEventRepasse, deleteEventRepasse, listEventRepasses, listProfiles, updateEventRepasse } from '../../lib/dataService'
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
  const [selected, setSelected] = useState<EventRepasse | null>(null)

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
        <form onSubmit={handleAdd} className="bg-beetz-gray rounded-2xl p-4 sm:p-5 grid grid-cols-2 sm:grid-cols-[1fr_1fr_2fr_auto] gap-3 items-end">
          <div>
            <label className="text-sm font-medium block mb-1">Valor (R$)</label>
            <input type="number" min={0.01} step="0.01" className={inputClass} value={newAmount || ''} onChange={(e) => setNewAmount(Number(e.target.value))} />
          </div>
          <div>
            <label className="text-sm font-medium block mb-1">Data</label>
            <input type="date" className={inputClass} value={newDate} onChange={(e) => setNewDate(e.target.value)} />
          </div>
          <div className="col-span-2 sm:col-span-1">
            <label className="text-sm font-medium block mb-1">Observações</label>
            <input className={inputClass} placeholder="Opcional" value={newNotes} onChange={(e) => setNewNotes(e.target.value)} />
          </div>
          <button
            type="submit"
            disabled={saving || newAmount <= 0}
            className="col-span-2 sm:col-span-1 flex items-center justify-center gap-1.5 honey-gradient text-beetz-dark font-bold px-4 py-2.5 rounded-xl text-sm disabled:opacity-60 h-fit"
          >
            <Plus size={14} /> {saving ? 'Salvando...' : 'Lançar'}
          </button>
        </form>
      )}

      {loading ? (
        <p className="text-sm text-beetz-dark/50">Carregando lançamentos...</p>
      ) : (
        <div className="bg-white rounded-2xl shadow-soft border border-beetz-dark/5 divide-y divide-beetz-dark/5">
          {/* Linha inteira clicável: detalhes, correção e exclusão moram no
              modal — no celular acaba o alvo minúsculo de lixeira. */}
          {repasses.map((r) => (
            <button
              key={r.id}
              onClick={() => canManage && setSelected(r)}
              className={`w-full text-left flex items-center gap-3 p-4 ${canManage ? 'hover:bg-beetz-gray/50 active:bg-beetz-gray transition-colors' : 'cursor-default'}`}
            >
              <div className="flex-1 min-w-0">
                <p className="font-semibold text-sm">{currency(r.amount)}</p>
                <p className="text-xs text-beetz-dark/50 truncate">
                  {formatDate(r.paid_at)} · Registrado por: {creatorName(r.created_by)}
                  {r.notes ? ` · ${r.notes}` : ''}
                </p>
              </div>
            </button>
          ))}
          {repasses.length === 0 && <p className="text-sm text-beetz-dark/50 p-4">Nenhum repasse lançado ainda.</p>}
        </div>
      )}

      {selected && (
        <EditRepasseModal
          repasse={selected}
          registeredBy={creatorName(selected.created_by)}
          onClose={() => setSelected(null)}
          onSaved={() => { setSelected(null); load() }}
        />
      )}
    </div>
  )
}

// Modal padrão: corrigir valor/data/observação de um repasse lançado errado,
// ou excluí-lo com confirmação — com o rastro de quem registrou à vista.
function EditRepasseModal({ repasse, registeredBy, onClose, onSaved }: {
  repasse: EventRepasse
  registeredBy: string
  onClose: () => void
  onSaved: () => void
}) {
  const [amount, setAmount] = useState(String(repasse.amount))
  const [paidAt, setPaidAt] = useState(repasse.paid_at)
  const [notes, setNotes] = useState(repasse.notes ?? '')
  const [saving, setSaving] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSave() {
    const value = Number(amount.replace(',', '.'))
    if (!(value > 0)) { setError('Informe um valor maior que zero.'); return }
    setSaving(true); setError(null)
    try {
      await updateEventRepasse(repasse.id, { amount: value, paid_at: paidAt, notes: notes.trim() || null })
      onSaved()
    } catch (e: any) {
      setError(e?.message ?? 'Não foi possível salvar.')
      setSaving(false)
    }
  }

  async function handleDelete() {
    setSaving(true); setError(null)
    try {
      await deleteEventRepasse(repasse.id)
      onSaved()
    } catch (e: any) {
      setError(e?.message ?? 'Não foi possível excluir.')
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-end sm:items-center justify-center p-0 sm:p-6" onClick={onClose}>
      <div
        className="bg-white w-full sm:max-w-md rounded-t-3xl sm:rounded-3xl p-5 sm:p-6 max-h-[90vh] overflow-y-auto pb-[calc(1.25rem+env(safe-area-inset-bottom))]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3 mb-4">
          <div>
            <p className="font-bold text-lg leading-tight">Repasse à produtora</p>
            <p className="text-xs text-beetz-dark/45 mt-0.5">Registrado por {registeredBy}</p>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-beetz-gray shrink-0" aria-label="Fechar">
            <X size={18} />
          </button>
        </div>

        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-sm font-medium block mb-1">Valor (R$)</label>
              <input type="text" inputMode="decimal" className={inputClass} value={amount} onChange={(e) => setAmount(e.target.value)} />
            </div>
            <div>
              <label className="text-sm font-medium block mb-1">Data</label>
              <input type="date" className={inputClass} value={paidAt} onChange={(e) => setPaidAt(e.target.value)} />
            </div>
          </div>
          <div>
            <label className="text-sm font-medium block mb-1">Observações</label>
            <input className={inputClass} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Opcional" />
          </div>
        </div>

        {error && <p className="text-sm text-red-600 bg-red-50 border border-red-100 rounded-xl px-3 py-2 mt-3">{error}</p>}

        <div className="flex items-center justify-between gap-2 mt-5">
          {confirmDelete ? (
            <div className="flex items-center gap-1.5">
              <button onClick={handleDelete} disabled={saving}
                className="text-xs font-semibold bg-red-600 text-white px-3 py-2 rounded-xl hover:bg-red-700 disabled:opacity-60">
                {saving ? '...' : 'Confirmar exclusão'}
              </button>
              <button onClick={() => setConfirmDelete(false)} className="text-xs font-semibold text-beetz-dark/50 px-2 py-2">Voltar</button>
            </div>
          ) : (
            <button onClick={() => setConfirmDelete(true)}
              className="flex items-center gap-1.5 text-xs font-semibold text-red-500 hover:text-red-700 px-2 py-2">
              <Trash2 size={14} /> Excluir
            </button>
          )}
          <button onClick={handleSave} disabled={saving}
            className="honey-gradient text-beetz-dark font-bold px-5 py-2.5 rounded-xl text-sm disabled:opacity-60">
            {saving ? 'Salvando...' : 'Salvar'}
          </button>
        </div>
      </div>
    </div>
  )
}
