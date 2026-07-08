import { useState } from 'react'
import { X } from 'lucide-react'
import { adminUpdateProfile } from '../../lib/dataService'
import type { ExperienceLevel, Profile } from '../../lib/types'

const inputClass = 'w-full border border-beetz-dark/15 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-beetz-yellow'
const EXPERIENCE_LEVELS: ExperienceLevel[] = ['Nova abelha', 'Em treinamento', 'Colaborador frequente', 'Líder de bar']
const ufs = ['AC', 'AL', 'AP', 'AM', 'BA', 'CE', 'DF', 'ES', 'GO', 'MA', 'MT', 'MS', 'MG', 'PA', 'PB', 'PR', 'PE', 'PI', 'RJ', 'RN', 'RS', 'RO', 'RR', 'SC', 'SP', 'SE', 'TO']

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <div><label className="text-xs font-medium block mb-1 text-beetz-dark/70">{label}</label>{children}</div>
}

interface Props {
  profile: Profile
  onClose: () => void
  onSaved: () => void
}

export default function EditProfileModal({ profile, onClose, onSaved }: Props) {
  const [form, setForm] = useState({
    first_name: profile.first_name || '',
    last_name: profile.last_name || '',
    phone: profile.phone || '',
    birth_date: profile.birth_date || '',
    cpf: profile.cpf || '',
    city: profile.city || '',
    state: profile.state || '',
    mother_name: profile.mother_name || '',
    father_name: profile.father_name || '',
    emergency_contact_name: profile.emergency_contact_name || '',
    emergency_contact_phone: profile.emergency_contact_phone || '',
    role: profile.role || '',
    work_location: profile.work_location || '',
    experience_level: profile.experience_level || '',
    entry_date: profile.entry_date || '',
    skills: profile.skills.join(', '),
    health_conditions: profile.health_conditions || '',
    allergies: profile.allergies || '',
    important_notes: profile.important_notes || '',
    about_me: profile.about_me || '',
    fun_fact: profile.fun_fact || '',
    favorite_events: profile.favorite_events || '',
    instagram: profile.instagram || '',
    personal_quote: profile.personal_quote || ''
  })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  function set<K extends keyof typeof form>(key: K, value: typeof form[K]) {
    setForm((f) => ({ ...f, [key]: value }))
  }

  async function handleSave() {
    setSaving(true)
    setError(null)
    try {
      await adminUpdateProfile(profile.id, {
        first_name: form.first_name.trim(),
        last_name: form.last_name.trim(),
        phone: form.phone.trim() || null,
        birth_date: form.birth_date || null,
        cpf: form.cpf.trim() || null,
        city: form.city.trim() || null,
        state: form.state || null,
        mother_name: form.mother_name.trim() || null,
        father_name: form.father_name.trim() || null,
        emergency_contact_name: form.emergency_contact_name.trim() || null,
        emergency_contact_phone: form.emergency_contact_phone.trim() || null,
        role: form.role.trim() || null,
        work_location: form.work_location.trim() || null,
        experience_level: (form.experience_level || null) as ExperienceLevel | null,
        entry_date: form.entry_date || null,
        skills: form.skills.split(',').map((s) => s.trim()).filter(Boolean),
        health_conditions: form.health_conditions.trim() || null,
        allergies: form.allergies.trim() || null,
        important_notes: form.important_notes.trim() || null,
        about_me: form.about_me.trim() || null,
        fun_fact: form.fun_fact.trim() || null,
        favorite_events: form.favorite_events.trim() || null,
        instagram: form.instagram.trim() || null,
        personal_quote: form.personal_quote.trim() || null
      })
      onSaved()
      onClose()
    } catch (err: any) {
      setError(err?.message ?? 'Erro ao salvar perfil.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div
        className="bg-white rounded-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto shadow-glow"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between p-5 border-b border-beetz-dark/10 sticky top-0 bg-white z-10">
          <h2 className="font-bold text-lg">Editar perfil</h2>
          <button onClick={onClose} className="text-beetz-dark/50 hover:text-beetz-dark"><X size={20} /></button>
        </div>

        <div className="p-5 space-y-5">
          {error && <div className="bg-red-50 border border-red-100 text-red-700 text-sm rounded-xl p-3">{error}</div>}

          <div className="grid sm:grid-cols-2 gap-3">
            <Field label="Nome"><input className={inputClass} value={form.first_name} onChange={(e) => set('first_name', e.target.value)} /></Field>
            <Field label="Sobrenome"><input className={inputClass} value={form.last_name} onChange={(e) => set('last_name', e.target.value)} /></Field>
          </div>
          <div className="grid sm:grid-cols-3 gap-3">
            <Field label="Telefone"><input className={inputClass} value={form.phone} onChange={(e) => set('phone', e.target.value)} /></Field>
            <Field label="Data de nascimento"><input type="date" className={inputClass} value={form.birth_date} onChange={(e) => set('birth_date', e.target.value)} /></Field>
            <Field label="CPF"><input className={inputClass} value={form.cpf} onChange={(e) => set('cpf', e.target.value)} /></Field>
          </div>
          <div className="grid sm:grid-cols-2 gap-3">
            <Field label="Cidade"><input className={inputClass} value={form.city} onChange={(e) => set('city', e.target.value)} /></Field>
            <Field label="Estado">
              <select className={inputClass} value={form.state} onChange={(e) => set('state', e.target.value)}>
                <option value="">Selecionar...</option>
                {ufs.map((uf) => <option key={uf} value={uf}>{uf}</option>)}
              </select>
            </Field>
          </div>

          <div className="border-t border-beetz-dark/10 pt-4 grid sm:grid-cols-2 gap-3">
            <Field label="Nome da mãe"><input className={inputClass} value={form.mother_name} onChange={(e) => set('mother_name', e.target.value)} /></Field>
            <Field label="Nome do pai"><input className={inputClass} value={form.father_name} onChange={(e) => set('father_name', e.target.value)} /></Field>
            <Field label="Contato de emergência (nome)"><input className={inputClass} value={form.emergency_contact_name} onChange={(e) => set('emergency_contact_name', e.target.value)} /></Field>
            <Field label="Contato de emergência (telefone)"><input className={inputClass} value={form.emergency_contact_phone} onChange={(e) => set('emergency_contact_phone', e.target.value)} /></Field>
          </div>

          <div className="border-t border-beetz-dark/10 pt-4 grid sm:grid-cols-2 gap-3">
            <Field label="Função / cargo"><input className={inputClass} value={form.role} onChange={(e) => set('role', e.target.value)} /></Field>
            <Field label="Local de trabalho frequente"><input className={inputClass} value={form.work_location} onChange={(e) => set('work_location', e.target.value)} /></Field>
            <Field label="Nível de experiência">
              <select className={inputClass} value={form.experience_level} onChange={(e) => set('experience_level', e.target.value)}>
                <option value="">Não definido</option>
                {EXPERIENCE_LEVELS.map((lvl) => <option key={lvl} value={lvl}>{lvl}</option>)}
              </select>
            </Field>
            <Field label="Data de entrada"><input type="date" className={inputClass} value={form.entry_date} onChange={(e) => set('entry_date', e.target.value)} /></Field>
          </div>
          <Field label="Habilidades (separadas por vírgula)"><input className={inputClass} value={form.skills} onChange={(e) => set('skills', e.target.value)} /></Field>

          <div className="border-t border-beetz-dark/10 pt-4 grid sm:grid-cols-2 gap-3">
            <Field label="Condições de saúde"><input className={inputClass} value={form.health_conditions} onChange={(e) => set('health_conditions', e.target.value)} /></Field>
            <Field label="Alergias"><input className={inputClass} value={form.allergies} onChange={(e) => set('allergies', e.target.value)} /></Field>
          </div>
          <Field label="Observações importantes"><textarea className={inputClass} rows={2} value={form.important_notes} onChange={(e) => set('important_notes', e.target.value)} /></Field>

          <div className="border-t border-beetz-dark/10 pt-4 space-y-3">
            <Field label="Sobre mim"><textarea className={inputClass} rows={2} value={form.about_me} onChange={(e) => set('about_me', e.target.value)} /></Field>
            <Field label="Curiosidade"><input className={inputClass} value={form.fun_fact} onChange={(e) => set('fun_fact', e.target.value)} /></Field>
            <Field label="Eventos favoritos"><input className={inputClass} value={form.favorite_events} onChange={(e) => set('favorite_events', e.target.value)} /></Field>
            <div className="grid sm:grid-cols-2 gap-3">
              <Field label="Instagram"><input className={inputClass} value={form.instagram} onChange={(e) => set('instagram', e.target.value)} /></Field>
              <Field label="Frase pessoal"><input className={inputClass} value={form.personal_quote} onChange={(e) => set('personal_quote', e.target.value)} /></Field>
            </div>
          </div>
        </div>

        <div className="flex justify-end gap-2 p-5 border-t border-beetz-dark/10 sticky bottom-0 bg-white">
          <button onClick={onClose} className="px-4 py-2 rounded-xl text-sm font-semibold text-beetz-dark/60 hover:bg-beetz-gray">Cancelar</button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="honey-gradient text-beetz-dark font-bold px-5 py-2 rounded-xl text-sm disabled:opacity-60"
          >
            {saving ? 'Salvando...' : 'Salvar alterações'}
          </button>
        </div>
      </div>
    </div>
  )
}
