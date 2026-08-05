import { useEffect, useState } from 'react'
import type { OnboardingData } from './OnboardingWizard'
import { listDepartments, listTopSkills } from '../../lib/dataService'
import type { Department } from '../../lib/types'

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

const inputClass = 'w-full border border-beetz-dark/15 rounded-xl px-4 py-2.5 focus:outline-none focus:ring-2 focus:ring-beetz-yellow'

export default function StepProfessionalInfo({ data, update }: Props) {
  const [departments, setDepartments] = useState<Department[]>([])
  const [skillInput, setSkillInput] = useState('')
  // Habilidades mais listadas na colmeia — 1 toque em vez de digitar.
  const [topSkills, setTopSkills] = useState<string[]>([])

  useEffect(() => { listDepartments().then(setDepartments).catch(() => {}) }, [])
  useEffect(() => { listTopSkills().then(setTopSkills).catch(() => {}) }, [])

  // Ninguém pode se auto-cadastrar como Diretoria — esse papel só é atribuído
  // por quem já é Diretoria, na tela de Administração. Se a pessoa já for
  // Diretoria (editando o próprio perfil), mantemos a opção pra não sumir o valor atual.
  const selectableDepartments = departments.filter((d) => d.slug !== 'diretoria' || d.id === data.department_id)

  // Multi-seleção: dá pra ser Caixa E Garçom. O PRIMEIRO escolhido é o
  // principal (department_id — permissões e escala seguem ele); os demais
  // vão pra extra_department_ids.
  const selecionados = [data.department_id, ...(data.extra_department_ids ?? [])].filter(Boolean) as string[]

  function toggleDepartment(id: string) {
    const atual = selecionados.filter((x) => x !== id)
    const ligou = atual.length === selecionados.length // não estava — é pra ligar
    const novos = ligou ? [...selecionados, id] : atual
    update({ department_id: novos[0] ?? null, extra_department_ids: novos.slice(1) })
  }

  function addSkill(valor?: string) {
    const value = (valor ?? skillInput).trim()
    if (!value) return
    const current = data.skills || []
    if (!current.includes(value)) update({ skills: [...current, value] })
    setSkillInput('')
  }

  function removeSkill(skill: string) {
    update({ skills: (data.skills || []).filter((s) => s !== skill) })
  }

  const sugestoes = topSkills.filter((s) => !(data.skills ?? []).includes(s))
  const principal = departments.find((d) => d.id === data.department_id)

  return (
    <div className="space-y-4">
      <Field
        label="Departamentos"
        hint={selecionados.length > 1 && principal
          ? `O principal é ${principal.icon} ${principal.name} — os outros contam como extras.`
          : 'Pode marcar mais de um (ex.: Caixa e Garçons). O primeiro que você marcar vira o principal.'}
      >
        <div className="flex flex-wrap gap-2">
          {selectableDepartments.map((d) => {
            const ativo = selecionados.includes(d.id)
            const ehPrincipal = data.department_id === d.id
            return (
              <button
                type="button"
                key={d.id}
                onClick={() => toggleDepartment(d.id)}
                className={`text-sm font-medium px-3.5 py-2.5 rounded-xl border transition-colors ${
                  ativo ? 'bg-beetz-yellow border-beetz-yellow text-beetz-dark' : 'border-beetz-dark/15 text-beetz-dark/70 hover:bg-beetz-gray'
                }`}
              >
                {d.icon} {d.name}{ehPrincipal && selecionados.length > 1 ? ' ★' : ''}
              </button>
            )
          })}
        </div>
      </Field>

      <Field label="Local de trabalho frequente">
        <input className={inputClass} placeholder="Ex: São Luís - MA" value={data.work_location || ''} onChange={(e) => update({ work_location: e.target.value })} />
      </Field>

      <Field label="Habilidades">
        {sugestoes.length > 0 && (
          <div className="mb-2">
            <p className="text-xs text-beetz-dark/50 mb-1.5">As mais usadas na colmeia — toque pra adicionar:</p>
            <div className="flex flex-wrap gap-1.5">
              {sugestoes.map((s) => (
                <button
                  type="button" key={s} onClick={() => addSkill(s)}
                  className="text-xs font-semibold border border-dashed border-beetz-dark/25 text-beetz-dark/70 px-3 py-1.5 rounded-full hover:bg-beetz-yellow/20 hover:border-beetz-yellow transition-colors"
                >
                  + {s}
                </button>
              ))}
            </div>
          </div>
        )}
        <div className="flex gap-2">
          <input
            className={inputClass} placeholder="Ou digite outra... Ex: Coquetelaria" value={skillInput}
            onChange={(e) => setSkillInput(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addSkill() } }}
          />
          <button type="button" onClick={() => addSkill()} className="bg-beetz-dark text-white font-semibold px-4 rounded-xl text-sm">+</button>
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
