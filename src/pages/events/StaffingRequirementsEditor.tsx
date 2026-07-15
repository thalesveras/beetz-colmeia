import { useEffect, useState } from 'react'
import { Check, ClipboardList, Pencil, Plus, Trash2, X } from 'lucide-react'
import {
  createEventStaffingRequirement, deleteEventStaffingRequirement,
  listEventStaffingRequirements, updateEventStaffingRequirement
} from '../../lib/dataService'
import type { EventStaffingRequirement } from '../../lib/types'

// CRUD das vagas do evento ("preciso de 10 garçons"). Vive em dois lugares —
// no editar evento (vaga é parte da definição do evento) e na aba Equipe (onde
// você vê as vagas sendo preenchidas e percebe que precisa de mais gente) —
// então é um componente só, pra as duas telas nunca divergirem.

const inputClass = 'rounded-xl border border-beetz-dark/15 text-sm px-3 py-2 focus:outline-none focus:ring-2 focus:ring-beetz-yellow'

interface Props {
  eventId: string
  // Quantos já estão confirmados em cada vaga. Só a aba Equipe sabe disso;
  // no formulário de evento não passa nada e as barras não aparecem.
  confirmedByRequirement?: Record<string, number>
  onChanged?: () => void
}

export default function StaffingRequirementsEditor({ eventId, confirmedByRequirement, onChanged }: Props) {
  const [requirements, setRequirements] = useState<EventStaffingRequirement[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [newLabel, setNewLabel] = useState('')
  const [newQty, setNewQty] = useState('1')
  const [newNotes, setNewNotes] = useState('')
  const [saving, setSaving] = useState(false)

  const [editingId, setEditingId] = useState<string | null>(null)
  const [editLabel, setEditLabel] = useState('')
  const [editQty, setEditQty] = useState('1')
  const [editNotes, setEditNotes] = useState('')

  async function load() {
    setLoading(true)
    try {
      setRequirements(await listEventStaffingRequirements(eventId))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao carregar as vagas.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [eventId])

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault()
    const qty = Number(newQty)
    if (!newLabel.trim() || !qty || qty < 1) return
    setSaving(true)
    setError(null)
    try {
      await createEventStaffingRequirement({
        event_id: eventId,
        role_label: newLabel.trim(),
        quantity: qty,
        unit_cost: null,
        notes: newNotes.trim() || null
      })
      setNewLabel(''); setNewQty('1'); setNewNotes('')
      await load()
      onChanged?.()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao criar a vaga.')
    } finally {
      setSaving(false)
    }
  }

  function startEdit(r: EventStaffingRequirement) {
    setEditingId(r.id)
    setEditLabel(r.role_label)
    setEditQty(String(r.quantity))
    setEditNotes(r.notes ?? '')
  }

  async function saveEdit(id: string) {
    const qty = Number(editQty)
    if (!editLabel.trim() || !qty || qty < 1) return
    try {
      await updateEventStaffingRequirement(id, {
        role_label: editLabel.trim(), quantity: qty, notes: editNotes.trim() || null
      })
      setEditingId(null)
      await load()
      onChanged?.()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao salvar a vaga.')
    }
  }

  async function handleDelete(r: EventStaffingRequirement) {
    const confirmed = confirmedByRequirement?.[r.id] ?? 0
    const msg = confirmed > 0
      ? `Apagar a vaga "${r.role_label}"? ${confirmed} ${confirmed === 1 ? 'pessoa confirmada continua' : 'pessoas confirmadas continuam'} na equipe do evento, mas as candidaturas dessa vaga somem.`
      : `Apagar a vaga "${r.role_label}"?`
    if (!window.confirm(msg)) return
    try {
      await deleteEventStaffingRequirement(r.id)
      await load()
      onChanged?.()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao apagar a vaga.')
    }
  }

  const totalVagas = requirements.reduce((sum, r) => sum + r.quantity, 0)

  return (
    <div>
      <div className="flex items-center justify-between gap-2 mb-3">
        <h3 className="font-bold text-sm flex items-center gap-2">
          <ClipboardList size={16} /> Vagas do evento
        </h3>
        {totalVagas > 0 && (
          <span className="text-xs text-beetz-dark/50">{totalVagas} {totalVagas === 1 ? 'vaga' : 'vagas'} no total</span>
        )}
      </div>
      <p className="text-xs text-beetz-dark/50 mb-3">
        Diga quanta gente o evento precisa (ex: 10 garçons). A turma vê essas vagas na tela Escala e se candidata.
      </p>

      {error && <p className="text-sm text-red-600 mb-3">{error}</p>}

      <form onSubmit={handleCreate} className="bg-beetz-gray rounded-2xl p-3 mb-3 space-y-2">
        <div className="flex flex-col sm:flex-row gap-2">
          <input
            placeholder="Função (ex: Garçom)"
            value={newLabel}
            onChange={(e) => setNewLabel(e.target.value)}
            className={`${inputClass} flex-1 bg-white`}
          />
          <input
            type="number" min="1" placeholder="Qtd"
            value={newQty}
            onChange={(e) => setNewQty(e.target.value)}
            className={`${inputClass} sm:w-24 bg-white`}
          />
        </div>
        <input
          placeholder="Observação (opcional — ex: chegar 18h, camisa preta)"
          value={newNotes}
          onChange={(e) => setNewNotes(e.target.value)}
          className={`${inputClass} w-full bg-white`}
        />
        <button
          type="submit"
          disabled={saving || !newLabel.trim()}
          className="flex items-center gap-1.5 honey-gradient text-beetz-dark font-bold px-4 py-2 rounded-xl text-sm disabled:opacity-60"
        >
          <Plus size={14} /> {saving ? 'Adicionando...' : 'Adicionar vaga'}
        </button>
      </form>

      {loading ? (
        <p className="text-sm text-beetz-dark/40">Carregando vagas...</p>
      ) : requirements.length === 0 ? (
        <p className="text-sm text-beetz-dark/40">Nenhuma vaga cadastrada ainda.</p>
      ) : (
        <div className="space-y-2">
          {requirements.map((r) => {
            const confirmed = confirmedByRequirement?.[r.id] ?? 0
            const full = confirmed >= r.quantity
            return (
              <div key={r.id} className="border border-beetz-dark/10 rounded-xl p-3">
                {editingId === r.id ? (
                  <div className="space-y-2">
                    <div className="flex flex-col sm:flex-row gap-2">
                      <input value={editLabel} onChange={(e) => setEditLabel(e.target.value)} className={`${inputClass} flex-1`} />
                      <input type="number" min="1" value={editQty} onChange={(e) => setEditQty(e.target.value)} className={`${inputClass} sm:w-24`} />
                    </div>
                    <input placeholder="Observação" value={editNotes} onChange={(e) => setEditNotes(e.target.value)} className={`${inputClass} w-full`} />
                    <div className="flex gap-2">
                      <button onClick={() => saveEdit(r.id)} className="flex items-center gap-1 text-xs font-semibold bg-beetz-dark text-white px-3 py-1.5 rounded-lg">
                        <Check size={13} /> Salvar
                      </button>
                      <button onClick={() => setEditingId(null)} className="text-xs font-semibold text-beetz-dark/50 px-3 py-1.5 rounded-lg hover:bg-beetz-gray">
                        Cancelar
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="flex flex-wrap items-center gap-2">
                    <div className="flex-1 min-w-[160px]">
                      <p className="font-semibold text-sm">
                        {r.role_label}
                        <span className="text-beetz-dark/40 font-normal"> · {r.quantity} {r.quantity === 1 ? 'vaga' : 'vagas'}</span>
                      </p>
                      {r.notes && <p className="text-xs text-beetz-dark/50 mt-0.5">{r.notes}</p>}
                      {confirmedByRequirement && (
                        <div className="mt-2">
                          <div className="h-1.5 bg-beetz-gray rounded-full overflow-hidden">
                            <div
                              className={full ? 'h-full bg-green-500' : 'h-full honey-gradient'}
                              style={{ width: `${Math.min(100, (confirmed / Math.max(1, r.quantity)) * 100)}%` }}
                            />
                          </div>
                          <p className="text-[11px] text-beetz-dark/40 mt-1">{confirmed} de {r.quantity} confirmados</p>
                        </div>
                      )}
                    </div>
                    <button onClick={() => startEdit(r)} className="text-beetz-dark/40 hover:text-beetz-dark p-1.5 rounded-lg hover:bg-beetz-gray">
                      <Pencil size={14} />
                    </button>
                    <button onClick={() => handleDelete(r)} className="text-beetz-dark/40 hover:text-red-600 p-1.5 rounded-lg hover:bg-beetz-gray">
                      <Trash2 size={14} />
                    </button>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
