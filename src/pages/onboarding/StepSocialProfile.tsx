import type { OnboardingData } from './OnboardingWizard'

interface Props { data: OnboardingData; update: (patch: Partial<OnboardingData>) => void }

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <div><label className="text-sm font-medium block mb-1">{label}</label>{children}</div>
}

const inputClass = 'w-full border border-beetz-dark/15 rounded-xl px-4 py-2.5 focus:outline-none focus:ring-2 focus:ring-beetz-yellow'
const textAreaClass = inputClass + ' min-h-[90px]'

export default function StepSocialProfile({ data, update }: Props) {
  return (
    <div className="space-y-4">
      <Field label="Sobre mim">
        <textarea className={textAreaClass} placeholder="Conte um pouco sobre você para a colmeia..." value={data.about_me || ''} onChange={(e) => update({ about_me: e.target.value })} />
      </Field>
      <Field label="Curiosidade sobre mim">
        <textarea className={textAreaClass} placeholder="Algo inusitado que poucos sabem sobre você" value={data.fun_fact || ''} onChange={(e) => update({ fun_fact: e.target.value })} />
      </Field>
      <Field label="Eventos favoritos">
        <input className={inputClass} placeholder="Ex: Festivais de música, casamentos..." value={data.favorite_events || ''} onChange={(e) => update({ favorite_events: e.target.value })} />
      </Field>
      <div className="grid sm:grid-cols-2 gap-4">
        <Field label="Instagram"><input className={inputClass} placeholder="@seuinstagram" value={data.instagram || ''} onChange={(e) => update({ instagram: e.target.value })} /></Field>
        <Field label="Frase pessoal"><input className={inputClass} placeholder="Sua frase favorita" value={data.personal_quote || ''} onChange={(e) => update({ personal_quote: e.target.value })} /></Field>
      </div>
    </div>
  )
}
