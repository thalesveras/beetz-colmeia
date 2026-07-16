import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import { isDemoMode, supabase } from '../lib/supabaseClient'
import { getProducerForAuthUser, upsertProducer } from '../lib/dataService'
import type { Producer } from '../lib/types'

export interface ProducerProfileInput {
  name: string
  company_name: string
  phone: string
  cpf_cnpj: string
}

interface ProducerAuthContextValue {
  producerId: string | null
  email: string | null
  producer: Producer | null
  loading: boolean
  isDemoMode: boolean
  sendMagicLink: (email: string) => Promise<{ error: string | null }>
  completeProfile: (data: ProducerProfileInput) => Promise<void>
  signOut: () => Promise<void>
  refreshProducer: () => Promise<void>
}

// Contexto de autenticação separado do staff (AuthContext) — o portal /produtor
// é usado por clientes externos (quem contrata a Beetz), não por colaboradores.
// Login é por link mágico (sem senha), amarrado ao e-mail que o produtor informa.
const ProducerAuthContext = createContext<ProducerAuthContextValue | undefined>(undefined)

const DEMO_STORAGE_KEY = 'beetz-demo-producer'

export function ProducerAuthProvider({ children }: { children: ReactNode }) {
  const [producerId, setProducerId] = useState<string | null>(null)
  const [email, setEmail] = useState<string | null>(null)
  const [producer, setProducer] = useState<Producer | null>(null)
  const [loading, setLoading] = useState(true)

  // A ficha do produtor deixou de ser a mesma coisa que a conta: agora tem id
  // próprio e o login é o auth_user_id. Isso é o que permite a Diretoria
  // cadastrar produtora que nunca entrou no app — e quando essa pessoa entra
  // com o mesmo e-mail, getProducerForAuthUser liga os dois em vez de criar
  // uma segunda ficha (era assim que a duplicação nascia).
  //
  // producerId aqui continua sendo o id do LOGIN; o id da ficha é producer.id.
  async function loadProducer(authUserId: string) {
    const p = await getProducerForAuthUser(authUserId)
    setProducer(p)
  }

  useEffect(() => {
    if (isDemoMode) {
      const saved = sessionStorage.getItem(DEMO_STORAGE_KEY)
      if (saved) {
        const parsed = JSON.parse(saved)
        setProducerId(parsed.id)
        setEmail(parsed.email)
        loadProducer(parsed.id).finally(() => setLoading(false))
      } else {
        setLoading(false)
      }
      return
    }

    supabase.auth.getSession().then(({ data }: any) => {
      const session = data.session
      if (session) {
        setProducerId(session.user.id)
        setEmail(session.user.email)
        loadProducer(session.user.id).finally(() => setLoading(false))
      } else {
        setLoading(false)
      }
    })

    const { data: listener } = supabase.auth.onAuthStateChange((_event: string, session: any) => {
      if (session) {
        setProducerId(session.user.id)
        setEmail(session.user.email)
        loadProducer(session.user.id)
      } else {
        setProducerId(null)
        setEmail(null)
        setProducer(null)
      }
    })

    return () => listener?.subscription?.unsubscribe?.()
  }, [])

  async function sendMagicLink(emailInput: string) {
    if (isDemoMode) {
      // Sem envio de e-mail de verdade em modo demo: "entra" na hora com esse e-mail.
      const id = `demoprod-${emailInput.toLowerCase().replace(/[^a-z0-9]/g, '')}`
      sessionStorage.setItem(DEMO_STORAGE_KEY, JSON.stringify({ id, email: emailInput }))
      setProducerId(id)
      setEmail(emailInput)
      await loadProducer(id)
      return { error: null }
    }
    try {
      const { error } = await supabase.auth.signInWithOtp({
        email: emailInput,
        options: { emailRedirectTo: `${window.location.origin}/produtor` }
      })
      return { error: error?.message ?? null }
    } catch (err: any) {
      return { error: err?.message ?? 'Não foi possível enviar o link. Tente novamente.' }
    }
  }

  async function completeProfile(data: ProducerProfileInput) {
    if (!producerId || !email) return
    // Se a Diretoria já cadastrou essa produtora, atualiza a ficha existente
    // (producer.id) em vez de criar outra. Só cria ficha nova quando não há
    // nenhuma com esse e-mail — e aí já nasce amarrada ao login pelo
    // auth_user_id. Sem isso a ficha nasceria órfã e o produtor não a acharia
    // no próximo acesso.
    const saved = await upsertProducer({
      id: producer?.id ?? crypto.randomUUID(),
      auth_user_id: producerId,
      email,
      ...data
    })
    setProducer(saved)
  }

  async function signOut() {
    if (isDemoMode) {
      sessionStorage.removeItem(DEMO_STORAGE_KEY)
    } else {
      await supabase.auth.signOut()
    }
    setProducerId(null)
    setEmail(null)
    setProducer(null)
  }

  async function refreshProducer() {
    if (producerId) await loadProducer(producerId)
  }

  return (
    <ProducerAuthContext.Provider value={{ producerId, email, producer, loading, isDemoMode, sendMagicLink, completeProfile, signOut, refreshProducer }}>
      {children}
    </ProducerAuthContext.Provider>
  )
}

export function useProducerAuth() {
  const ctx = useContext(ProducerAuthContext)
  if (!ctx) throw new Error('useProducerAuth deve ser usado dentro de <ProducerAuthProvider>')
  return ctx
}
