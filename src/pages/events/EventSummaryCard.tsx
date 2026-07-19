import { useEffect, useState } from 'react'
import { Building2, History, Link as LinkIcon, MapPin, Music, Pencil, Save, Trash2, User, X } from 'lucide-react'
import { Link, useNavigate } from 'react-router-dom'
import { deleteEvent, listProducers, listProfiles, updateEvent } from '../../lib/dataService'
import { useAuth } from '../../contexts/AuthContext'
import type { EventItem, EventStatus, Producer, Profile } from '../../lib/types'
import FileField from '../../components/ui/FileField'
import StaffingRequirementsEditor from './StaffingRequirementsEditor'
import EventChangeLog from './EventChangeLog'

const inputClass = 'w-full border border-beetz-dark/15 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-beetz-yellow'
const STATUSES: EventStatus[] = ['Planejado', 'Confirmado', 'Em andamento', 'Concluído', 'Cancelado']

function formatDate(d: string | null) {
  if (!d) return null
  return new Date(d + 'T00:00:00').toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' })
}

function Field({ label, children, hint }: { label: string; children: React.ReactNode; hint?: string }) {
  return (
    <div>
      <label className="text-xs font-semibold text-beetz-dark/60 mb-1 block">{label}</label>
      {children}
      {hint && <p className="text-[11px] text-beetz-dark/40 mt-1">{hint}</p>}
    </div>
  )
}

interface Props {
  event: EventItem
  canEdit: boolean
  onSaved: (updated: EventItem) => void
  onStaffingChanged?: () => void
}

