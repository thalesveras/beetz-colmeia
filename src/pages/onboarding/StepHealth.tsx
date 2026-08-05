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

// Par de botões Sim/Não no padrão dos chips do wizard (null = não respondeu).
function SimNao({ valor, nao, sim, onPick }: { valor: boolean | null | undefined; nao: string; sim: string; onPick: (v: boolean) => void }) {
  return (
    <div className="flex gap-2">
      {[{ v: false, r: nao }, { v: true, r: sim }].map(({ v, r }) => (
        <button
          type="button" key={r}
          onClick={() => onPick(v)}
          className={`text-sm font-medium px-4 py-2.5 rounded-xl border transition-colors ${
            valor === v ? 'bg-beetz-yellow border-beetz-yellow text-beetz-dark' : 'border-beetz-dark/15 text-beetz-dark/70 hover:bg-beetz-gray'
          }`}
        >
          {r}
        </button>
      ))}
    </div>
  )
}

export default function StepHealth({ data, update }: Props) {
  return (
    <div className="space-y-4">
      <div className="bg-beetz-yellow/15 border border-beetz-yellow rounded-xl p-3 text-xs text-beetz-dark/70">
        Essas informações são confidenciais e usadas apenas para cuidar de você durante os eventos.
      </div>
      <Field label="Você fuma?">
        <SimNao valor={data.is_smoker} nao="🚭 Não fumo" sim="🚬 Sou fumante" onPick={(v) => update({ is_smoker: v })} />
      </Field>
      <Field label="Você bebe?">
        <SimNao valor={data.is_drinker} nao="🚱 Não bebo" sim="🍺 Bebo" onPick={(v) => update({ is_drinker: v })} />
      </Field>
      <Field label="Você toma remédios controlados?">
        <SimNao valor={data.uses_controlled_meds} nao="Não tomo" sim="💊 Tomo" onPick={(v) => update({ uses_controlled_meds: v, ...(v ? {} : { controlled_meds_notes: null }) })} />
        {data.uses_controlled_meds === true && (
          <input
            className="w-full border border-beetz-dark/15 rounded-xl px-4 py-2.5 focus:outline-none focus:ring-2 focus:ring-beetz-yellow mt-2"
            placeholder="Quais? (ajuda a equipe a cuidar de você numa emergência)"
            value={data.controlled_meds_notes || ''}
            onChange={(e) => update({ controlled_meds_notes: e.target.value })}
          />
        )}
      </Field>
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
