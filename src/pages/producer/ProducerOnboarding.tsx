import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useProducerAuth } from '../../contexts/ProducerAuthContext'
import BrandLogo from '../../components/ui/BrandLogo'

const inputClass = 'w-full border border-beetz-dark/15 rounded-xl px-4 py-2.5 focus:outline-none focus:ring-2 focus:ring-beetz-yellow'

export default function ProducerOnboarding() {
  const { email, completeProfile } = useProducerAuth()
  const navigate = useNavigate()
  const [name, setName] = useState('')
  const [companyName, setCompanyName] = useState('')
  const [phone, setPhone] = useState('')
  const [cpfCnpj, setCpfCnpj] = useState('')
  const [saving, setSaving] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    try {
      await completeProfile({ name, company_name: companyName, phone, cpf_cnpj: cpfCnpj })
      navigate('/produtor')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="min-h-screen dark-gradient flex items-center justify-center p-6">
      <div className="w-full max-w-md bg-white rounded-3xl p-8 shadow-soft">
        <div className="mb-6">
          <BrandLogo size="md" withName tone="dark" subtitle="Portal do Produtor" />
        </div>

        <h1 className="text-2xl font-extrabold mb-1">Bem-vindo(a)!</h1>
        <p className="text-sm text-beetz-dark/60 mb-6">
          Só mais um passo — conte um pouco sobre você/sua produtora ({email}).
        </p>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="text-sm font-medium block mb-1">Seu nome</label>
            <input required className={inputClass} value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div>
            <label className="text-sm font-medium block mb-1">Nome da produtora/empresa</label>
            <input className={inputClass} value={companyName} onChange={(e) => setCompanyName(e.target.value)} />
          </div>
          <div>
            <label className="text-sm font-medium block mb-1">Telefone</label>
            <input className={inputClass} value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="(11) 99999-0000" />
          </div>
          <div>
            <label className="text-sm font-medium block mb-1">CPF ou CNPJ</label>
            <input className={inputClass} value={cpfCnpj} onChange={(e) => setCpfCnpj(e.target.value)} />
          </div>

          <button
            type="submit" disabled={saving}
            className="w-full honey-gradient text-beetz-dark font-bold py-3 rounded-xl hover:brightness-105 transition disabled:opacity-60"
          >
            {saving ? 'Salvando...' : 'Continuar'}
          </button>
        </form>
      </div>
    </div>
  )
}
