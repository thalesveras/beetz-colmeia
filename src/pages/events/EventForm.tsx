import { useEffect, useState } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { createEvent, listProfiles } from '../../lib/dataService'
import type { EventStatus, Profile } from '../../lib/types'

const statuses: EventStatus[] = ['Planejado', 'Confirmado', 'Em andamento', 'Concluído', 'Cancelado']

export default function EventForm() {
  const navigate = useNavigate()
  const [profiles, setProfiles] = useState<Profile[]>([])
  const [form, setForm] = useState({
    name: '', event_date: '', location: '', city: '', status: 'Planejado' as EventStatus, leader_id: ''
  })
  const [saving, setSaving] = useState(false)

  useEffect(() => { listProfiles().then(setProfiles) }, [])

  function set<K extends keyof typeof form>(key: K, value: (typeof form)[K]) {
    setForm((f) => ({ ...f, [key]: value }))
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    const created = await createEvent({ ...form, leader_id: form.leader_id || null })
    setSaving(false)
    navigate(`/eventos/${created.id}`)
  }

  return (
    <div className="max-w-xl space-y-6">
      <Link to="/eventos" className="text-sm text-beetz-dark/50 hover:text-beetz-dark">← Voltar para eventos</Link>
      <div>
        <h1 className="text-2xl md:text-3xl font-extrabold">Novo evento</h1>
        <p className="text-beetz-dark/60 mt-1">Cadastre um novo evento da colmeia.</p>
      </div>

      <form onSubmit={handleSubmit} className="bg-white rounded-2xl p-6 shadow-soft border border-beetz-dark/5 space-y-4">
        <div>
          <label className="text-sm font-medium block mb-1">Nome do evento</label>
          <input required value={form.name} onChange={(e) => set('name', e.target.value)} className="w-full border border-beetz-dark/15 rounded-xl px-4 py-2.5" />
        </div>
        <div className="grid sm:grid-cols-2 gap-4">
          <div>
            <label className="text-sm font-medium block mb-1">Data</label>
            <input type="date" required value={form.event_date} onChange={(e) => set('event_date', e.target.value)} className="w-full border border-beetz-dark/15 rounded-xl px-4 py-2.5" />
          </div>
          <div>
            <label className="text-sm font-medium block mb-1">Status</label>
            <select value={form.status} onChange={(e) => set('status', e.target.value as EventStatus)} className="w-full border border-beetz-dark/15 rounded-xl px-4 py-2.5">
              {statuses.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>
        </div>
        <div className="grid sm:grid-cols-2 gap-4">
          <div>
            <label className="text-sm font-medium block mb-1">Local</label>
            <input required value={form.location} onChange={(e) => set('location', e.target.value)} className="w-full border border-beetz-dark/15 rounded-xl px-4 py-2.5" />
          </div>
          <div>
            <label className="text-sm font-medium block mb-1">Cidade</label>
            <input required value={form.city} onChange={(e) => set('city', e.target.value)} className="w-full border border-beetz-dark/15 rounded-xl px-4 py-2.5" />
          </div>
        </div>
        <div>
          <label className="text-sm font-medium block mb-1">Líder responsável</label>
          <select value={form.leader_id} onChange={(e) => set('leader_id', e.target.value)} className="w-full border border-beetz-dark/15 rounded-xl px-4 py-2.5">
            <option value="">Selecionar líder...</option>
            {profiles.map((p) => <option key={p.id} value={p.id}>{p.first_name} {p.last_name}</option>)}
          </select>
        </div>
        <button type="submit" disabled={saving} className="w-full honey-gradient text-beetz-dark font-bold py-3 rounded-xl disabled:opacity-60">
          {saving ? 'Salvando...' : 'Criar evento'}
        </button>
      </form>
    </div>
  )
}
