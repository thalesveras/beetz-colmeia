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
        {/* Barra do topo no padrão da casa: no celular ela é escura como o
            menu e a barra inferior — marca com nome à esquerda (leva pro
            início) e sininho à direita. No desktop o menu lateral já carrega
            a marca, então a barra vira só um encosto discreto pro sino. */}
        <div className="sticky top-0 z-30 bg-beetz-dark md:bg-beetz-gray/80 md:backdrop-blur-sm border-b border-white/10 md:border-transparent">
          <div className="max-w-6xl mx-auto px-4 md:px-8 py-2 md:py-0 md:pt-3 flex items-center justify-between text-white md:text-beetz-dark">
            <Link to="/dashboard" className="md:hidden active:scale-95 transition-transform" aria-label="Ir para o início">
              <BrandLogo size="sm" withName />
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
