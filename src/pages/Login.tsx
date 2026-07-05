import { useState } from 'react'
import { useNavigate, useSearchParams, Link } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'

export default function Login() {
  const { signIn, signUp, isDemoMode } = useAuth()
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const next = params.get('next') || '/dashboard'

  const [mode, setMode] = useState<'entrar' | 'criar'>('entrar')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setLoading(true)
    const action = mode === 'entrar' ? signIn : signUp
    const { error } = await action(email, password)
    setLoading(false)
    if (error) {
      setError(error)
      return
    }
    navigate(next)
  }

  return (
    <div className="min-h-screen dark-gradient flex items-center justify-center p-6">
      <div className="w-full max-w-md bg-white rounded-3xl p-8 shadow-soft">
        <div className="flex items-center gap-2 mb-6">
          <div className="w-10 h-10 rounded-xl honey-gradient flex items-center justify-center text-xl">🐝</div>
          <div>
            <p className="font-extrabold leading-none">Beetz</p>
            <p className="text-[11px] text-beetz-dark/50 leading-none mt-0.5">Colmeia</p>
          </div>
        </div>

        <h1 className="text-2xl font-extrabold mb-1">
          {mode === 'entrar' ? 'Entrar na colmeia' : 'Criar minha conta'}
        </h1>
        <p className="text-sm text-beetz-dark/60 mb-6">
          {mode === 'entrar' ? 'Acesse com seu email e senha da Beetz.' : 'Primeira vez por aqui? Bem-vindo(a)!'}
        </p>

        {isDemoMode && (
          <div className="bg-beetz-yellow/20 border border-beetz-yellow text-xs text-beetz-dark/80 rounded-xl p-3 mb-5">
            Modo demonstração: use qualquer email/senha para entrar e explorar o app com dados de exemplo.
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="text-sm font-medium block mb-1">Email</label>
            <input
              type="email" required value={email} onChange={(e) => setEmail(e.target.value)}
              className="w-full border border-beetz-dark/15 rounded-xl px-4 py-2.5 focus:outline-none focus:ring-2 focus:ring-beetz-yellow"
              placeholder="voce@beetz.com"
            />
          </div>
          <div>
            <label className="text-sm font-medium block mb-1">Senha</label>
            <input
              type="password" required value={password} onChange={(e) => setPassword(e.target.value)}
              className="w-full border border-beetz-dark/15 rounded-xl px-4 py-2.5 focus:outline-none focus:ring-2 focus:ring-beetz-yellow"
              placeholder="••••••••"
            />
          </div>

          {error && <p className="text-sm text-red-600">{error}</p>}

          <button
            type="submit" disabled={loading}
            className="w-full honey-gradient text-beetz-dark font-bold py-3 rounded-xl hover:brightness-105 transition disabled:opacity-60"
          >
            {loading ? 'Entrando...' : mode === 'entrar' ? 'Entrar' : 'Criar conta'}
          </button>
        </form>

        <p className="text-sm text-center text-beetz-dark/60 mt-6">
          {mode === 'entrar' ? 'Ainda não tem conta?' : 'Já tem conta?'}{' '}
          <button className="text-beetz-dark font-semibold underline" onClick={() => setMode(mode === 'entrar' ? 'criar' : 'entrar')}>
            {mode === 'entrar' ? 'Criar conta' : 'Entrar'}
          </button>
        </p>

        <Link to="/" className="block text-center text-xs text-beetz-dark/40 mt-4">← Voltar para a tela inicial</Link>
      </div>
    </div>
  )
}
