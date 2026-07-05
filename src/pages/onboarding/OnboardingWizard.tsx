import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../../contexts/AuthContext'
import { upsertProfile } from '../../lib/dataService'
import type { Profile } from '../../lib/types'
import ProgressBar from '../../components/ui/ProgressBar'
import StepPersonalData from './StepPersonalData'
import StepFamilyInfo from './StepFamilyInfo'
import StepProfessionalInfo from './StepProfessionalInfo'
import StepHealth from './StepHealth'
import StepSocialProfile from './StepSocialProfile'

export type OnboardingData = Partial<Profile>

const steps = [
  { title: 'Dados pessoais', subtitle: 'Quem é você na colmeia?' },
  { title: 'Informações familiares', subtitle: 'Para eventuais emergências' },
  { title: 'Informações profissionais', subtitle: 'Seu papel na Beetz' },
  { title: 'Saúde e observações', subtitle: 'Cuidamos de você' },
  { title: 'Perfil social', subtitle: 'Mostre sua essência' }
]

export default function OnboardingWizard() {
  const { userId, email, profile, refreshProfile } = useAuth()
  const navigate = useNavigate()
  const [step, setStep] = useState(0)
  const [data, setData] = useState<OnboardingData>({ email: email ?? '', skills: [] })
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (profile) setData({ ...profile })
    else if (email) setData((d) => ({ ...d, email }))
  }, [profile, email])

  function update(patch: Partial<OnboardingData>) {
    setData((d) => ({ ...d, ...patch }))
  }

  async function handleNext() {
    if (step < steps.length - 1) {
      setStep(step + 1)
      window.scrollTo({ top: 0, behavior: 'smooth' })
      return
    }
    if (!userId) return
    setSaving(true)
    await upsertProfile({ ...data, id: userId, onboarding_completed: true } as any)
    await refreshProfile()
    setSaving(false)
    navigate('/dashboard')
  }

  function handleBack() {
    if (step > 0) { setStep(step - 1); window.scrollTo({ top: 0, behavior: 'smooth' }) }
  }

  const percent = Math.round(((step + 1) / steps.length) * 100)

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div>
        <p className="text-xs font-semibold uppercase tracking-wider text-beetz-dark/50 mb-2">
          Etapa {step + 1} de {steps.length}
        </p>
        <h1 className="text-2xl md:text-3xl font-extrabold">{steps[step].title}</h1>
        <p className="text-beetz-dark/60 mt-1">{steps[step].subtitle}</p>
        <div className="mt-4"><ProgressBar percent={percent} /></div>
      </div>

      <div className="bg-white rounded-3xl shadow-soft border border-beetz-dark/5 p-6 md:p-8">
        {step === 0 && <StepPersonalData data={data} update={update} />}
        {step === 1 && <StepFamilyInfo data={data} update={update} />}
        {step === 2 && <StepProfessionalInfo data={data} update={update} />}
        {step === 3 && <StepHealth data={data} update={update} />}
        {step === 4 && <StepSocialProfile data={data} update={update} />}

        <div className="flex items-center justify-between mt-8 pt-6 border-t border-beetz-dark/5">
          <button
            onClick={handleBack} disabled={step === 0}
            className="px-5 py-2.5 rounded-xl font-semibold text-sm text-beetz-dark/60 disabled:opacity-0"
          >
            ← Voltar
          </button>
          <button
            onClick={handleNext} disabled={saving}
            className="honey-gradient text-beetz-dark font-bold px-6 py-2.5 rounded-xl hover:brightness-105 transition disabled:opacity-60"
          >
            {saving ? 'Salvando...' : step === steps.length - 1 ? 'Concluir cadastro 🐝' : 'Próxima etapa →'}
          </button>
        </div>
      </div>
    </div>
  )
}
