import type { ReactNode } from 'react'
import { Navigate, useLocation } from 'react-router-dom'
import { useProducerAuth } from '../contexts/ProducerAuthContext'
import ProducerLayout from './producer/ProducerLayout'

export default function ProducerProtectedRoute({ children, requireProfile = true }: { children: ReactNode; requireProfile?: boolean }) {
  const { producerId, producer, loading } = useProducerAuth()
  const location = useLocation()

  if (loading) {
    return <div className="min-h-screen flex items-center justify-center text-beetz-dark/50">Carregando...</div>
  }

  if (!producerId) {
    return <Navigate to="/produtor/entrar" replace />
  }

  if (requireProfile && !producer && location.pathname !== '/produtor/cadastro') {
    return <Navigate to="/produtor/cadastro" replace />
  }

  return <ProducerLayout>{children}</ProducerLayout>
}
