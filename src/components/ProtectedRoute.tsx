import type { ReactNode } from 'react'
import { Navigate, useLocation } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import AppLayout from './layout/AppLayout'

export default function ProtectedRoute({ children, requireOnboarding = true }: { children: ReactNode; requireOnboarding?: boolean }) {
  const { userId, profile, loading } = useAuth()
  const location = useLocation()

  if (loading) {
    return <div className="min-h-screen flex items-center justify-center text-beetz-dark/50">Carregando a colmeia...</div>
  }

  if (!userId) {
    return <Navigate to={`/entrar?next=${encodeURIComponent(location.pathname)}`} replace />
  }

  if (requireOnboarding && (!profile || !profile.onboarding_completed) && location.pathname !== '/cadastro') {
    return <Navigate to="/cadastro" replace />
  }

  return <AppLayout>{children}</AppLayout>
}
