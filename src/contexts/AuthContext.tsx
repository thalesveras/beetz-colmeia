import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { isDemoMode, supabase } from '../lib/supabaseClient'
import { claimPendingProfile, getProfileById, listDepartments, upsertProfile } from '../lib/dataService'
import type { Department, Profile } from '../lib/types'
import { computeAccessRole, type AccessRole } from '../lib/permissions'

interface AuthContextValue {
  userId: string | null
  email: string | null
  profile: Profile | null
  accessRole: AccessRole
  loading: boolean
  isDemoMode: boolean
  signIn: (email: string, password: string) => Promise<{ error: string | null }>
  signUp: (email: string, password: string) => Promise<{ error: string | null }>
  signInWithGoogle: () => Promise<{ error: string | null }>
  signOut: () => Promise<void>
  refreshProfile: () => Promise<void>
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined)

const DEMO_STORAGE_KEY = 'beetz-demo-user'

export function AuthProvider({ children }: { children: ReactNode }) {
  const [userId, setUserId] = useState<string | null>(null)
  const [email, setEmail] = useState<string | null>(null)
  const [profile, setProfile] = useState<Profile | null>(null)
  const [departments, setDepartments] = useState<Department[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => { listDepartments().then(setDepartments) }, [])

  const accessRole = useMemo(() => computeAccessRole(profile, departments), [profile, departments])

  // Se a pessoa ainda não terminou o cadastro, tentamos casar o e-mail dela com
  // um perfil pré-importado (ex: histórico do Zoho) antes de exibir o formulário —
  // assim o cadastro nasce pré-preenchido em vez de em branco. É seguro chamar
  // isso repetidas vezes: a função no banco só age uma vez por e-mail.
  async function loadProfile(id: string, emailHint?: string | null) {
    let p = await getProfileById(id)
    const hint = emailHint ?? p?.email
    if (p && !p.onboarding_completed && hint) {
      try {
        await claimPendingProfile(id, hint)
        p = await getProfileById(id)
      } catch (err) {
        console.error('Falha ao buscar dados pré-cadastrados:', err)
      }
    }
    setProfile(p)
  }

  useEffect(() => {
    if (isDemoMode) {
      const saved = sessionStorage.getItem(DEMO_STORAGE_KEY)
      if (saved) {
        const parsed = JSON.parse(saved)
        setUserId(parsed.id)
        setEmail(parsed.email)
        loadProfile(parsed.id, parsed.email).finally(() => setLoading(false))
      } else {
        setLoading(false)
      }
      return
    }

    supabase.auth.getSession().then(({ data }: any) => {
      const session = data.session
      if (session) {
        setUserId(session.user.id)
        setEmail(session.user.email)
        loadProfile(session.user.id, session.user.email).finally(() => setLoading(false))
      } else {
        setLoading(false)
      }
    })

    // Alerta pessoal de acesso: SIGNED_IN dispara no login real (senha OU
    // volta do Google), não no carregamento de sessão existente. O guard por
    // aba evita duplicar se o evento repetir na mesma sessão do navegador.
    let loginLogged = false
    const { data: listener } = supabase.auth.onAuthStateChange((event: string, session: any) => {
      if (session) {
        setUserId(session.user.id)
        setEmail(session.user.email)
        loadProfile(session.user.id, session.user.email)
        if (event === 'SIGNED_IN' && !loginLogged) {
          loginLogged = true
          // Melhor esforço: falha aqui nunca atrapalha o login.
          supabase.rpc('log_auth_event', { p_event: 'login' }).then(() => undefined, () => undefined)
        }
      } else {
        setUserId(null)
        setEmail(null)
        setProfile(null)
      }
    })

    return () => listener?.subscription?.unsubscribe?.()
  }, [])

  async function signIn(emailInput: string, password: string) {
    if (isDemoMode) {
      const id = `demo-${emailInput.toLowerCase().replace(/[^a-z0-9]/g, '')}`
      sessionStorage.setItem(DEMO_STORAGE_KEY, JSON.stringify({ id, email: emailInput }))
      setUserId(id)
      setEmail(emailInput)
      await loadProfile(id)
      return { error: null }
    }
    try {
      const { error } = await supabase.auth.signInWithPassword({ email: emailInput, password })
      return { error: error?.message ?? null }
    } catch (err: any) {
      return { error: err?.message ?? 'Não foi possível entrar. Tente novamente.' }
    }
  }

  async function signUp(emailInput: string, password: string) {
    if (isDemoMode) {
      return signIn(emailInput, password)
    }
    try {
      const { error, data } = await supabase.auth.signUp({ email: emailInput, password })
      if (error) return { error: error.message }

      // Se o projeto exige confirmação de email, não existe sessão ainda.
      // Sem sessão não dá pra gravar o perfil (RLS bloqueia), então avisamos
      // a pessoa em vez de travar a tela.
      if (!data.session) {
        return { error: 'Conta criada! Verifique seu email para confirmar antes de entrar (ou desative a confirmação de email nas configurações do Supabase).' }
      }

      if (data.user) {
        try {
          await upsertProfile({ id: data.user.id, email: emailInput, onboarding_completed: false })
        } catch (profileError) {
          // Não deixa um erro ao criar o perfil travar o cadastro — o perfil
          // pode ser criado depois pelo trigger do banco ou no próximo passo.
          console.error('Falha ao criar perfil inicial:', profileError)
        }
        await loadProfile(data.user.id, emailInput)
      }
      return { error: null }
    } catch (err: any) {
      return { error: err?.message ?? 'Não foi possível criar a conta. Tente novamente.' }
    }
  }

  // Login social — mesma base de usuários da equipe, só sem senha. Quem entra
  // pela primeira vez pelo Google também passa pelo /cadastro (o trigger do
  // banco ou o próximo carregamento de perfil cria o registro em profiles).
  async function signInWithGoogle() {
    if (isDemoMode) {
      return signIn('demo.google@beetz.com', 'demo')
    }
    try {
      const { error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: { redirectTo: `${window.location.origin}/dashboard` }
      })
      return { error: error?.message ?? null }
    } catch (err: any) {
      return { error: err?.message ?? 'Não foi possível entrar com Google.' }
    }
  }

  async function signOut() {
    if (isDemoMode) {
      sessionStorage.removeItem(DEMO_STORAGE_KEY)
    } else {
      // O registro precisa acontecer ANTES do signOut — depois não há mais
      // sessão pra assinar a chamada. Melhor esforço: sem rede, sai igual.
      try { await supabase.rpc('log_auth_event', { p_event: 'logout' }) } catch { /* segue o baile */ }
      await supabase.auth.signOut()
    }
    setUserId(null)
    setEmail(null)
    setProfile(null)
  }

  async function refreshProfile() {
    if (userId) await loadProfile(userId, email)
  }

  return (
    <AuthContext.Provider value={{ userId, email, profile, accessRole, loading, isDemoMode, signIn, signUp, signInWithGoogle, signOut, refreshProfile }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth deve ser usado dentro de <AuthProvider>')
  return ctx
}
