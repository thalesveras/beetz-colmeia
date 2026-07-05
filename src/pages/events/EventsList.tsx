import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Plus } from 'lucide-react'
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
        <div className="grid md:grid-cols-2 gap-4">
          {filtered.map((e) => (
            <Link key={e.id} to={`/eventos/${e.id}`} className="bg-white rounded-2xl p-5 shadow-soft border border-beetz-dark/5 hover:shadow-glow transition-shadow">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className="text-xs font-semibold text-beetz-dark/50">{formatDate(e.event_date)}</p>
                  <h3 className="font-bold text-lg">{e.name}</h3>
                </div>
                <span className={`text-xs font-semibold px-2.5 py-1 rounded-full whitespace-nowrap ${statusColors[e.status]}`}>{e.status}</span>
              </div>
              <p className="text-sm text-beetz-dark/60 mt-2">📍 {e.location} · {e.city}</p>
            </Link>
          ))}
          {filtered.length === 0 && <p className="text-beetz-dark/50">Nenhum evento encontrado.</p>}
        </div>
      )}
    </div>
  )
}
