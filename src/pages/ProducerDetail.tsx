import { useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import {
  AlertTriangle, Building2, CalendarDays, Instagram, Lock, Mail, MapPin, Pencil, Phone,
  ShieldCheck, Trash2, User
} from 'lucide-react'
import { useAuth } from '../contexts/AuthContext'
import { canViewFinancialSummary } from '../lib/permissions'
import { deleteProducer, getProducerById, getProducerStats, updateProducer, type ProducerStats } from '../lib/dataService'
import type { EventItem, Producer, ProducerStatus } from '../lib/types'
import ProducerFormModal from '../components/producers/ProducerFormModal'

const STATUS_STYLES: Record<ProducerStatus, string> = {
  Ativo: 'bg-green-100 text-green-700',
  Inativo: 'bg-beetz-dark/10 text-beetz-dark/50',
  Bloqueado: 'bg-red-100 text-red-700'
}

function money(v: number) {
  return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 })
}

function formatDate(d: string | null) {
  if (!d) return '—'
  const [y, m, day] = d.split('-')
  return `${day}/${m}/${y}`
}

export default function ProducerDetail() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { accessRole } = useAuth()
  const [producer, setProducer] = useState<Producer | null>(null)
  const [stats, setStats] = useState<ProducerStats | null>(null)
  const [events, setEvents] = useState<EventItem[]>([])
  const [loading, setLoading] = useState(true)
  const [editing, setEditing] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function load() {
    if (!id) return
    setLoading(true)
    try {
      const p = await getProducerById(id)
      setProducer(p)
      if (p) {
        const { stats: s, events: ev } = await getProducerStats(id)
        setStats(s)
        setEvents(ev)
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao carregar.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [id])

  if (!canViewFinancialSummary(accessRole)) {
    return (
      <div className="bg-white rounded-2xl p-8 shadow-soft border border-beetz-dark/5 text-center">
        <p className="text-4xl mb-3">🔒</p>
        <h1 className="text-xl font-bold mb-1">Acesso restrito</h1>
        <p className="text-sm text-beetz-dark/60">Essa área é exclusiva para a Diretoria.</p>
      </div>
    )
  }

  if (loading) return <p className="text-beetz-dark/50 p-8">Carregando...</p>
  if (!producer) return <p className="text-beetz-dark/50 p-8">Produtora não encontrada.</p>

  const status = (producer.status ?? 'Ativo') as ProducerStatus
  const eventsWithoutRevenue = events.filter((e) => !Number(e.sales_amount) && e.status === 'Concluído').length

  async function handleDelete() {
    try {
      await deleteProducer(producer!.id)
      navigate('/produtoras')
    } catch (err: any) {
      // Evento aponta pra produtora — o banco barra a exclusão.
      setError(
        err?.message?.includes('foreign key')
          ? 'Não dá pra apagar: essa produtora tem eventos vinculados. Marque como Inativa pra tirar da seleção sem perder o histórico.'
          : (err?.message ?? 'Erro ao apagar.')
      )
      setConfirmDelete(false)
    }
  }

  return (
    <div className="space-y-6 max-w-4xl">
      <Link to="/produtoras" className="text-sm text-beetz-dark/50 hover:text-beetz-dark">← Voltar para produtoras</Link>

      {error && (
        <div className="flex items-start gap-2 bg-red-50 border border-red-100 text-red-700 text-sm rounded-2xl p-4">
          <AlertTriangle size={16} className="shrink-0 mt-0.5" /> {error}
        </div>
      )}

      <div className="bg-white rounded-3xl shadow-soft border border-beetz-dark/5 p-6 md:p-8">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-2xl honey-gradient flex items-center justify-center font-extrabold text-beetz-dark">
              {producer.name.slice(0, 2).toUpperCase()}
            </div>
            <div>
              <h1 className="text-2xl font-extrabold leading-tight">{producer.name}</h1>
              <div className="flex flex-wrap items-center gap-2 mt-1">
                <span className={`text-xs font-semibold px-2.5 py-1 rounded-full ${STATUS_STYLES[status]}`}>{status}</span>
                {producer.company_name && <span className="text-sm text-beetz-dark/50">{producer.company_name}</span>}
                {producer.auth_user_id && (
                  <span className="flex items-center gap-1 text-xs text-beetz-dark/40" title="Tem acesso ao portal do produtor">
                    <ShieldCheck size={12} /> acessa o portal
                  </span>
                )}
              </div>
            </div>
          </div>
          <div className="flex gap-2">
            <button onClick={() => setEditing(true)} className="flex items-center gap-1.5 text-sm font-semibold text-beetz-dark/70 border border-beetz-dark/15 px-3 py-2 rounded-xl hover:bg-beetz-gray">
              <Pencil size={13} /> Editar
            </button>
            {confirmDelete ? (
              <>
                <button onClick={handleDelete} className="text-sm font-semibold bg-red-600 text-white px-3 py-2 rounded-xl hover:bg-red-700">
                  Confirmar
                </button>
                <button onClick={() => setConfirmDelete(false)} className="text-sm font-semibold text-beetz-dark/50 px-3 py-2 rounded-xl hover:bg-beetz-gray">
                  Cancelar
                </button>
              </>
            ) : (
              <button onClick={() => setConfirmDelete(true)} className="flex items-center gap-1.5 text-sm font-semibold text-red-600 border border-red-100 bg-red-50 px-3 py-2 rounded-xl hover:bg-red-100">
                <Trash2 size={13} />
              </button>
            )}
          </div>
        </div>

        <div className="grid sm:grid-cols-2 gap-x-6 gap-y-2 mt-6 text-sm">
          <p className="flex items-center gap-2 text-beetz-dark/70"><Mail size={14} className="text-beetz-dark/30" /> {producer.email}</p>
          {producer.phone && <p className="flex items-center gap-2 text-beetz-dark/70"><Phone size={14} className="text-beetz-dark/30" /> {producer.phone}{producer.phone_secondary ? ` · ${producer.phone_secondary}` : ''}</p>}
          {producer.responsible_name && <p className="flex items-center gap-2 text-beetz-dark/70"><User size={14} className="text-beetz-dark/30" /> {producer.responsible_name}</p>}
          {(producer.city || producer.address) && (
            <p className="flex items-center gap-2 text-beetz-dark/70">
              <MapPin size={14} className="text-beetz-dark/30" />
              {[producer.address, producer.city, producer.state].filter(Boolean).join(' · ')}
            </p>
          )}
          {producer.instagram && <p className="flex items-center gap-2 text-beetz-dark/70"><Instagram size={14} className="text-beetz-dark/30" /> {producer.instagram}</p>}
          {producer.cpf_cnpj && <p className="flex items-center gap-2 text-beetz-dark/70"><Building2 size={14} className="text-beetz-dark/30" /> {producer.cpf_cnpj}</p>}
          {producer.partner_since && <p className="flex items-center gap-2 text-beetz-dark/70"><CalendarDays size={14} className="text-beetz-dark/30" /> Parceira desde {formatDate(producer.partner_since)}</p>}
        </div>

        {producer.internal_notes && (
          <div className="mt-5 bg-beetz-dark text-white rounded-2xl p-4">
            <p className="text-xs font-bold text-beetz-yellow flex items-center gap-1.5 mb-1.5">
              <Lock size={11} /> Anotações internas · só Diretoria
            </p>
            <p className="text-sm text-white/80 whitespace-pre-wrap leading-relaxed">{producer.internal_notes}</p>
          </div>
        )}
      </div>

      {stats && (
        <div>
          <h2 className="font-bold mb-3">Números</h2>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <div className="bg-white rounded-2xl p-4 shadow-soft border border-beetz-dark/5">
              <p className="text-2xl font-extrabold leading-none">{stats.eventCount}</p>
              <p className="text-xs text-beetz-dark/50 mt-1.5">Eventos</p>
            </div>
            <div className="bg-white rounded-2xl p-4 shadow-soft border border-beetz-dark/5">
              <p className="text-2xl font-extrabold leading-none">{money(stats.totalRevenue)}</p>
              <p className="text-xs text-beetz-dark/50 mt-1.5">Faturamento lançado</p>
            </div>
            <div className="bg-white rounded-2xl p-4 shadow-soft border border-beetz-dark/5">
              <p className="text-2xl font-extrabold leading-none">{money(stats.totalExpenses)}</p>
              <p className="text-xs text-beetz-dark/50 mt-1.5">Custos</p>
            </div>
            <div className="bg-white rounded-2xl p-4 shadow-soft border border-beetz-dark/5">
              <p className="text-2xl font-extrabold leading-none">{money(stats.totalRepasses)}</p>
              <p className="text-xs text-beetz-dark/50 mt-1.5">Repasses pagos</p>
            </div>
          </div>
          {/* Mesmo aviso do dashboard: sem faturamento lançado, "média por
              evento" seria um zero convincente e falso. */}
          {eventsWithoutRevenue > 0 && (
            <p className="text-xs text-beetz-dark/50 mt-2 flex items-center gap-1.5">
              <AlertTriangle size={12} />
              {eventsWithoutRevenue} evento(s) concluído(s) sem faturamento lançado — os números acima estão incompletos.
            </p>
          )}
        </div>
      )}

      <div>
        <h2 className="font-bold mb-3">Eventos</h2>
        {events.length === 0 ? (
          <p className="text-sm text-beetz-dark/50 bg-white rounded-2xl p-6 text-center border border-beetz-dark/5">
            Nenhum evento vinculado a essa produtora ainda. Vincule no formulário do evento.
          </p>
        ) : (
          <div className="bg-white rounded-2xl shadow-soft border border-beetz-dark/5 divide-y divide-beetz-dark/5">
            {events.map((e) => (
              <Link key={e.id} to={`/eventos/${e.id}`} className="flex flex-wrap items-center gap-3 p-4 hover:bg-beetz-gray/50">
                <div className="flex-1 min-w-[160px]">
                  <p className="font-semibold text-sm">{e.name}</p>
                  <p className="text-xs text-beetz-dark/45">{formatDate(e.event_date)}{e.location ? ` · ${e.location}` : ''}</p>
                </div>
                <span className="text-xs font-semibold bg-beetz-yellow/25 text-beetz-dark px-2.5 py-1 rounded-full">{e.status}</span>
                <span className="text-sm font-bold w-24 text-right">{money(Number(e.sales_amount) || 0)}</span>
              </Link>
            ))}
          </div>
        )}
      </div>

      {editing && (
        <ProducerFormModal
          producer={producer}
          onClose={() => setEditing(false)}
          onSave={async (data) => {
            await updateProducer(producer.id, data)
            await load()
          }}
        />
      )}
    </div>
  )
}