// Formulário de edição do evento.
//
// Até aqui, nome, data, local, cidade, status e líder eram definidos na criação
// e NUNCA mais podiam mudar — nenhuma tela chamava updateEvent com esses campos.
// Data errada não tinha conserto e o status ficava preso em "Planejado" pra
// sempre. Agora tudo é editável, e cada mudança nesses campos entra no
// histórico (trigger no banco), porque mexer em data/status respinga no
// financeiro e na escala.
export default function EventSummaryCard({ event, canEdit, onSaved, onStaffingChanged }: Props) {
  const navigate = useNavigate()
  const { accessRole } = useAuth()
  const [removingEvent, setRemovingEvent] = useState(false)

  // Excluir evento derruba TUDO que é dele (a RLS só deixa a Diretoria).
  // Confirmação digitando o nome: exclusão em cascata não merece um clique só.
  async function handleDeleteEvent() {
    const typed = window.prompt(
      `Excluir o evento e TUDO que pertence a ele (despesas, recebimentos, escala, produtos, repasses)?\n` +
      `Os movimentos de estoque do almoxarifado ficam.\n\nDigite o nome do evento pra confirmar:\n${event.name}`
    )
    if (typed === null) return
    if (typed.trim().toLowerCase() !== event.name.trim().toLowerCase()) {
      window.alert('O nome não bate — exclusão cancelada.')
      return
    }
    setRemovingEvent(true)
    try {
      await deleteEvent(event.id)
      navigate('/eventos')
    } catch (e) {
      window.alert(e instanceof Error ? e.message : 'Não foi possível excluir (pode ser falta de permissão).')
      setRemovingEvent(false)
    }
  }
  const [editing, setEditing] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [producers, setProducers] = useState<Producer[]>([])
  const [profiles, setProfiles] = useState<Profile[]>([])

  const [form, setForm] = useState({
    name: event.name ?? '',
    event_date: event.event_date ?? '',
    location: event.location ?? '',
    city: event.city ?? '',
    status: (event.status ?? 'Planejado') as EventStatus,
    leader_id: event.leader_id ?? '',
    producer_id: event.producer_id ?? '',
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

  useEffect(() => {
    if (!editing) return
    Promise.all([listProducers(), listProfiles()]).then(([prods, profs]) => {
      setProducers(prods)
      setProfiles(profs)
    }).catch(() => { /* seletores ficam vazios; o resto do form continua utilizável */ })
  }, [editing])

  function set<K extends keyof typeof form>(key: K, value: (typeof form)[K]) {
    setForm((f) => ({ ...f, [key]: value }))
  }

  async function handleSave() {
    if (!form.name.trim() || !form.event_date) {
      setError('Nome e data são obrigatórios.')
      return
    }
    setSaving(true)
    setError(null)
    try {
      const updated = await updateEvent(event.id, {
        name: form.name.trim(),
        event_date: form.event_date,
        location: form.location.trim() || null,
        city: form.city.trim() || null,
        status: form.status,
        leader_id: form.leader_id || null,
        producer_id: form.producer_id || null,
        // Só sobrevive enquanto houver evento antigo sem vínculo. Assim que a
        // produtora é selecionada, o texto livre para de ser usado.
        producer_name: form.producer_id ? null : (form.producer_name.trim() || null),
        producer_auth_email: form.producer_auth_email.trim() || null,
        producer_auth_email_secondary: form.producer_auth_email_secondary.trim() || null,
        address: form.address.trim() || null,
        start_time: form.start_time || null,
        end_date: form.end_date || null,
        end_time: form.end_time || null,
        link: form.link.trim() || null,
        music_style: form.music_style.trim() || null,
        flyer_url: form.flyer_url
      })
      setEditing(false)
      onSaved(updated)
    } catch (err: any) {
      setError(err?.message ?? 'Erro ao salvar.')
    } finally {
      setSaving(false)
    }
  }

  const hasDateRange = event.end_date && event.end_date !== event.event_date
  const period = [
    formatDate(event.event_date), event.start_time,
    hasDateRange ? `→ ${formatDate(event.end_date)}` : null,
    event.end_time ? `${hasDateRange ? '' : '– '}${event.end_time}` : null
  ].filter(Boolean).join(' ')

  const linkedProducer = producers.find((p) => p.id === event.producer_id)
  const leader = profiles.find((p) => p.id === event.leader_id)

  return (
    <div className="bg-white rounded-3xl shadow-soft border border-beetz-dark/5 overflow-hidden">
      {/* Capa no mesmo padrão do perfil: o flyer vira o fundo do cabeçalho,
          com status e edição flutuando sobre ele e o título no rodapé da
          imagem. Sem flyer, o gradiente escuro da casa assume — o cartão
          nunca fica sem identidade. Tocar na capa abre o flyer inteiro. */}
      <div className={`h-40 md:h-52 relative ${event.flyer_url ? 'bg-beetz-dark' : 'dark-gradient'}`}>
        {event.flyer_url && (
          <a href={event.flyer_url} target="_blank" rel="noreferrer" title="Abrir o flyer inteiro">
            <img src={event.flyer_url} alt="Flyer do evento" className="absolute inset-0 w-full h-full object-cover" />
          </a>
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/20 to-transparent pointer-events-none" />
        <span className="absolute top-4 left-4 text-xs font-semibold bg-beetz-yellow text-beetz-dark px-2.5 py-1 rounded-full shadow">
          {event.status}
        </span>
        {canEdit && !editing && (
          <button
            onClick={() => setEditing(true)}
            className="absolute top-4 right-4 flex items-center gap-1.5 text-xs font-semibold bg-white/90 backdrop-blur text-beetz-dark px-3 py-2 rounded-xl hover:bg-white transition-colors shadow"
          >
            <Pencil size={13} /> Editar evento
          </button>
        )}
        <h1 className="absolute bottom-3 left-5 right-5 text-2xl md:text-3xl font-extrabold text-white drop-shadow-md leading-tight pointer-events-none">
          {event.name}
        </h1>
      </div>

      <div className="p-6 md:p-8 pt-5">
      {!editing ? (
        <>
          <div className="grid sm:grid-cols-3 gap-4 mt-5 text-sm">
            <div><p className="text-beetz-dark/50">Data</p><p className="font-semibold">{period}</p></div>
            <div><p className="text-beetz-dark/50">Local</p><p className="font-semibold">{event.location || '—'}</p></div>
            <div><p className="text-beetz-dark/50">Cidade</p><p className="font-semibold">{event.city || '—'}</p></div>
          </div>

          {(event.producer_id || event.producer_name || event.address || event.music_style || event.link || event.leader_id) && (
            <div className="grid sm:grid-cols-3 gap-4 mt-4 pt-4 border-t border-beetz-dark/5 text-sm">
              {(event.producer_id || event.producer_name) && (
                <div>
                  <p className="text-beetz-dark/50 flex items-center gap-1"><Building2 size={12} /> Produtora</p>
                  {event.producer_id ? (
                    <Link to={`/produtoras/${event.producer_id}`} className="font-semibold underline decoration-beetz-dark/20 hover:decoration-beetz-dark">
                      {linkedProducer?.name ?? 'Ver ficha'}
                    </Link>
                  ) : (
                    // Evento antigo, de quando produtora era texto solto.
                    <p className="font-semibold">
                      {event.producer_name}
                      <span className="block text-[11px] font-normal text-beetz-dark/40">sem ficha vinculada</span>
                    </p>
                  )}
                </div>
              )}
              {event.leader_id && (
                <div>
                  <p className="text-beetz-dark/50 flex items-center gap-1"><User size={12} /> Líder</p>
                  <p className="font-semibold">{leader ? `${leader.first_name} ${leader.last_name ?? ''}` : '—'}</p>
                </div>
              )}
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

          {canEdit && (
            <details className="mt-5 pt-4 border-t border-beetz-dark/5">
              <summary className="text-xs font-semibold text-beetz-dark/50 hover:text-beetz-dark cursor-pointer flex items-center gap-1.5">
                <History size={12} /> Histórico de alterações
              </summary>
              <div className="mt-3">
                <EventChangeLog eventId={event.id} />
              </div>
            </details>
          )}
        </>
      ) : (
        <div className="mt-5 space-y-5">
          <div>
            <p className="text-xs font-bold text-beetz-dark/40 uppercase tracking-wide mb-2">Dados básicos</p>
            <div className="space-y-3">
              <Field label="Nome do evento *">
                <input className={inputClass} value={form.name} onChange={(e) => set('name', e.target.value)} />
              </Field>
              <div className="grid sm:grid-cols-3 gap-3">
                <Field label="Data *">
                  <input type="date" className={inputClass} value={form.event_date} onChange={(e) => set('event_date', e.target.value)} />
                </Field>
                <Field label="Status" hint="Muda a cor e o filtro na lista de eventos.">
                  <select className={inputClass} value={form.status} onChange={(e) => set('status', e.target.value as EventStatus)}>
                    {STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
                  </select>
                </Field>
                <Field label="Líder do evento">
                  <select className={inputClass} value={form.leader_id} onChange={(e) => set('leader_id', e.target.value)}>
                    <option value="">Sem líder definido</option>
                    {profiles.map((p) => <option key={p.id} value={p.id}>{p.first_name} {p.last_name}</option>)}
                  </select>
                </Field>
              </div>
              <div className="grid sm:grid-cols-2 gap-3">
                <Field label="Local">
                  <input className={inputClass} value={form.location} onChange={(e) => set('location', e.target.value)} />
                </Field>
                <Field label="Cidade">
                  <input className={inputClass} value={form.city} onChange={(e) => set('city', e.target.value)} />
                </Field>
              </div>
            </div>
          </div>

          <div className="border-t border-beetz-dark/5 pt-4">
            <p className="text-xs font-bold text-beetz-dark/40 uppercase tracking-wide mb-2">Produtora</p>
            <div className="space-y-3">
              <Field
                label="Produtora"
                hint="Selecione a ficha cadastrada. É isso que permite ver o histórico e os números dela."
              >
                <select className={inputClass} value={form.producer_id} onChange={(e) => set('producer_id', e.target.value)}>
                  <option value="">Nenhuma produtora vinculada</option>
                  {producers.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}{p.company_name ? ` · ${p.company_name}` : ''}{(p.status ?? 'Ativo') !== 'Ativo' ? ` (${p.status})` : ''}
                    </option>
                  ))}
                </select>
              </Field>

              {/* Texto livre só aparece pra evento antigo que ainda não foi
                  vinculado — é o campo que criou as duplicatas. Assim que uma
                  ficha é escolhida, ele some e o texto é descartado. */}
              {!form.producer_id && form.producer_name && (
                <div className="bg-beetz-yellow/15 border border-beetz-yellow/40 rounded-xl p-3">
                  <p className="text-xs font-semibold mb-1">Produtora em texto livre: "{form.producer_name}"</p>
                  <p className="text-[11px] text-beetz-dark/60">
                    Esse evento é de antes do cadastro de produtoras. Selecione a ficha acima pra vincular —
                    o texto solto é descartado e o evento passa a contar no histórico dela.{' '}
                    <Link to="/produtoras" className="underline font-semibold">Cadastrar produtora</Link>
                  </p>
                </div>
              )}
              {!form.producer_id && !form.producer_name && (
                <p className="text-[11px] text-beetz-dark/40">
                  Não achou a produtora? <Link to="/produtoras" className="underline font-semibold">Cadastre primeiro</Link> e volte aqui.
                </p>
              )}

              <div className="grid sm:grid-cols-2 gap-3">
                <Field label="E-mail de autorização">
                  <input type="email" className={inputClass} value={form.producer_auth_email} onChange={(e) => set('producer_auth_email', e.target.value)} />
                </Field>
                <Field label="E-mail de autorização secundário">
                  <input type="email" className={inputClass} value={form.producer_auth_email_secondary} onChange={(e) => set('producer_auth_email_secondary', e.target.value)} />
                </Field>
              </div>
            </div>
          </div>

          <div className="border-t border-beetz-dark/5 pt-4">
            <p className="text-xs font-bold text-beetz-dark/40 uppercase tracking-wide mb-2">Horários e local</p>
            <div className="space-y-3">
              <Field label="Endereço do evento">
                <input className={inputClass} value={form.address} onChange={(e) => set('address', e.target.value)} />
              </Field>
              <div className="grid sm:grid-cols-3 gap-3">
                <Field label="Horário inicial">
                  <input type="time" className={inputClass} value={form.start_time} onChange={(e) => set('start_time', e.target.value)} />
                </Field>
                <Field label="Data final" hint="Só se virar a noite.">
                  <input type="date" className={inputClass} value={form.end_date} onChange={(e) => set('end_date', e.target.value)} />
                </Field>
                <Field label="Horário final">
                  <input type="time" className={inputClass} value={form.end_time} onChange={(e) => set('end_time', e.target.value)} />
                </Field>
              </div>
            </div>
          </div>

          <div className="border-t border-beetz-dark/5 pt-4">
            <p className="text-xs font-bold text-beetz-dark/40 uppercase tracking-wide mb-2">Divulgação</p>
            <div className="space-y-3">
              <div className="grid sm:grid-cols-2 gap-3">
                <Field label="Estilo musical">
                  <input className={inputClass} value={form.music_style} onChange={(e) => set('music_style', e.target.value)} />
                </Field>
                <Field label="Link do evento">
                  <input className={inputClass} placeholder="https://" value={form.link} onChange={(e) => set('link', e.target.value)} />
                </Field>
              </div>
              <FileField label="Imagem ou flyer" value={form.flyer_url} onChange={(v) => set('flyer_url', v)} />
            </div>
          </div>

          <div className="border-t border-beetz-dark/5 pt-4">
            <StaffingRequirementsEditor eventId={event.id} onChanged={onStaffingChanged} />
          </div>

          {error && <p className="text-sm text-red-600">{error}</p>}

          <div className="flex flex-wrap items-center gap-2 pt-1">
            {accessRole === 'diretoria' && (
              <button
                onClick={handleDeleteEvent}
                disabled={removingEvent}
                className="flex items-center gap-1.5 text-sm font-semibold text-red-600 hover:bg-red-50 px-3 py-2 rounded-xl disabled:opacity-60"
              >
                <Trash2 size={14} /> {removingEvent ? 'Excluindo...' : 'Excluir evento'}
              </button>
            )}
            <span className="flex-1" />
            <button onClick={() => setEditing(false)} className="flex items-center gap-1.5 text-sm font-semibold text-beetz-dark/50 px-4 py-2">
              <X size={14} /> Fechar edição
            </button>
            <button onClick={handleSave} disabled={saving} className="flex items-center gap-1.5 honey-gradient text-beetz-dark font-bold px-5 py-2 rounded-xl text-sm disabled:opacity-60">
              <Save size={14} /> {saving ? 'Salvando...' : 'Salvar evento'}
            </button>
          </div>
        </div>
      )}
      </div>
    </div>
  )
}
