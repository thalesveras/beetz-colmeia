import type { OnboardingData } from './OnboardingWizard'

interface Props { data: OnboardingData; update: (patch: Partial<OnboardingData>) => void }

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="text-sm font-medium block mb-1">{label}</label>
      {children}
      {hint && <p className="text-xs text-beetz-dark/50 mt-1">{hint}</p>}
    </div>
  )
}

const textAreaClass = 'w-full border border-beetz-dark/15 rounded-xl px-4 py-2.5 focus:outline-none focus:ring-2 focus:ring-beetz-yellow min-h-[90px]'

export default function StepHealth({ data, update }: Props) {
  return (
    <div className="space-y-4">
      <div className="bg-beetz-yellow/15 border border-beetz-yellow rounded-xl p-3 text-xs text-beetz-dark/70">
        Essas informações são confidenciais e usadas apenas para cuidar de você durante os eventos.
      </div>
      <Field label="Complicações de saúde" hint="Ex: pressão alta, asma, diabetes...">
        <textarea className={textAreaClass} value={data.health_conditions || ''} onChange={(e) => update({ health_conditions: e.target.value })} />
      </Field>
      <Field label="Alergias" hint="Ex: alimentos, medicamentos, poeira...">
        <textarea className={textAreaClass} value={data.allergies || ''} onChange={(e) => update({ allergies: e.target.value })} />
      </Field>
      <Field label="Observações importantes">
        <textarea className={textAreaClass} value={data.important_notes || ''} onChange={(e) => update({ important_notes: e.target.value })} />
      </Field>
    </div>
  )
}
