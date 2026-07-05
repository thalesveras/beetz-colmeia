import type { OnboardingData } from './OnboardingWizard'
import Avatar from '../../components/ui/Avatar'

interface Props { data: OnboardingData; update: (patch: Partial<OnboardingData>) => void }

const ufs = ['AC','AL','AP','AM','BA','CE','DF','ES','GO','MA','MT','MS','MG','PA','PB','PR','PE','PI','RJ','RN','RS','RO','RR','SC','SP','SE','TO']

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <div><label className="text-sm font-medium block mb-1">{label}</label>{children}</div>
}

const inputClass = 'w-full border border-beetz-dark/15 rounded-xl px-4 py-2.5 focus:outline-none focus:ring-2 focus:ring-beetz-yellow'

export default function StepPersonalData({ data, update }: Props) {
  function handlePhoto(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = () => update({ avatar_url: reader.result as string })
    reader.readAsDataURL(file)
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-4">
        <Avatar src={data.avatar_url} name={`${data.first_name || ''} ${data.last_name || ''}`} size="xl" />
        <div>
          <label className="inline-block bg-beetz-dark text-white text-sm font-semibold px-4 py-2 rounded-xl cursor-pointer hover:bg-black transition">
            Escolher foto
            <input type="file" accept="image/*" className="hidden" onChange={handlePhoto} />
          </label>
          <p className="text-xs text-beetz-dark/50 mt-2">JPG ou PNG, até 2MB.</p>
        </div>
      </div>

      <div className="grid sm:grid-cols-2 gap-4">
        <Field label="Nome"><input required className={inputClass} value={data.first_name || ''} onChange={(e) => update({ first_name: e.target.value })} /></Field>
        <Field label="Sobrenome"><input required className={inputClass} value={data.last_name || ''} onChange={(e) => update({ last_name: e.target.value })} /></Field>
      </div>
      <div className="grid sm:grid-cols-2 gap-4">
        <Field label="Data de nascimento"><input type="date" className={inputClass} value={data.birth_date || ''} onChange={(e) => update({ birth_date: e.target.value })} /></Field>
        <Field label="CPF"><input className={inputClass} placeholder="000.000.000-00" value={data.cpf || ''} onChange={(e) => update({ cpf: e.target.value })} /></Field>
      </div>
      <div className="grid sm:grid-cols-2 gap-4">
        <Field label="Telefone"><input className={inputClass} placeholder="(00) 00000-0000" value={data.phone || ''} onChange={(e) => update({ phone: e.target.value })} /></Field>
        <Field label="Email"><input type="email" required className={inputClass} value={data.email || ''} onChange={(e) => update({ email: e.target.value })} /></Field>
      </div>
      <div className="grid sm:grid-cols-2 gap-4">
        <Field label="Cidade"><input className={inputClass} value={data.city || ''} onChange={(e) => update({ city: e.target.value })} /></Field>
        <Field label="Estado">
          <select className={inputClass} value={data.state || ''} onChange={(e) => update({ state: e.target.value })}>
            <option value="">Selecionar...</option>
            {ufs.map((uf) => <option key={uf} value={uf}>{uf}</option>)}
          </select>
        </Field>
      </div>
    </div>
  )
}
