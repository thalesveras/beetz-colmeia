import type { ReactNode } from 'react'
import Sidebar from './Sidebar'
import MobileNav from './MobileNav'
import NotificationBell from './NotificationBell'

export default function AppLayout({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen flex bg-beetz-gray">
      <Sidebar />
      <main className="flex-1 min-w-0 pb-20 md:pb-0">
        {/* Barra fina só pro sininho — o app não tinha header nenhum antes. */}
        <div className="sticky top-0 z-30 bg-beetz-gray/80 backdrop-blur-sm">
          <div className="max-w-6xl mx-auto px-4 md:px-8 pt-3 flex justify-end">
            <NotificationBell />
          </div>
        </div>
        <div className="max-w-6xl mx-auto p-4 md:p-8 pt-2 md:pt-2">{children}</div>
      </main>
      <MobileNav />
    </div>
  )
}
