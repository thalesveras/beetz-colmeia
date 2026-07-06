import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Check, Plus, Trash2 } from 'lucide-react'
import { useProducerAuth } from '../../contexts/ProducerAuthContext'
import {
  createEventAsProducer, createEventModality, createEventStaffingRequirement,
  listServiceModalities, requestContractSignature
} from '../../lib/dataService'
import type { ServiceModality } from '../../lib/types'

const inputClass = 'w-full border border-beetz-dark/15 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-beetz-yellow'
const STEPS = ['Resumo do evento', 'Modalidades', 'Faturamento', 'Equipe necessária', 'Revisão e assinatura']

interface ModalitySelection { quantity: number; unit_price: number; notes: string }
interface StaffingRow { role_label: string; quantity: number; unit_cost: number }

function currency(v: number) {
  return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

export default function ProducerNewProposal() {
  const { producerId } = useProducerAuth()
  const navigate = useNavigate()
  const [step, setStep] = useState(0)
  const [error, setError] = useState<string | null>(null)

  // Passo 1 — resumo do evento
  const [name, setName] = useState('')
  const [eventDate, setEventDate] = useState('')
  const [location, setLocation] = useState('')
  const [city, setCity] = useState('')
  const [address, setAddress] = useState('')
  const [startTime, setStartTime] = useState('')
  const [endDate, setEndDate] = useState('')
  const [endTime, setEndTime] = useState('')
  const [musicStyle, setMusicStyle] = useState('')
  const [link, setLink] = useState('')

  // Passo 2 — modalidades
  const [modalities, setModalities] = useState<ServiceModality[]>([])
  const [selected, setSelected] = useState<Record<string, ModalitySelection>>({})

  // Passo 3 — faturamento
  const [salesAmount, setSalesAmount] = useState(0)
  const [commissionPercentage, setCommissionPercentage] = useState(20)

  // Passo 4 — equipe necessária
  const [staffing, setStaffing] = useState<StaffingRow[]>([])
  const [newRole, setNewRole] = useState('')
  const [newQty, setNewQty] = useState(1)
  const [newCost, setNewCost] = useState(0)

  // Passo 5 — envio
  const [submitting, setSubmitting] = useState(false)
  const [signUrl, setSignUrl] = useState<string | null>(null)
  const [done, setDone] = useState(false)

  useEffect(() => { listServiceModalities().then(setModalities) }, [])

  const needsStaffing = Object.keys(selected).some((id) => modalities.find((m) => m.id === id)?.requires_staffing)
  const totalModalidades = Object.entries(selected).reduce((sum, [, cfg]) => sum + cfg.quantity * cfg.unit_price, 0)

  function toggleModality(m: ServiceModality) {
    setSelected((prev) => {
      const next = { ...prev }
      if (next[m.id]) delete next[m.id]
      else next[m.id] = { quantity: 1, unit_price: 0, notes: '' }
      return next
    })
  }

  function updateModalitySel(id: string, patch: Partial<ModalitySelection>) {
    setSelected((prev) => ({ ...prev, [id]: { ...prev[id], ...patch } }))
  }

  function addStaffingRow() {
    if (!newRole.trim()) return
    setStaffing((prev) => [...prev, { role_label: newRole.trim(), quantity: newQty, unit_cost: newCost }])
    setNewRole(''); setNewQty(1); setNewCost(0)
  }

  function removeStaffingRow(idx: number) {
    setStaffing((prev) => prev.filter((_, i) => i !== idx))
  }

  function validateStep(): string | null {
    if (step === 0) {
      if (!name.trim() || !eventDate || !location.trim() || !city.trim() || !address.trim()) {
        return 'Preencha nome, data, local, cidade e endereço do evento.'
      }
    }
    if (step === 1) {
      if (Object.keys(selected).length === 0) return 'Escolha ao menos uma modalidade de serviço.'
    }
    if (step === 3 && needsStaffing) {
      if (staffing.length === 0) return 'Adicione ao menos uma função de equipe (obrigatório para a(s) modalidade(s) escolhida(s)).'
    }
    return null
  }

  function goNext() {
    const err = validateStep()
    if (err) { setError(err); return }
    setError(null)
    // Pula o passo de equipe se nenhuma modalidade selecionada exigir pessoal.
    if (step === 2 && !needsStaffing) setStep(4)
    else setStep((s) => s + 1)
  }

  function goBack() {
    setError(null)
    if (step === 4 && !needsStaffing) setStep(2)
    else setStep((s) => Math.max(0, s - 1))
  }

  async function handleSubmit() {
    if (!producerId) return
    setSubmitting(true)
    setError(null)
    try {
      const event = await createEventAsProducer(producerId, {
        name, event_date: eventDate, location, city, status: 'Planejado', leader_id: null,
        address, start_time: startTime || null, end_date: endDate || null, end_time: endTime || null,
        music_style: musicStyle || null, link: link || null,
        sales_amount: salesAmount, commission_percentage: commissionPercentage
      })

      for (const [modalityId, cfg] of Object.entries(selected)) {
        await createEventModality({
          event_id: event.id, modality_id: modalityId, quantity: cfg.quantity,
          unit_price: cfg.unit_price, notes: cfg.notes || null
        })
      }

      for (const row of staffing) {
        await createEventStaffingRequirement({
          event_id: event.id, role_label: row.role_label, quantity: row.quantity,
          unit_cost: row.unit_cost || null, notes: null
        })
      }

      const result = await requestContractSignature(event.id)
      setSignUrl(result.sign_url)
      setDone(true)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Não foi possível enviar sua proposta. Tente novamente.')
    } finally {
      setSubmitting(false)
    }
  }

  if (done) {
    return (
      <div className="max-w-lg mx-auto bg-white rounded-2xl p-8 shadow-soft border border-beetz-dark/5 text-center space-y-4">
        <div className="w-14 h-14 rounded-full bg-green-100 text-green-600 flex items-center justify-center mx-auto"><Check size={28} /></div>
        <h1 className="text-xl font-extrabold">Proposta enviada!</h1>
        <p className="text-sm text-beetz-dark/60">
          Falta só assinar o contrato pra confirmar tudo. {signUrl ? 'Clique abaixo pra assinar agora.' : ''}
        </p>
        {signUrl && (
          <a href={signUrl} target="_blank" rel="noreferrer" className="honey-gradient text-beetz-dark font-bold px-5 py-3 rounded-xl inline-block">
            Assinar contrato
          </a>
        )}
        <button onClick={() => navigate('/produtor')} className="block mx-auto text-sm text-beetz-dark/50 underline mt-2">
          Ver minhas propostas
        </button>
      </div>
    )
  }

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-extrabold">Nova proposta</h1>
        <p className="text-beetz-dark/60 mt-1">Passo {step + 1} de {STEPS.length}: {STEPS[step]}</p>
        <div className="flex gap-1.5 mt-3">
          {STEPS.map((_, i) => (
            <div key={i} className={`h-1.5 flex-1 rounded-full ${i <= step ? 'bg-beetz-yellow' : 'bg-beetz-dark/10'}`} />
          ))}
        </div>
      </div>

      <div className="bg-white rounded-2xl p-6 shadow-soft border border-beetz-dark/5 space-y-4">
        {step === 0 && (
          <>
            <div>
              <label className="text-sm font-medium block mb-1">Nome do evento *</label>
              <input required className={inputClass} value={name} onChange={(e) => setName(e.target.value)} />
            </div>
            <div className="grid sm:grid-cols-2 gap-4">
              <div>
                <label className="text-sm font-medium block mb-1">Data *</label>
                <input type="date" required className={inputClass} value={eventDate} onChange={(e) => setEventDate(e.target.value)} />
              </div>
              <div>
                <label className="text-sm font-medium block mb-1">Data final (se houver)</label>
                <input type="date" className={inputClass} value={endDate} onChange={(e) => setEndDate(e.target.value)} />
              </div>
              <div>
                <label className="text-sm font-medium block mb-1">Horário de início</label>
                <input type="time" className={inputClass} value={startTime} onChange={(e) => setStartTime(e.target.value)} />
              </div>
              <div>
                <label className="text-sm font-medium block mb-1">Horário de término</label>
                <input type="time" className={inputClass} value={endTime} onChange={(e) => setEndTime(e.target.value)} />
              </div>
            </div>
            <div className="grid sm:grid-cols-2 gap-4">
              <div>
                <label className="text-sm font-medium block mb-1">Local/espaço *</label>
                <input required className={inputClass} value={location} onChange={(e) => setLocation(e.target.value)} />
              </div>
              <div>
                <label className="text-sm font-medium block mb-1">Cidade *</label>
                <input required className={inputClass} value={city} onChange={(e) => setCity(e.target.value)} />
              </div>
            </div>
            <div>
              <label className="text-sm font-medium block mb-1">Endereço completo *</label>
              <input required className={inputClass} value={address} onChange={(e) => setAddress(e.target.value)} />
            </div>
            <div className="grid sm:grid-cols-2 gap-4">
              <div>
                <label className="text-sm font-medium block mb-1">Estilo musical</label>
                <input className={inputClass} value={musicStyle} onChange={(e) => setMusicStyle(e.target.value)} />
              </div>
              <div>
                <label className="text-sm font-medium block mb-1">Link (evento/ingressos)</label>
                <input className={inputClass} value={link} onChange={(e) => setLink(e.target.value)} />
              </div>
            </div>
          </>
        )}

        {step === 1 && (
          <div className="space-y-3">
            <p className="text-sm text-beetz-dark/60">Escolha uma ou mais modalidades — pode combinar várias no mesmo evento.</p>
            {modalities.map((m) => {
              const isSelected = !!selected[m.id]
              return (
                <div key={m.id} className={`border rounded-xl p-4 transition-colors ${isSelected ? 'border-beetz-yellow bg-beetz-yellow/10' : 'border-beetz-dark/10'}`}>
                  <label className="flex items-start gap-3 cursor-pointer">
                    <input type="checkbox" className="mt-1" checked={isSelected} onChange={() => toggleModality(m)} />
                    <div>
                      <p className="font-semibold text-sm">{m.name}</p>
                      {m.description && <p className="text-xs text-beetz-dark/50">{m.description}</p>}
                    </div>
                  </label>
                  {isSelected && (
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mt-3 pl-6">
                      <div>
                        <label className="text-xs font-medium block mb-1">Quantidade ({m.unit_label})</label>
                        <input
                          type="number" min={0} step="0.01" className={inputClass}
                          value={selected[m.id].quantity}
                          onChange={(e) => updateModalitySel(m.id, { quantity: Number(e.target.value) })}
                        />
                      </div>
                      <div>
                        <label className="text-xs font-medium block mb-1">Preço unitário</label>
                        <input
                          type="number" min={0} step="0.01" className={inputClass}
                          value={selected[m.id].unit_price}
                          onChange={(e) => updateModalitySel(m.id, { unit_price: Number(e.target.value) })}
                        />
                      </div>
                      <div className="col-span-2 sm:col-span-1">
                        <label className="text-xs font-medium block mb-1">Observações</label>
                        <input
                          className={inputClass} value={selected[m.id].notes}
                          onChange={(e) => updateModalitySel(m.id, { notes: e.target.value })}
                        />
                      </div>
                    </div>
                  )}
                </div>
              )
            })}
            {Object.keys(selected).length > 0 && (
              <div className="bg-beetz-gray rounded-xl px-4 py-3 flex justify-between items-center">
                <span className="text-sm font-medium text-beetz-dark/60">Total estimado das modalidades</span>
                <span className="font-bold">{currency(totalModalidades)}</span>
              </div>
            )}
          </div>
        )}

        {step === 2 && (
          <>
            <p className="text-sm text-beetz-dark/60">Estimativas de faturamento do evento — sujeitas à confirmação da Beetz.</p>
            <div className="grid sm:grid-cols-2 gap-4">
              <div>
                <label className="text-sm font-medium block mb-1">Vendas estimadas (R$)</label>
                <input type="number" min={0} step="0.01" className={inputClass} value={salesAmount} onChange={(e) => setSalesAmount(Number(e.target.value))} />
              </div>
              <div>
                <label className="text-sm font-medium block mb-1">Percentual da Beetz (%)</label>
                <input type="number" min={0} max={100} step="0.1" className={inputClass} value={commissionPercentage} onChange={(e) => setCommissionPercentage(Number(e.target.value))} />
              </div>
            </div>
            <div className="bg-beetz-gray rounded-xl px-4 py-3 flex justify-between items-center">
              <span className="text-sm font-medium text-beetz-dark/60">A receber pela Beetz (estimado)</span>
              <span className="font-bold">{currency(salesAmount * (commissionPercentage / 100))}</span>
            </div>
          </>
        )}

        {step === 3 && (
          <div className="space-y-3">
            <p className="text-sm text-beetz-dark/60">Quantas pessoas por função você precisa pra esse evento?</p>
            {staffing.map((row, idx) => (
              <div key={idx} className="flex items-center gap-2 bg-beetz-gray rounded-xl px-3 py-2">
                <span className="flex-1 text-sm font-medium">{row.quantity}x {row.role_label}</span>
                {row.unit_cost > 0 && <span className="text-xs text-beetz-dark/50">{currency(row.unit_cost)}/pessoa</span>}
                <button onClick={() => removeStaffingRow(idx)} className="text-beetz-dark/40 hover:text-red-600 p-1"><Trash2 size={14} /></button>
              </div>
            ))}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 items-end">
              <div className="col-span-2 sm:col-span-2">
                <label className="text-xs font-medium block mb-1">Função</label>
                <input className={inputClass} placeholder="Ex: Garçom" value={newRole} onChange={(e) => setNewRole(e.target.value)} />
              </div>
              <div>
                <label className="text-xs font-medium block mb-1">Qtd.</label>
                <input type="number" min={1} className={inputClass} value={newQty} onChange={(e) => setNewQty(Number(e.target.value))} />
              </div>
              <div className="flex gap-1">
                <input type="number" min={0} step="0.01" placeholder="Custo (opcional)" className={inputClass} value={newCost} onChange={(e) => setNewCost(Number(e.target.value))} />
                <button onClick={addStaffingRow} className="bg-beetz-dark text-white p-2.5 rounded-xl shrink-0"><Plus size={16} /></button>
              </div>
            </div>
          </div>
        )}

        {step === 4 && (
          <div className="space-y-4">
            <div>
              <h3 className="text-xs font-bold uppercase tracking-wide text-beetz-dark/40 mb-1">Evento</h3>
              <p className="text-sm">{name} — {eventDate ? new Date(eventDate + 'T00:00:00').toLocaleDateString('pt-BR') : ''}</p>
              <p className="text-sm text-beetz-dark/60">{location}, {city}</p>
            </div>
            <div>
              <h3 className="text-xs font-bold uppercase tracking-wide text-beetz-dark/40 mb-1">Modalidades</h3>
              {Object.entries(selected).map(([id, cfg]) => (
                <p key={id} className="text-sm">{modalities.find((m) => m.id === id)?.name}: {cfg.quantity} x {currency(cfg.unit_price)}</p>
              ))}
            </div>
            <div>
              <h3 className="text-xs font-bold uppercase tracking-wide text-beetz-dark/40 mb-1">Faturamento</h3>
              <p className="text-sm">Vendas estimadas: {currency(salesAmount)} · Percentual Beetz: {commissionPercentage}%</p>
            </div>
            {staffing.length > 0 && (
              <div>
                <h3 className="text-xs font-bold uppercase tracking-wide text-beetz-dark/40 mb-1">Equipe necessária</h3>
                {staffing.map((r, i) => <p key={i} className="text-sm">{r.quantity}x {r.role_label}</p>)}
              </div>
            )}
            <p className="text-xs text-beetz-dark/50 pt-2 border-t border-beetz-dark/5">
              Ao confirmar, geramos o contrato e enviamos pra você assinar eletronicamente via ZapSign.
            </p>
          </div>
        )}

        {error && <p className="text-sm text-red-600">{error}</p>}

        <div className="flex justify-between pt-2">
          <button
            type="button" onClick={goBack} disabled={step === 0}
            className="text-sm font-semibold text-beetz-dark/50 px-4 py-2 disabled:opacity-0"
          >
            Voltar
          </button>
          {step < STEPS.length - 1 ? (
            <button type="button" onClick={goNext} className="honey-gradient text-beetz-dark font-bold px-5 py-2.5 rounded-xl text-sm">
              Avançar
            </button>
          ) : (
            <button type="button" onClick={handleSubmit} disabled={submitting} className="honey-gradient text-beetz-dark font-bold px-5 py-2.5 rounded-xl text-sm disabled:opacity-60">
              {submitting ? 'Enviando...' : 'Confirmar e ir para assinatura'}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
