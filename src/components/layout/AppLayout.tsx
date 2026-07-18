import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import Sidebar from './Sidebar'
import MobileNav from './MobileNav'
import NotificationBell from './NotificationBell'
import BrandLogo from '../ui/BrandLogo'

export default function AppLayout({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen flex bg-beetz-gray">
      <Sidebar />
      <main className="flex-1 min-w-0 pb-20 md:pb-0">
        {/* Barra fina do topo: no celular, o símbolo da marca à esquerda leva
            pro início (no desktop o menu lateral já cumpre esse papel, então
            lá ele some) e o sininho segue à direita. */}
        <div className="sticky top-0 z-30 bg-beetz-gray/80 backdrop-blur-sm">
          <div className="max-w-6xl mx-auto px-4 md:px-8 pt-3 flex items-center justify-between">
            <Link to="/dashboard" className="md:hidden active:scale-95 transition-transform" aria-label="Ir para o início">
              <BrandLogo size="sm" />
            </Link>
            <span className="hidden md:block" />
            <NotificationBell />
          </div>
        </div>
        <div className="max-w-6xl mx-auto p-4 md:p-8 pt-2 md:pt-2">{children}</div>
      </main>
      <MobileNav />
    </div>
  )
}
