import { useEffect, useState } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { ChevronDown } from 'lucide-react'
import { createEvent, listProfiles } from '../../lib/dataService'
import type { EventStatus, Profile } from '../../lib/types'

const statuses: EventStatus[] = ['Planejado', 'Confirmado', 'Em andamento', 'Concluído', 'Cancelado']

// Campos uniformes: mesma altura, mesmo branco, mesmo anel de foco — no
// celular o iOS pintava date/select de cinza nativo e o campo de data ainda
// estourava o cartão (largura intrínseca do WebKit; domada no index.css).
// min-w-0 em tudo: célula de grid nunca cresce além do cartão.
const CAMPO =
  'w-full min-w-0 bg-white border border-beetz-dark/15 rounded-xl px-4 py-3 ' +
  'focus:outline-none focus:ring-2 focus:ring-beetz-yellow'
const ROTULO = 'text-sm font-semibold block mb-1.5'

// Select com seta própria: appearance-none apaga a nativa (e o cinza do iOS
// junto), o ChevronDown entra por cima, imune a clique.
function Select({ value, onChange, children }: {
  value: string
  onChange: (v: string) => void
  children: React.ReactNode
}) {
  return (
    <div className="relative">
      <select value={value} onChange={(e) => onChange(e.target.value)} className={`${CAMPO} appearance-none pr-10`}>
        {children}
      </select>
      <ChevronDown size={17} className="absolute right-3.5 top-1/2 -translate-y-1/2 text-beetz-dark/40 pointer-events-none" />
    </div>
  )
}

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
    <div className="max-w-xl space-y-4 sm:space-y-6">
      <Link to="/eventos" className="inline-block text-sm text-beetz-dark/50 hover:text-beetz-dark py-1">← Voltar para eventos</Link>
      <div>
        <h1 className="text-2xl md:text-3xl font-extrabold">Novo evento</h1>
        <p className="text-beetz-dark/60 mt-1 text-sm sm:text-base">Cadastre um novo evento da colmeia.</p>
      </div>

      <form onSubmit={handleSubmit} className="bg-white rounded-2xl p-5 sm:p-6 shadow-soft border border-beetz-dark/5 space-y-4 overflow-hidden">
        <div className="min-w-0">
          <label className={ROTULO}>Nome do evento</label>
          <input
            required
            value={form.name}
            onChange={(e) => set('name', e.target.value)}
            placeholder="Ex.: 2407 Vamos Festejar"
            className={CAMPO}
          />
        </div>
        <div className="grid sm:grid-cols-2 gap-4">
          <div className="min-w-0">
            <label className={ROTULO}>Data</label>
            <input
              type="date"
              required
              value={form.event_date}
              onChange={(e) => set('event_date', e.target.value)}
              className={CAMPO}
            />
          </div>
          <div className="min-w-0">
            <label className={ROTULO}>Status</label>
            <Select value={form.status} onChange={(v) => set('status', v as EventStatus)}>
              {statuses.map((s) => <option key={s} value={s}>{s}</option>)}
            </Select>
          </div>
        </div>
        <div className="grid sm:grid-cols-2 gap-4">
          <div className="min-w-0">
            <label className={ROTULO}>Local</label>
            <input
              required
              value={form.location}
              onChange={(e) => set('location', e.target.value)}
              placeholder="Ex.: Convento das Mercês"
              className={CAMPO}
            />
          </div>
          <div className="min-w-0">
            <label className={ROTULO}>Cidade</label>
            <input
              required
              value={form.city}
              onChange={(e) => set('city', e.target.value)}
              placeholder="Ex.: São Luís"
              className={CAMPO}
            />
          </div>
        </div>
        <div className="min-w-0">
          <label className={ROTULO}>Líder responsável <span className="font-normal text-beetz-dark/40">(opcional)</span></label>
          <Select value={form.leader_id} onChange={(v) => set('leader_id', v)}>
            <option value="">Selecionar líder...</option>
            {profiles.map((p) => <option key={p.id} value={p.id}>{p.first_name} {p.last_name}</option>)}
          </Select>
        </div>
        <button
          type="submit"
          disabled={saving}
          className="w-full honey-gradient text-beetz-dark font-bold py-3.5 rounded-xl disabled:opacity-60 active:scale-[0.99] transition-transform"
        >
          {saving ? 'Salvando...' : 'Criar evento'}
        </button>
      </form>
    </div>
  )
}
