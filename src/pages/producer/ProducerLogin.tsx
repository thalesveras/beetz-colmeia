import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useProducerAuth } from '../../contexts/ProducerAuthContext'

export default function ProducerLogin() {
  const { sendMagicLink, isDemoMode } = useProducerAuth()
  const [email, setEmail] = useState('')
  const [sent, setSent] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setLoading(true)
    try {
      const { error } = await sendMagicLink(email)
      if (error) {
        setError(error)
        return
      }
      setSent(true)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen dark-gradient flex items-center justify-center p-6">
      <div className="w-full max-w-md bg-white rounded-3xl p-8 shadow-soft">
        <div className="flex items-center gap-2 mb-6">
          <div className="w-10 h-10 rounded-xl honey-gradient flex items-center justify-center text-xl">🐝</div>
          <div>
            <p className="font-extrabold leading-none">Beetz</p>
            <p className="text-[11px] text-beetz-dark/50 leading-none mt-0.5">Portal do Produtor</p>
          </div>
        </div>

        <h1 className="text-2xl font-extrabold mb-1">Monte seu evento</h1>
        <p className="text-sm text-beetz-dark/60 mb-6">
          Informe seu e-mail e enviamos um link de acesso — sem senha.
        </p>

        {isDemoMode && (
          <div className="bg-beetz-yellow/20 border border-beetz-yellow text-xs text-beetz-dark/80 rounded-xl p-3 mb-5">
            Modo demonstração: qualquer e-mail já entra direto, sem precisar checar a caixa de entrada.
          </div>
        )}

        {sent ? (
          <div className="bg-beetz-gray rounded-xl p-4 text-sm text-beetz-dark/70">
            Enviamos um link de acesso para <strong>{email}</strong>. Abra seu e-mail e clique no link pra continuar.
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="text-sm font-medium block mb-1">Seu e-mail</label>
              <input
                type="email" required value={email} onChange={(e) => setEmail(e.target.value)}
                className="w-full border border-beetz-dark/15 rounded-xl px-4 py-2.5 focus:outline-none focus:ring-2 focus:ring-beetz-yellow"
                placeholder="voce@suaempresa.com"
              />
            </div>

            {error && <p className="text-sm text-red-600">{error}</p>}

            <button
              type="submit" disabled={loading}
              className="w-full honey-gradient text-beetz-dark font-bold py-3 rounded-xl hover:brightness-105 transition disabled:opacity-60"
            >
              {loading ? 'Enviando...' : 'Receber link de acesso'}
            </button>
          </form>
        )}

        <Link to="/" className="block text-center text-xs text-beetz-dark/40 mt-6">← Voltar para a tela inicial</Link>
      </div>
    </div>
  )
}
