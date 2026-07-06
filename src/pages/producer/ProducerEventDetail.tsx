import { useEffect, useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import { useProducerAuth } from '../../contexts/ProducerAuthContext'
import {
  getEventById, listEventModalities, listEventStaffingRequirements, listServiceModalities,
  markContractSigned, requestContractSignature
} from '../../lib/dataService'
import type { ContractStatus, EventItem, EventModality, EventStaffingRequirement, ServiceModality } from '../../lib/types'

const statusColors: Record<ContractStatus, string> = {
  'Rascunho': 'bg-beetz-gray text-beetz-dark/60',
  'Aguardando assinatura': 'bg-beetz-yellow/30 text-beetz-dark',
  'Assinado': 'bg-green-100 text-green-700',
  'Recusado': 'bg-red-100 text-red-700'
}

function currency(v: number) {
  return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

export default function ProducerEventDetail() {
  const { id } = useParams()
  const { isDemoMode } = useProducerAuth()
  const [event, setEvent] = useState<EventItem | null>(null)
  const [modalities, setModalities] = useState<EventModality[]>([])
  const [modalityDefs, setModalityDefs] = useState<ServiceModality[]>([])
  const [staffing, setStaffing] = useState<EventStaffingRequirement[]>([])
  const [loading, setLoading] = useState(true)
  const [working, setWorking] = useState(false)

  async function load() {
    if (!id) return
    setLoading(true)
    const [ev, mods, defs, staff] = await Promise.all([
      getEventById(id), listEventModalities(id), listServiceModalities(), listEventStaffingRequirements(id)
    ])
    setEvent(ev)
    setModalities(mods)
    setModalityDefs(defs)
    setStaffing(staff)
    setLoading(false)
  }

  useEffect(() => { load() }, [id])

  const modalityName = (modalityId: string) => modalityDefs.find((m) => m.id === modalityId)?.name ?? 'Modalidade'

  async function handleRequestSignature() {
    if (!id) return
    setWorking(true)
    try {
      await requestContractSignature(id)
      await load()
    } finally {
      setWorking(false)
    }
  }

  async function handleSimulateSign() {
    if (!id) return
    setWorking(true)
    try {
      await markContractSigned(id)
      await load()
    } finally {
      setWorking(false)
    }
  }

  if (loading) return <p className="text-beetz-dark/50">Carregando...</p>
  if (!event) return <p className="text-beetz-dark/50">Proposta não encontrada.</p>

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <Link to="/produtor" className="text-sm text-beetz-dark/50">← Minhas propostas</Link>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-extrabold">{event.name}</h1>
        <span className={`text-xs font-semibold px-3 py-1.5 rounded-full ${statusColors[event.contract_status]}`}>{event.contract_status}</span>
      </div>

      <div className="bg-white rounded-2xl p-6 shadow-soft border border-beetz-dark/5 space-y-4">
        <div>
          <h3 className="text-xs font-bold uppercase tracking-wide text-beetz-dark/40 mb-1">Evento</h3>
          <p className="text-sm">{event.event_date ? new Date(event.event_date + 'T00:00:00').toLocaleDateString('pt-BR') : 'Data a definir'}</p>
          <p className="text-sm text-beetz-dark/60">{event.location} — {event.city}</p>
          <p className="text-sm text-beetz-dark/60">{event.address}</p>
        </div>

        {modalities.length > 0 && (
          <div>
            <h3 className="text-xs font-bold uppercase tracking-wide text-beetz-dark/40 mb-1">Modalidades contratadas</h3>
            {modalities.map((m) => (
              <p key={m.id} className="text-sm">{modalityName(m.modality_id)}: {m.quantity} x {currency(m.unit_price)} = {currency(m.total)}</p>
            ))}
          </div>
        )}

        <div>
          <h3 className="text-xs font-bold uppercase tracking-wide text-beetz-dark/40 mb-1">Faturamento</h3>
          <p className="text-sm">Vendas estimadas: {currency(event.sales_amount)} · Percentual Beetz: {event.commission_percentage}%</p>
        </div>

        {staffing.length > 0 && (
          <div>
            <h3 className="text-xs font-bold uppercase tracking-wide text-beetz-dark/40 mb-1">Equipe necessária</h3>
            {staffing.map((s) => <p key={s.id} className="text-sm">{s.quantity}x {s.role_label}</p>)}
          </div>
        )}

        <div className="pt-3 border-t border-beetz-dark/5">
          {event.contract_status === 'Rascunho' && (
            <button onClick={handleRequestSignature} disabled={working} className="honey-gradient text-beetz-dark font-bold px-5 py-2.5 rounded-xl text-sm disabled:opacity-60">
              {working ? 'Gerando contrato...' : 'Gerar contrato para assinatura'}
            </button>
          )}
          {event.contract_status === 'Aguardando assinatura' && (
            <div className="space-y-2">
              {event.zapsign_sign_url && (
                <a href={event.zapsign_sign_url} target="_blank" rel="noreferrer" className="honey-gradient text-beetz-dark font-bold px-5 py-2.5 rounded-xl text-sm inline-block">
                  Assinar contrato
                </a>
              )}
              {isDemoMode && (
                <button onClick={handleSimulateSign} disabled={working} className="block text-xs text-beetz-dark/50 underline">
                  (demo) simular assinatura
                </button>
              )}
            </div>
          )}
          {event.contract_status === 'Assinado' && (
            <p className="text-sm text-green-700">
              Contrato assinado{event.contract_signed_at ? ` em ${new Date(event.contract_signed_at).toLocaleDateString('pt-BR')}` : ''}.
              {event.signed_file_url && (
                <> <a href={event.signed_file_url} target="_blank" rel="noreferrer" className="underline">Baixar contrato assinado</a></>
              )}
            </p>
          )}
        </div>
      </div>
    </div>
  )
}
