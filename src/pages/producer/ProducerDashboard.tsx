import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Plus } from 'lucide-react'
import { useProducerAuth } from '../../contexts/ProducerAuthContext'
import { listEventsForProducer } from '../../lib/dataService'
import type { ContractStatus, EventItem } from '../../lib/types'

const statusColors: Record<ContractStatus, string> = {
  'Rascunho': 'bg-beetz-gray text-beetz-dark/60',
  'Aguardando assinatura': 'bg-beetz-yellow/30 text-beetz-dark',
  'Assinado': 'bg-green-100 text-green-700',
  'Recusado': 'bg-red-100 text-red-700'
}

export default function ProducerDashboard() {
  const { producerId, producer } = useProducerAuth()
  const [events, setEvents] = useState<EventItem[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!producerId) return
    listEventsForProducer(producerId).then(setEvents).finally(() => setLoading(false))
  }, [producerId])

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl md:text-3xl font-extrabold">Olá, {producer?.name?.split(' ')[0] ?? 'produtor(a)'}!</h1>
          <p className="text-beetz-dark/60 mt-1">Monte seu evento com a Beetz e acompanhe suas propostas por aqui.</p>
        </div>
        <Link
          to="/produtor/nova-proposta"
          className="flex items-center gap-2 honey-gradient text-beetz-dark font-bold px-4 py-2.5 rounded-xl hover:brightness-105 transition"
        >
          <Plus size={18} /> Nova proposta
        </Link>
      </div>

      {loading ? (
        <p className="text-beetz-dark/50">Carregando...</p>
      ) : events.length === 0 ? (
        <div className="bg-white rounded-2xl p-8 text-center shadow-soft border border-beetz-dark/5">
          <p className="text-beetz-dark/60 mb-4">Você ainda não tem nenhuma proposta com a Beetz.</p>
          <Link to="/produtor/nova-proposta" className="honey-gradient text-beetz-dark font-bold px-5 py-2.5 rounded-xl inline-block">
            Montar meu primeiro evento
          </Link>
        </div>
      ) : (
        <div className="space-y-3">
          {events.map((ev) => (
            <Link
              key={ev.id} to={`/produtor/eventos/${ev.id}`}
              className="flex flex-wrap items-center gap-3 bg-white rounded-2xl p-5 shadow-soft border border-beetz-dark/5 hover:border-beetz-yellow transition-colors"
            >
              <div className="flex-1 min-w-[200px]">
                <p className="font-bold">{ev.name}</p>
                <p className="text-sm text-beetz-dark/50">
                  {ev.event_date ? new Date(ev.event_date + 'T00:00:00').toLocaleDateString('pt-BR') : 'Data a definir'} · {ev.city || 'Cidade a definir'}
                </p>
              </div>
              <span className={`text-xs font-semibold px-3 py-1.5 rounded-full ${statusColors[ev.contract_status]}`}>{ev.contract_status}</span>
            </Link>
          ))}
        </div>
      )}
    </div>
  )
}
