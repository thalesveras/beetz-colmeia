import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { CalendarDays, MapPin, Plus } from 'lucide-react'
import { listEvents } from '../../lib/dataService'
import type { EventItem, EventStatus } from '../../lib/types'

function formatDate(d: string) {
  return new Date(d + 'T00:00:00').toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', year: 'numeric' })
}

const statusColors: Record<EventStatus, string> = {
  'Planejado': 'bg-gray-100 text-gray-700',
  'Confirmado': 'bg-blue-100 text-blue-700',
  'Em andamento': 'bg-beetz-yellow/40 text-beetz-dark',
  'Concluído': 'bg-green-100 text-green-700',
  'Cancelado': 'bg-red-100 text-red-700'
}

export default function EventsList() {
  const [events, setEvents] = useState<EventItem[]>([])
  const [statusFilter, setStatusFilter] = useState('')
  const [loading, setLoading] = useState(true)

  useEffect(() => { listEvents().then((e) => { setEvents(e); setLoading(false) }) }, [])

  const filtered = statusFilter ? events.filter((e) => e.status === statusFilter) : events

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl md:text-3xl font-extrabold">Eventos</h1>
          <p className="text-beetz-dark/60 mt-1">Onde a colmeia coloca a mão na massa.</p>
        </div>
        <Link to="/eventos/novo" className="flex items-center gap-2 honey-gradient text-beetz-dark font-bold px-4 py-2.5 rounded-xl hover:brightness-105 transition">
          <Plus size={18} /> Novo evento
        </Link>
      </div>

      <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className="rounded-xl border border-beetz-dark/15 text-sm px-3 py-2">
        <option value="">Todos os status</option>
        {Object.keys(statusColors).map((s) => <option key={s} value={s}>{s}</option>)}
      </select>

      {loading ? (
        <p className="text-beetz-dark/50">Carregando...</p>
      ) : (
        <div className="grid sm:grid-cols-2 xl:grid-cols-3 gap-3">
          {/* Card horizontal compacto: flyer como miniatura, data + status na
              primeira linha, título com no máximo 2 linhas — no celular a
              lista inteira cabe na tela sem títulos escorrendo. */}
          {filtered.map((e) => (
            <Link
              key={e.id}
              to={`/eventos/${e.id}`}
              className="bg-white rounded-2xl p-4 shadow-soft border border-beetz-dark/5 hover:shadow-glow transition-shadow flex gap-3 items-start"
            >
              {e.flyer_url ? (
                <img src={e.flyer_url} alt="" className="w-16 h-16 rounded-xl object-cover shrink-0 border border-beetz-dark/5" />
              ) : (
                <div className="w-16 h-16 rounded-xl dark-gradient flex items-center justify-center shrink-0 text-beetz-yellow">
                  <CalendarDays size={22} />
                </div>
              )}
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-xs font-semibold text-beetz-dark/50">{formatDate(e.event_date)}</p>
                  <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full whitespace-nowrap ${statusColors[e.status]}`}>{e.status}</span>
                </div>
                <h3 className="font-bold text-base leading-snug mt-0.5 line-clamp-2">{e.name}</h3>
                {(e.location || e.city) && (
                  <p className="text-xs text-beetz-dark/55 mt-1 truncate flex items-center gap-1">
                    <MapPin size={11} className="shrink-0" /> {[e.location, e.city].filter(Boolean).join(' · ')}
                  </p>
                )}
              </div>
            </Link>
          ))}
          {filtered.length === 0 && <p className="text-beetz-dark/50">Nenhum evento encontrado.</p>}
        </div>
      )}
    </div>
  )
}
