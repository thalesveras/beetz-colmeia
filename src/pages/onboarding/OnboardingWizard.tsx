import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../../contexts/AuthContext'
import { checkSignupValueTaken, listDepartments, listSignupFieldRules, upsertProfile } from '../../lib/dataService'
import type { Profile, SignupFieldRule } from '../../lib/types'
import ProgressBar from '../../components/ui/ProgressBar'
import StepPersonalData from './StepPersonalData'
import StepFamilyInfo from './StepFamilyInfo'
import StepProfessionalInfo from './StepProfessionalInfo'
import StepHealth from './StepHealth'
import StepSocialProfile from './StepSocialProfile'
import { cleanCpf, isValidCpf } from '../../lib/cpf'

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
  const [checando, setChecando] = useState(false)
  // Regras do cadastro vindas de Configurações (obrigatórios + únicos).
  // Se a carga falhar, o wizard segue como sempre foi — regra nunca derruba cadastro.
  const [rules, setRules] = useState<SignupFieldRule[]>([])
  useEffect(() => { listSignupFieldRules().then(setRules).catch(() => {}) }, [])

  // Obrigatoriedade vale só pra quem AINDA está se cadastrando (decisão da
  // Diretoria) — perfil antigo editando não fica refém de campo novo.
  const cadastroNovo = !profile?.onboarding_completed

  function preenchido(key: string): boolean {
    if (key === 'skills') return (data.skills?.length ?? 0) > 0
    if (key === 'department_id') return Boolean(data.department_id)
    if (key === 'avatar_url') return Boolean(data.avatar_url)
    const v = (data as any)[key]
    return String(v ?? '').trim() !== ''
  }

  useEffect(() => {
    if (profile) setData({ ...profile })
    else if (email) setData((d) => ({ ...d, email }))
  }, [profile, email])

  function update(patch: Partial<OnboardingData>) {
    setData((d) => ({ ...d, ...patch }))
  }

  async function handleNext() {
    // Nome e sobrenome são LEI FIXA (não configurável): é como a colmeia te
    // reconhece em escala, recebimento e folha Pix. Antes o "required" do
    // input era decorativo — dava pra concluir o cadastro sem nome e nascer
    // "Sem nome (perfil incompleto)" em todo canto do sistema.
    if (cadastroNovo && step === 0) {
      if (!String(data.first_name ?? '').trim() || !String(data.last_name ?? '').trim()) {
        alert('Nome e sobrenome são obrigatórios — é como todo mundo te encontra na colmeia. 🐝')
        return
      }
    }

    // CPF preenchido tem que ser válido pra sair da etapa 1 — CPF errado no
    // cadastro vira dor de cabeça em pagamento e contrato lá na frente.
    // Em branco pode passar (nem todo fluxo exige).
    if (step === 0 && cleanCpf(data.cpf).length > 0 && !isValidCpf(data.cpf)) {
      alert('O CPF digitado não é válido — confere os números antes de continuar (ou deixe em branco pra preencher depois).')
      return
    }

    const daEtapa = rules.filter((r) => r.step === step + 1)

    // Obrigatórios da etapa (Configurações → Cadastro), só pra cadastro novo.
    if (cadastroNovo) {
      const faltando = daEtapa.filter((r) => r.required && !preenchido(r.field_key))
      if (faltando.length > 0) {
        alert(`Antes de avançar, preencha: ${faltando.map((f) => f.label).join(', ')}.`)
        return
      }
    }

    // Únicos: o banco confere se o valor já é de outra pessoa (sem contar
    // você mesmo). Rede falhou? Deixa passar — regra nunca trava cadastro.
    const unicos = daEtapa.filter((r) => r.is_unique && r.unique_capable && preenchido(r.field_key))
    if (unicos.length > 0) {
      setChecando(true)
      try {
        for (const r of unicos) {
          const tomado = await checkSignupValueTaken(r.field_key, String((data as any)[r.field_key] ?? ''))
          if (tomado) {
            alert(`Já existe um cadastro na Colmeia com este ${r.label}. Confere o valor — e se achar que é engano, fala com a Diretoria.`)
            setChecando(false)
            return
          }
        }
      } catch { /* indisponível: segue o baile */ } finally {
        setChecando(false)
      }
    }

    if (step < steps.length - 1) {
      setStep(step + 1)
      window.scrollTo({ top: 0, behavior: 'smooth' })
      return
    }
    if (!userId) return
    setSaving(true)
    try {
      const patch = { ...data }
      if (cadastroNovo) {
        // Função segue o departamento principal — o campo livre saiu do form.
        if (patch.department_id) {
          try {
            const dep = (await listDepartments()).find((d) => d.id === patch.department_id)
            if (dep) patch.role = dep.name
          } catch { /* sem lista agora: mantém o que tiver */ }
        }
        // Data de entrada: hoje (fuso local) pra cadastro novo. Quem veio do
        // histórico (Zoho) já chegou aqui com a data original, via claim.
        if (!patch.entry_date) {
          const d = new Date()
          patch.entry_date = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
        }
        // Experiência saiu do form: antigo (pré-cadastro) já vem marcado pelo
        // claim; quem sobrou sem nada é abelha nova mesmo.
        if (!patch.experience_level) patch.experience_level = 'Nova abelha'
      }
      await upsertProfile({ ...patch, id: userId, onboarding_completed: true } as any)
      await refreshProfile()
      // Cadastro novo segue pros primeiros passos (ativar avisos no aparelho);
      // quem só estava editando volta pro painel.
      navigate(cadastroNovo ? '/primeiros-passos' : '/dashboard')
    } catch (err) {
      const msg = err instanceof Error ? err.message : ''
      alert(`Não deu pra salvar agora${msg ? ` (${msg})` : ''} — nada foi perdido, tenta de novo.`)
    } finally {
      setSaving(false)
    }
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
            onClick={handleNext} disabled={saving || checando}
            className="honey-gradient text-beetz-dark font-bold px-6 py-2.5 rounded-xl hover:brightness-105 transition disabled:opacity-60"
          >
            {saving ? 'Salvando...' : checando ? 'Conferindo...' : step === steps.length - 1 ? 'Concluir cadastro 🐝' : 'Próxima etapa →'}
          </button>
        </div>
      </div>
    </div>
  )
}
