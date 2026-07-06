import { useEffect, useState } from 'react'
import { FileSignature } from 'lucide-react'
import {
  getProducerById, listEventModalities, listEventStaffingRequirements, listServiceModalities,
  markContractSigned
} from '../../lib/dataService'
import type { ContractStatus, EventItem, EventModality, EventStaffingRequirement, Producer, ServiceModality } from '../../lib/types'

const statusColors: Record<ContractStatus, string> = {
  'Rascunho': 'bg-beetz-gray text-beetz-dark/60',
  'Aguardando assinatura': 'bg-beetz-yellow/30 text-beetz-dark',
  'Assinado': 'bg-green-100 text-green-700',
  'Recusado': 'bg-red-100 text-red-700'
}

function currency(v: number) {
  return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

export default function ContractCard({ event, onEventUpdated }: { event: EventItem; onEventUpdated: (e: EventItem) => void }) {
  const [producer, setProducer] = useState<Producer | null>(null)
  const [modalities, setModalities] = useState<EventModality[]>([])
  const [modalityDefs, setModalityDefs] = useState<ServiceModality[]>([])
  const [staffing, setStaffing] = useState<EventStaffingRequirement[]>([])
  const [loading, setLoading] = useState(true)
  const [working, setWorking] = useState(false)

  async function load() {
    if (!event.producer_id) { setLoading(false); return }
    setLoading(true)
    const [p, mods, defs, staff] = await Promise.all([
      getProducerById(event.producer_id), listEventModalities(event.id),
      listServiceModalities(), listEventStaffingRequirements(event.id)
    ])
    setProducer(p)
    setModalities(mods)
    setModalityDefs(defs)
    setStaffing(staff)
    setLoading(false)
  }

  useEffect(() => { load() }, [event.id, event.producer_id])

  const modalityName = (id: string) => modalityDefs.find((m) => m.id === id)?.name ?? 'Modalidade'

  async function handleMarkSigned() {
    setWorking(true)
    try {
      await markContractSigned(event.id)
      onEventUpdated({ ...event, contract_status: 'Assinado', contract_signed_at: new Date().toISOString() })
    } finally {
      setWorking(false)
    }
  }

  if (!event.producer_id) return null

  return (
    <div className="bg-white rounded-2xl shadow-soft border border-beetz-dark/5 p-5 space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="font-bold flex items-center gap-2"><FileSignature size={18} className="text-beetz-yellow" /> Proposta &amp; contrato</h2>
        <span className={`text-xs font-semibold px-3 py-1.5 rounded-full ${statusColors[event.contract_status]}`}>{event.contract_status}</span>
      </div>

      {loading ? (
        <p className="text-sm text-beetz-dark/50">Carregando...</p>
      ) : (
        <>
          {producer && (
            <div>
              <h3 className="text-xs font-bold uppercase tracking-wide text-beetz-dark/40 mb-1">Produtor(a)</h3>
              <p className="text-sm font-semibold">{producer.company_name || producer.name}</p>
              <p className="text-xs text-beetz-dark/50">{producer.name} · {producer.email} {producer.phone ? `· ${producer.phone}` : ''}</p>
            </div>
          )}

          {modalities.length > 0 && (
            <div>
              <h3 className="text-xs font-bold uppercase tracking-wide text-beetz-dark/40 mb-1">Modalidades contratadas</h3>
              {modalities.map((m) => (
                <p key={m.id} className="text-sm">{modalityName(m.modality_id)}: {m.quantity} x {currency(m.unit_price)} = {currency(m.total)}</p>
              ))}
            </div>
          )}

          {staffing.length > 0 && (
            <div>
              <h3 className="text-xs font-bold uppercase tracking-wide text-beetz-dark/40 mb-1">Equipe necessária (definida na proposta)</h3>
              {staffing.map((s) => <p key={s.id} className="text-sm">{s.quantity}x {s.role_label}{s.unit_cost ? ` — ${currency(s.unit_cost)}/pessoa` : ''}</p>)}
            </div>
          )}

          <div className="pt-2 border-t border-beetz-dark/5 flex flex-wrap items-center gap-3">
            {event.zapsign_sign_url && event.contract_status === 'Aguardando assinatura' && (
              <a href={event.zapsign_sign_url} target="_blank" rel="noreferrer" className="text-sm font-semibold text-beetz-dark underline">
                Ver link de assinatura
              </a>
            )}
            {event.signed_file_url && (
              <a href={event.signed_file_url} target="_blank" rel="noreferrer" className="text-sm font-semibold text-beetz-dark underline">
                Baixar contrato assinado
              </a>
            )}
            {event.contract_status !== 'Assinado' && (
              <button
                onClick={handleMarkSigned} disabled={working}
                className="text-xs font-semibold bg-beetz-dark text-white px-3 py-2 rounded-lg hover:bg-black transition-colors disabled:opacity-50"
              >
                {working ? 'Salvando...' : 'Marcar como assinado manualmente'}
              </button>
            )}
          </div>
        </>
      )}
    </div>
  )
}
