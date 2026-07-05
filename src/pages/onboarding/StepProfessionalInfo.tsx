import { useEffect, useState } from 'react'
import type { OnboardingData } from './OnboardingWizard'
import { listDepartments } from '../../lib/dataService'
import type { Department, ExperienceLevel } from '../../lib/types'

interface Props { data: OnboardingData; update: (patch: Partial<OnboardingData>) => void }

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <div><label className="text-sm font-medium block mb-1">{label}</label>{children}</div>
}

const inputClass = 'w-full border border-beetz-dark/15 rounded-xl px-4 py-2.5 focus:outline-none focus:ring-2 focus:ring-beetz-yellow'
const experiences: ExperienceLevel[] = ['Nova abelha', 'Em treinamento', 'Colaborador frequente', 'Líder de bar']

export default function StepProfessionalInfo({ data, update }: Props) {
  const [departments, setDepartments] = useState<Department[]>([])
  const [skillInput, setSkillInput] = useState('')

  useEffect(() => { listDepartments().then(setDepartments) }, [])

  function addSkill() {
    const value = skillInput.trim()
    if (!value) return
    const current = data.skills || []
    if (!current.includes(value)) update({ skills: [...current, value] })
    setSkillInput('')
  }

  function removeSkill(skill: string) {
    update({ skills: (data.skills || []).filter((s) => s !== skill) })
  }

  return (
    <div className="space-y-4">
      <div className="grid sm:grid-cols-2 gap-4">
        <Field label="Departamento">
          <select className={inputClass} value={data.department_id || ''} onChange={(e) => update({ department_id: e.target.value })}>
            <option value="">Selecionar...</option>
            {departments.map((d) => <option key={d.id} value={d.id}>{d.icon} {d.name}</option>)}
          </select>
        </Field>
        <Field label="Função"><input className={inputClass} placeholder="Ex: Bartender, Segurança..." value={data.role || ''} onChange={(e) => update({ role: e.target.value })} /></Field>
      </div>

      <Field label="Experiência">
        <div className="grid grid-cols-2 gap-2">
          {experiences.map((exp) => (
            <button
              type="button" key={exp} onClick={() => update({ experience_level: exp })}
              className={`text-sm font-medium px-3 py-2.5 rounded-xl border transition-colors ${
                data.experience_level === exp ? 'bg-beetz-yellow border-beetz-yellow text-beetz-dark' : 'border-beetz-dark/15 text-beetz-dark/70 hover:bg-beetz-gray'
              }`}
            >
              {exp}
            </button>
          ))}
        </div>
      </Field>

      <div className="grid sm:grid-cols-2 gap-4">
        <Field label="Data de entrada"><input type="date" className={inputClass} value={data.entry_date || ''} onChange={(e) => update({ entry_date: e.target.value })} /></Field>
        <Field label="Local de trabalho frequente"><input className={inputClass} placeholder="Ex: São Paulo - SP" value={data.work_location || ''} onChange={(e) => update({ work_location: e.target.value })} /></Field>
      </div>

      <Field label="Habilidades">
        <div className="flex gap-2">
          <input
            className={inputClass} placeholder="Ex: Coquetelaria" value={skillInput}
            onChange={(e) => setSkillInput(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addSkill() } }}
          />
          <button type="button" onClick={addSkill} className="bg-beetz-dark text-white font-semibold px-4 rounded-xl text-sm">+</button>
        </div>
        <div className="flex flex-wrap gap-2 mt-2">
          {(data.skills || []).map((s) => (
            <span key={s} className="flex items-center gap-1 text-xs font-semibold bg-beetz-gray px-3 py-1.5 rounded-full">
              {s}
              <button type="button" onClick={() => removeSkill(s)} className="text-beetz-dark/40 hover:text-beetz-dark">×</button>
            </span>
          ))}
        </div>
      </Field>
    </div>
  )
}
