import { useState } from 'react'
import { Lock, Save, X } from 'lucide-react'
import type { Producer, ProducerStatus } from '../../lib/types'
import type { NewProducerInput } from '../../lib/dataService'

const inputClass = 'w-full rounded-xl border border-beetz-dark/15 text-sm px-3 py-2 focus:outline-none focus:ring-2 focus:ring-beetz-yellow'

interface Props {
  producer?: Producer
  onClose: () => void
  onSave: (data: NewProducerInput) => Promise<void>
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

// Ficha da produtora. Serve pra criar (Diretoria) e editar.
export default function ProducerFormModal({ producer, onClose, onSave }: Props) {
  const [form, setForm] = useState({
    name: producer?.name ?? '',
    company_name: producer?.company_name ?? '',
    cpf_cnpj: producer?.cpf_cnpj ?? '',
    email: producer?.email ?? '',
    phone: producer?.phone ?? '',
    phone_secondary: producer?.phone_secondary ?? '',
    responsible_name: producer?.responsible_name ?? '',
    instagram: producer?.instagram ?? '',
    website: producer?.website ?? '',
    address: producer?.address ?? '',
    city: producer?.city ?? '',
    state: producer?.state ?? '',
    partner_since: producer?.partner_since ?? '',
    status: (producer?.status ?? 'Ativo') as ProducerStatus,
    internal_notes: producer?.internal_notes ?? ''
  })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  function set<K extends keyof typeof form>(key: K, value: (typeof form)[K]) {
    setForm((f) => ({ ...f, [key]: value }))
  }

  async function handleSave() {
    if (!form.name.trim() || !form.email.trim()) return
    setSaving(true)
    setError(null)
    try {
      await onSave({
        name: form.name.trim(),
        email: form.email.trim().toLowerCase(),
        company_name: form.company_name.trim() || null,
        cpf_cnpj: form.cpf_cnpj.trim() || null,
        phone: form.phone.trim() || null,
        phone_secondary: form.phone_secondary.trim() || null,
        responsible_name: form.responsible_name.trim() || null,
        instagram: form.instagram.trim() || null,
        website: form.website.trim() || null,
        address: form.address.trim() || null,
        city: form.city.trim() || null,
        state: form.state.trim() || null,
        partner_since: form.partner_since || null,
        status: form.status,
        internal_notes: form.internal_notes.trim() || null
      })
      onClose()
    } catch (err: any) {
      // O e-mail é único: é ele que liga a ficha ao login quando o produtor
      // entrar no portal. Duplicar quebraria essa ponte.
      const msg = err?.message ?? 'Erro ao salvar.'
      setError(msg.includes('producers_email_key') ? 'Já existe uma produtora com esse e-mail.' : msg)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-end sm:items-center justify-center p-0 sm:p-4" onClick={onClose}>
      <div
        className="bg-white w-full sm:max-w-2xl rounded-t-3xl sm:rounded-3xl max-h-[92vh] overflow-y-auto"
        onClick={(e: React.MouseEvent) => e.stopPropagation()}
      >
        <div className="sticky top-0 bg-white flex items-center justify-between px-5 py-4 border-b border-beetz-dark/5 z-10">
          <h2 className="font-extrabold">{producer ? 'Editar produtora' : 'Nova produtora'}</h2>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-beetz-gray" aria-label="Fechar"><X size={18} /></button>
        </div>

        <div className="p-5 space-y-5">
          <div>
            <p className="text-xs font-bold text-beetz-dark/40 uppercase tracking-wide mb-2">Identificação</p>
            <div className="grid sm:grid-cols-2 gap-3">
              <Field label="Nome *">
                <input className={inputClass} value={form.name} onChange={(e) => set('name', e.target.value)} placeholder="Ex: Acontece Produções" />
              </Field>
              <Field label="Razão social / empresa">
                <input className={inputClass} value={form.company_name} onChange={(e) => set('company_name', e.target.value)} />
              </Field>
              <Field label="CPF / CNPJ">
                <input className={inputClass} value={form.cpf_cnpj} onChange={(e) => set('cpf_cnpj', e.target.value)} />
              </Field>
              <Field label="Status">
                <select className={inputClass} value={form.status} onChange={(e) => set('status', e.target.value as ProducerStatus)}>
                  <option value="Ativo">Ativo</option>
                  <option value="Inativo">Inativo</option>
                  <option value="Bloqueado">Bloqueado</option>
                </select>
              </Field>
            </div>
          </div>

          <div>
            <p className="text-xs font-bold text-beetz-dark/40 uppercase tracking-wide mb-2">Contato</p>
            <div className="grid sm:grid-cols-2 gap-3">
              <Field
                label="E-mail *"
                hint="É por ele que a ficha se liga ao login quando o produtor entrar no portal."
              >
                <input type="email" className={inputClass} value={form.email} onChange={(e) => set('email', e.target.value)} />
              </Field>
              <Field label="Responsável">
                <input className={inputClass} value={form.responsible_name} onChange={(e) => set('responsible_name', e.target.value)} placeholder="Quem fala com a Beetz" />
              </Field>
              <Field label="Telefone">
                <input className={inputClass} value={form.phone} onChange={(e) => set('phone', e.target.value)} />
              </Field>
              <Field label="Telefone secundário">
                <input className={inputClass} value={form.phone_secondary} onChange={(e) => set('phone_secondary', e.target.value)} />
              </Field>
              <Field label="Instagram">
                <input className={inputClass} value={form.instagram} onChange={(e) => set('instagram', e.target.value)} placeholder="@produtora" />
              </Field>
              <Field label="Site">
                <input className={inputClass} value={form.website} onChange={(e) => set('website', e.target.value)} placeholder="https://" />
              </Field>
            </div>
          </div>

          <div>
            <p className="text-xs font-bold text-beetz-dark/40 uppercase tracking-wide mb-2">Localização e parceria</p>
            <div className="grid sm:grid-cols-2 gap-3">
              <Field label="Endereço">
                <input className={inputClass} value={form.address} onChange={(e) => set('address', e.target.value)} />
              </Field>
              <div className="grid grid-cols-3 gap-3">
                <div className="col-span-2">
                  <Field label="Cidade">
                    <input className={inputClass} value={form.city} onChange={(e) => set('city', e.target.value)} />
                  </Field>
                </div>
                <Field label="UF">
                  <input className={inputClass} maxLength={2} value={form.state} onChange={(e) => set('state', e.target.value.toUpperCase())} />
                </Field>
              </div>
              <Field label="Parceira desde">
                <input type="date" className={inputClass} value={form.partner_since} onChange={(e) => set('partner_since', e.target.value)} />
              </Field>
            </div>
          </div>

          <div>
            <p className="text-xs font-bold text-beetz-dark/40 uppercase tracking-wide mb-2 flex items-center gap-1.5">
              <Lock size={11} /> Anotações internas
            </p>
            <textarea
              className={`${inputClass} resize-y`}
              rows={3}
              value={form.internal_notes}
              onChange={(e) => set('internal_notes', e.target.value)}
              placeholder="Paga em dia? Exige o quê? Alguma dor de cabeça?"
            />
            <p className="text-[11px] text-beetz-dark/40 mt-1">
              Só a Diretoria vê. Nunca aparece no portal do produtor.
            </p>
          </div>

          {error && <p className="text-sm text-red-600">{error}</p>}

          <div className="flex gap-2 pt-1">
            <button
              onClick={handleSave}
              disabled={saving || !form.name.trim() || !form.email.trim()}
              className="flex items-center gap-1.5 honey-gradient text-beetz-dark font-bold px-5 py-2.5 rounded-xl text-sm disabled:opacity-60"
            >
              <Save size={14} /> {saving ? 'Salvando...' : 'Salvar'}
            </button>
            <button onClick={onClose} className="text-sm font-semibold text-beetz-dark/50 px-4 py-2.5 rounded-xl hover:bg-beetz-gray">
              Cancelar
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
