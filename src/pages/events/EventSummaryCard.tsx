import { useState } from 'react'
import { Pencil, Link as LinkIcon, MapPin, Music, Save, X } from 'lucide-react'
import { updateEvent } from '../../lib/dataService'
import type { EventItem } from '../../lib/types'
import FileField from '../../components/ui/FileField'

const inputClass = 'w-full border border-beetz-dark/15 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-beetz-yellow'

function formatDate(d: string | null) {
  if (!d) return null
  return new Date(d + 'T00:00:00').toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' })
}

interface Props {
  event: EventItem
  canEdit: boolean
  onSaved: (updated: EventItem) => void
}

export default function EventSummaryCard({ event, canEdit, onSaved }: Props) {
  const [editing, setEditing] = useState(false)
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState({
    producer_name: event.producer_name ?? '',
    producer_auth_email: event.producer_auth_email ?? '',
    producer_auth_email_secondary: event.producer_auth_email_secondary ?? '',
    address: event.address ?? '',
    start_time: event.start_time ?? '',
    end_date: event.end_date ?? '',
    end_time: event.end_time ?? '',
    link: event.link ?? '',
    music_style: event.music_style ?? '',
    flyer_url: event.flyer_url
  })

  function set<K extends keyof typeof form>(key: K, value: (typeof form)[K]) {
    setForm((f) => ({ ...f, [key]: value }))
  }

  async function handleSave() {
    setSaving(true)
    const updated = await updateEvent(event.id, {
      producer_name: form.producer_name || null,
      producer_auth_email: form.producer_auth_email || null,
      producer_auth_email_secondary: form.producer_auth_email_secondary || null,
      address: form.address || null,
      start_time: form.start_time || null,
      end_date: form.end_date || null,
      end_time: form.end_time || null,
      link: form.link || null,
      music_style: form.music_style || null,
      flyer_url: form.flyer_url
    })
    setSaving(false)
    setEditing(false)
    onSaved(updated)
  }

  const hasDateRange = event.end_date && event.end_date !== event.event_date
  const period = [
    formatDate(event.event_date), event.start_time,
    hasDateRange ? `→ ${formatDate(event.end_date)}` : null,
    event.end_time ? `${hasDateRange ? '' : '– '}${event.end_time}` : null
  ].filter(Boolean).join(' ')

  return (
    <div className="bg-white rounded-3xl shadow-soft border border-beetz-dark/5 p-6 md:p-8">
      <div className="flex items-start justify-between gap-3">
        <div>
          <span className="text-xs font-semibold bg-beetz-yellow/30 text-beetz-dark px-2.5 py-1 rounded-full">{event.status}</span>
          <h1 className="text-2xl md:text-3xl font-extrabold mt-3">{event.name}</h1>
        </div>
        {canEdit && !editing && (
          <button
            onClick={() => setEditing(true)}
            className="flex items-center gap-1.5 text-xs font-semibold text-beetz-dark/60 hover:text-beetz-dark bg-beetz-gray px-3 py-2 rounded-xl shrink-0"
          >
            <Pencil size={13} /> Editar resumo
          </button>
        )}
      </div>

      {!editing ? (
        <>
          <div className="grid sm:grid-cols-3 gap-4 mt-5 text-sm">
            <div><p className="text-beetz-dark/50">Data</p><p className="font-semibold">{period}</p></div>
            <div><p className="text-beetz-dark/50">Local</p><p className="font-semibold">{event.location}</p></div>
            <div><p className="text-beetz-dark/50">Cidade</p><p className="font-semibold">{event.city}</p></div>
          </div>

          {(event.producer_name || event.address || event.music_style || event.link) && (
            <div className="grid sm:grid-cols-3 gap-4 mt-4 pt-4 border-t border-beetz-dark/5 text-sm">
              {event.producer_name && <div><p className="text-beetz-dark/50">Produtora</p><p className="font-semibold">{event.producer_name}</p></div>}
              {event.address && (
                <div>
                  <p className="text-beetz-dark/50 flex items-center gap-1"><MapPin size={12} /> Endereço</p>
                  <p className="font-semibold">{event.address}</p>
                </div>
              )}
              {event.music_style && (
                <div>
                  <p className="text-beetz-dark/50 flex items-center gap-1"><Music size={12} /> Estilo musical</p>
                  <p className="font-semibold">{event.music_style}</p>
                </div>
              )}
              {event.link && (
                <div className="sm:col-span-3">
                  <p className="text-beetz-dark/50 flex items-center gap-1"><LinkIcon size={12} /> Link</p>
                  <a href={event.link} target="_blank" rel="noreferrer" className="font-semibold text-beetz-dark underline break-all">{event.link}</a>
                </div>
              )}
            </div>
          )}

          {event.flyer_url && (
            <img src={event.flyer_url} alt="Flyer do evento" className="mt-4 max-h-56 rounded-xl border border-beetz-dark/10" />
          )}
        </>
      ) : (
        <div className="mt-5 space-y-4">
          <div className="grid sm:grid-cols-2 gap-4">
            <div>
              <label className="text-sm font-medium block mb-1">Produtora</label>
              <input className={inputClass} value={form.producer_name} onChange={(e) => set('producer_name', e.target.value)} />
            </div>
            <div>
              <label className="text-sm font-medium block mb-1">Estilo musical</label>
              <input className={inputClass} value={form.music_style} onChange={(e) => set('music_style', e.target.value)} />
            </div>
          </div>
          <div className="grid sm:grid-cols-2 gap-4">
            <div>
              <label className="text-sm font-medium block mb-1">Email de autorização da produtora</label>
              <input type="email" className={inputClass} value={form.producer_auth_email} onChange={(e) => set('producer_auth_email', e.target.value)} />
            </div>
            <div>
              <label className="text-sm font-medium block mb-1">Email de autorização secundário</label>
              <input type="email" className={inputClass} value={form.producer_auth_email_secondary} onChange={(e) => set('producer_auth_email_secondary', e.target.value)} />
            </div>
          </div>
          <div>
            <label className="text-sm font-medium block mb-1">Endereço do evento</label>
            <input className={inputClass} value={form.address} onChange={(e) => set('address', e.target.value)} />
          </div>
          <div className="grid sm:grid-cols-3 gap-4">
            <div>
              <label className="text-sm font-medium block mb-1">Horário inicial</label>
              <input type="time" className={inputClass} value={form.start_time} onChange={(e) => set('start_time', e.target.value)} />
            </div>
            <div>
              <label className="text-sm font-medium block mb-1">Data final</label>
              <input type="date" className={inputClass} value={form.end_date} onChange={(e) => set('end_date', e.target.value)} />
            </div>
            <div>
              <label className="text-sm font-medium block mb-1">Horário final</label>
              <input type="time" className={inputClass} value={form.end_time} onChange={(e) => set('end_time', e.target.value)} />
            </div>
          </div>
          <div>
            <label className="text-sm font-medium block mb-1">Link do evento</label>
            <input className={inputClass} placeholder="https://..." value={form.link} onChange={(e) => set('link', e.target.value)} />
          </div>
          <FileField label="Imagem ou flyer" value={form.flyer_url} onChange={(v) => set('flyer_url', v)} />

          <div className="flex justify-end gap-2 pt-1">
            <button onClick={() => setEditing(false)} className="flex items-center gap-1.5 text-sm font-semibold text-beetz-dark/50 px-4 py-2">
              <X size={14} /> Cancelar
            </button>
            <button onClick={handleSave} disabled={saving} className="flex items-center gap-1.5 honey-gradient text-beetz-dark font-bold px-5 py-2 rounded-xl text-sm disabled:opacity-60">
              <Save size={14} /> {saving ? 'Salvando...' : 'Salvar resumo'}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
