import { useEffect, useState } from 'react'
import { Check, ClipboardList, Pencil, Plus, Trash2, X } from 'lucide-react'
import {
  createEventStaffingRequirement, deleteEventStaffingRequirement,
  listEventStaffingRequirements, listStaffingRoles, updateEventStaffingRequirement
} from '../../lib/dataService'
import type { EventStaffingRequirement, StaffingRole } from '../../lib/types'

function brl(v: number) {
  return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

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

  // Catálogo de funções com valores (Configurações → Funções & Valores).
  // Escolher uma função preenche rótulo e valor sozinho — e ambos continuam
  // editáveis, porque todo evento tem sua exceção.
  const [roles, setRoles] = useState<StaffingRole[]>([])
  const [newRoleId, setNewRoleId] = useState('')
  const [newLabel, setNewLabel] = useState('')
  const [newQty, setNewQty] = useState('1')
  const [newValue, setNewValue] = useState('')
  const [newNotes, setNewNotes] = useState('')
  const [saving, setSaving] = useState(false)

  const [editingId, setEditingId] = useState<string | null>(null)
  const [editLabel, setEditLabel] = useState('')
  const [editQty, setEditQty] = useState('1')
  const [editValue, setEditValue] = useState('')
  const [editNotes, setEditNotes] = useState('')

  function pickRole(id: string) {
    setNewRoleId(id)
    const role = roles.find((r) => r.id === id)
    if (role) {
      setNewLabel(role.name)
      // Função comissionada não tem R$ fixo — o campo de valor some do form
      // e a vaga nasce sem unit_cost (o % vive na função/pessoa).
      setNewValue(role.pay_type === 'percent' ? '' : (role.default_value > 0 ? String(role.default_value) : ''))
    }
  }

  const selectedRole = roles.find((r) => r.id === newRoleId)
  const selectedIsPercent = selectedRole?.pay_type === 'percent'

  async function load() {
    setLoading(true)
    try {
      const [reqs, roleList] = await Promise.all([listEventStaffingRequirements(eventId), listStaffingRoles()])
      setRequirements(reqs)
      setRoles(roleList.filter((r) => r.active))
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
        unit_cost: newValue.trim() ? Number(newValue.replace(',', '.')) : null,
        notes: newNotes.trim() || null,
        role_id: newRoleId || null
      })
      setNewRoleId(''); setNewLabel(''); setNewQty('1'); setNewValue(''); setNewNotes('')
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
    setEditValue(r.unit_cost != null ? String(r.unit_cost) : '')
    setEditNotes(r.notes ?? '')
  }

  async function saveEdit(id: string) {
    const qty = Number(editQty)
    if (!editLabel.trim() || !qty || qty < 1) return
    try {
      await updateEventStaffingRequirement(id, {
        role_label: editLabel.trim(), quantity: qty,
        unit_cost: editValue.trim() ? Number(editValue.replace(',', '.')) : null,
        notes: editNotes.trim() || null
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
        {roles.length > 0 && (
          <select value={newRoleId} onChange={(e) => pickRole(e.target.value)} className={`${inputClass} w-full bg-white`}>
            <option value="">Função avulsa (digitar na mão)</option>
            {roles.map((r) => (
              <option key={r.id} value={r.id}>
                {r.name}
                {r.pay_type === 'percent'
                  ? ` — ${r.default_percent ?? 0}% das vendas`
                  : r.default_value > 0 ? ` — ${brl(r.default_value)}` : ''}
              </option>
            ))}
          </select>
        )}
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
          {selectedIsPercent && (
            <span
              className="flex items-center justify-center text-xs font-bold bg-beetz-yellow/25 px-3 py-2 rounded-xl whitespace-nowrap"
              title="A comissão é calculada sobre os Recebimentos que a pessoa lança no fim do evento — não há valor fixo por vaga."
            >
              {selectedRole?.default_percent ?? 0}% das vendas
            </span>
          )}
          {!selectedIsPercent && (
            <input
              type="text" inputMode="decimal" placeholder="R$ por pessoa"
              value={newValue}
              onChange={(e) => setNewValue(e.target.value)}
              className={`${inputClass} sm:w-32 bg-white`}
            />
          )}
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
                      <input type="text" inputMode="decimal" placeholder="R$ por pessoa" value={editValue} onChange={(e) => setEditValue(e.target.value)} className={`${inputClass} sm:w-32`} />
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
                  <div>
                    {/* Título e ações na MESMA linha (nada de botão flutuando
                        ao lado da barra); barra de progresso em largura total
                        embaixo — no celular cada coisa tem sua faixa. */}
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0 flex flex-wrap items-center gap-x-2 gap-y-1">
                        <p className="font-semibold text-sm">
                          {r.role_label}
                          <span className="text-beetz-dark/40 font-normal"> · {r.quantity} {r.quantity === 1 ? 'vaga' : 'vagas'}</span>
                        </p>
                        {(() => {
                          const role = r.role_id ? roles.find((x) => x.id === r.role_id) : undefined
                          if (role?.pay_type === 'percent') {
                            return (
                              <span className="text-xs font-bold bg-beetz-yellow/25 px-2 py-0.5 rounded-full whitespace-nowrap" title="Comissão: a despesa nasce dos Recebimentos que a pessoa lança no fim do evento">
                                {role.default_percent ?? 0}% das vendas/pessoa
                              </span>
                            )
                          }
                          if (r.unit_cost != null && r.unit_cost > 0) {
                            return <span className="text-xs font-bold bg-beetz-yellow/25 px-2 py-0.5 rounded-full whitespace-nowrap">{brl(r.unit_cost)}/pessoa</span>
                          }
                          return null
                        })()}
                      </div>
                      <div className="flex gap-1 shrink-0">
                        <button onClick={() => startEdit(r)} className="text-beetz-dark/40 hover:text-beetz-dark p-2 rounded-lg hover:bg-beetz-gray">
                          <Pencil size={14} />
                        </button>
                        <button onClick={() => handleDelete(r)} className="text-beetz-dark/40 hover:text-red-600 p-2 rounded-lg hover:bg-beetz-gray">
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </div>
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
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
