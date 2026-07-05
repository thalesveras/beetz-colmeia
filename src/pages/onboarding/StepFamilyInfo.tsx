import type { OnboardingData } from './OnboardingWizard'

interface Props { data: OnboardingData; update: (patch: Partial<OnboardingData>) => void }

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <div><label className="text-sm font-medium block mb-1">{label}</label>{children}</div>
}

const inputClass = 'w-full border border-beetz-dark/15 rounded-xl px-4 py-2.5 focus:outline-none focus:ring-2 focus:ring-beetz-yellow'

export default function StepFamilyInfo({ data, update }: Props) {
  return (
    <div className="space-y-4">
      <div className="grid sm:grid-cols-2 gap-4">
        <Field label="Nome da mãe"><input className={inputClass} value={data.mother_name || ''} onChange={(e) => update({ mother_name: e.target.value })} /></Field>
        <Field label="Nome do pai"><input className={inputClass} value={data.father_name || ''} onChange={(e) => update({ father_name: e.target.value })} /></Field>
      </div>
      <div className="grid sm:grid-cols-2 gap-4">
        <Field label="Contato de emergência"><input className={inputClass} value={data.emergency_contact_name || ''} onChange={(e) => update({ emergency_contact_name: e.target.value })} /></Field>
        <Field label="Telefone de emergência"><input className={inputClass} placeholder="(00) 00000-0000" value={data.emergency_contact_phone || ''} onChange={(e) => update({ emergency_contact_phone: e.target.value })} /></Field>
      </div>
      <p className="text-xs text-beetz-dark/50">Essas informações ficam visíveis apenas para a administração da Beetz, em caso de emergência.</p>
    </div>
  )
}
