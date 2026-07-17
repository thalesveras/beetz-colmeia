import { useState } from 'react'
import { useNavigate, useSearchParams, Link } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import BrandLogo from '../components/ui/BrandLogo'
import { useConfig } from '../contexts/ConfigContext'

export default function Login() {
  const { signIn, signUp, signInWithGoogle, isDemoMode } = useAuth()
  const { appSettings } = useConfig()
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const next = params.get('next') || '/dashboard'

  const [mode, setMode] = useState<'entrar' | 'criar'>('entrar')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [googleLoading, setGoogleLoading] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setLoading(true)
    try {
      const action = mode === 'entrar' ? signIn : signUp
      const { error } = await action(email, password)
      if (error) {
        setError(error)
        return
      }
      navigate(next)
    } catch (err: any) {
      setError(err?.message ?? 'Algo deu errado. Tente novamente.')
    } finally {
      setLoading(false)
    }
  }

  async function handleGoogle() {
    setError(null)
    setGoogleLoading(true)
    try {
      const { error } = await signInWithGoogle()
      if (error) { setError(error); return }
      // Em modo real, o navegador é redirecionado pro Google e volta sozinho;
      // em modo demo o login já acontece na hora.
      if (isDemoMode) navigate(next)
    } finally {
      setGoogleLoading(false)
    }
  }

  return (
    <div className="min-h-screen dark-gradient flex items-center justify-center p-6">
      <div className="w-full max-w-md bg-white rounded-3xl p-8 shadow-soft">
        <div className="mb-6">
          <BrandLogo size="md" withName tone="dark" />
        </div>

        {/* Os textos de "entrar" vêm das Configurações; os de "criar conta"
            continuam fixos — é outro momento, e um título configurado pra quem
            volta ("Que bom te ver") soa errado pra quem chega agora. */}
        <h1 className="text-2xl font-extrabold mb-1">
          {mode === 'entrar' ? appSettings.login_title : 'Criar minha conta'}
        </h1>
        <p className="text-sm text-beetz-dark/60 mb-6">
          {mode === 'entrar' ? appSettings.login_subtitle : 'Primeira vez por aqui? Bem-vindo(a)!'}
        </p>

        {isDemoMode && (
          <div className="bg-beetz-yellow/20 border border-beetz-yellow text-xs text-beetz-dark/80 rounded-xl p-3 mb-5">
            Modo demonstração: use qualquer email/senha para entrar e explorar o app com dados de exemplo.
          </div>
        )}

        <button
          type="button" onClick={handleGoogle} disabled={googleLoading}
          className="w-full flex items-center justify-center gap-2 border border-beetz-dark/15 font-semibold py-3 rounded-xl hover:bg-beetz-gray transition disabled:opacity-60 mb-4"
        >
          <svg width="18" height="18" viewBox="0 0 18 18" xmlns="http://www.w3.org/2000/svg">
            <path fill="#4285F4" d="M17.64 9.2c0-.64-.06-1.25-.16-1.84H9v3.48h4.84a4.14 4.14 0 0 1-1.8 2.72v2.26h2.92c1.7-1.57 2.68-3.88 2.68-6.62z" />
            <path fill="#34A853" d="M9 18c2.43 0 4.47-.8 5.96-2.18l-2.92-2.26c-.81.54-1.84.86-3.04.86-2.34 0-4.32-1.58-5.03-3.7H.95v2.33A9 9 0 0 0 9 18z" />
            <path fill="#FBBC05" d="M3.97 10.72A5.4 5.4 0 0 1 3.68 9c0-.6.1-1.18.29-1.72V4.95H.95A9 9 0 0 0 0 9c0 1.45.35 2.83.95 4.05l3.02-2.33z" />
            <path fill="#EA4335" d="M9 3.58c1.32 0 2.51.46 3.44 1.35l2.59-2.59C13.46.89 11.43 0 9 0A9 9 0 0 0 .95 4.95l3.02 2.33C4.68 5.16 6.66 3.58 9 3.58z" />
          </svg>
          {googleLoading ? 'Redirecionando...' : 'Continuar com Google'}
        </button>

        <div className="flex items-center gap-3 mb-4">
          <div className="flex-1 h-px bg-beetz-dark/10" />
          <span className="text-xs text-beetz-dark/40">ou</span>
          <div className="flex-1 h-px bg-beetz-dark/10" />
        </div>

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
