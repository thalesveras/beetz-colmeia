import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import { isDemoMode, supabase } from '../lib/supabaseClient'
import { getProfileById, upsertProfile } from '../lib/dataService'
import type { Profile } from '../lib/types'

interface AuthContextValue {
  userId: string | null
  email: string | null
  profile: Profile | null
  loading: boolean
  isDemoMode: boolean
  signIn: (email: string, password: string) => Promise<{ error: string | null }>
  signUp: (email: string, password: string) => Promise<{ error: string | null }>
  signOut: () => Promise<void>
  refreshProfile: () => Promise<void>
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined)

const DEMO_STORAGE_KEY = 'beetz-demo-user'

export function AuthProvider({ children }: { children: ReactNode }) {
  const [userId, setUserId] = useState<string | null>(null)
  const [email, setEmail] = useState<string | null>(null)
  const [profile, setProfile] = useState<Profile | null>(null)
  const [loading, setLoading] = useState(true)

  async function loadProfile(id: string) {
    const p = await getProfileById(id)
    setProfile(p)
  }

  useEffect(() => {
    if (isDemoMode) {
      const saved = sessionStorage.getItem(DEMO_STORAGE_KEY)
      if (saved) {
        const parsed = JSON.parse(saved)
        setUserId(parsed.id)
        setEmail(parsed.email)
        loadProfile(parsed.id).finally(() => setLoading(false))
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
        loadProfile(session.user.id).finally(() => setLoading(false))
      } else {
        setLoading(false)
      }
    })

    const { data: listener } = supabase.auth.onAuthStateChange((_event: string, session: any) => {
      if (session) {
        setUserId(session.user.id)
        setEmail(session.user.email)
        loadProfile(session.user.id)
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
    const { error } = await supabase.auth.signInWithPassword({ email: emailInput, password })
    return { error: error?.message ?? null }
  }

  async function signUp(emailInput: string, password: string) {
    if (isDemoMode) {
      return signIn(emailInput, password)
    }
    const { error, data } = await supabase.auth.signUp({ email: emailInput, password })
    if (!error && data.user) {
      await upsertProfile({ id: data.user.id, email: emailInput, onboarding_completed: false })
    }
    return { error: error?.message ?? null }
  }

  async function signOut() {
    if (isDemoMode) {
      sessionStorage.removeItem(DEMO_STORAGE_KEY)
    } else {
      await supabase.auth.signOut()
    }
    setUserId(null)
    setEmail(null)
    setProfile(null)
  }

  async function refreshProfile() {
    if (userId) await loadProfile(userId)
  }

  return (
    <AuthContext.Provider value={{ userId, email, profile, loading, isDemoMode, signIn, signUp, signOut, refreshProfile }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth deve ser usado dentro de <AuthProvider>')
  return ctx
}
