import type { ReactNode } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { LogOut } from 'lucide-react'
import { useProducerAuth } from '../../contexts/ProducerAuthContext'

export default function ProducerLayout({ children }: { children: ReactNode }) {
  const { producer, signOut } = useProducerAuth()
  const navigate = useNavigate()

  async function handleSignOut() {
    await signOut()
    navigate('/produtor/entrar')
  }

  return (
    <div className="min-h-screen bg-beetz-gray/40">
      <header className="bg-white border-b border-beetz-dark/5 sticky top-0 z-10">
        <div className="max-w-5xl mx-auto px-5 py-3 flex items-center justify-between">
          <Link to="/produtor" className="flex items-center gap-2">
            <div className="w-9 h-9 rounded-xl honey-gradient flex items-center justify-center text-lg">🐝</div>
            <div>
              <p className="font-extrabold leading-none text-sm">Beetz</p>
              <p className="text-[10px] text-beetz-dark/50 leading-none mt-0.5">Portal do Produtor</p>
            </div>
          </Link>
          <div className="flex items-center gap-3">
            {producer && <span className="text-sm text-beetz-dark/60 hidden sm:inline">{producer.name}</span>}
            <button onClick={handleSignOut} className="text-beetz-dark/40 hover:text-beetz-dark p-2 rounded-lg hover:bg-beetz-gray" title="Sair">
              <LogOut size={18} />
            </button>
          </div>
        </div>
      </header>
      <main className="max-w-5xl mx-auto px-5 py-8">{children}</main>
    </div>
  )
}
