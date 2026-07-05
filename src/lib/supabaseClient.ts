import { createClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

export const isDemoMode = !url || !anonKey || url.includes('SEU-PROJETO')

// Em modo demo, criamos um client "vazio" que nunca é chamado de verdade —
// toda a lógica de dados passa pelo dataService, que checa isDemoMode antes.
export const supabase = isDemoMode
  ? (null as any)
  : createClient(url, anonKey)
