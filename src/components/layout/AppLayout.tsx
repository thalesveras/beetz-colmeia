import type { ReactNode } from 'react'
import Sidebar from './Sidebar'
import MobileNav from './MobileNav'

export default function AppLayout({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen flex bg-beetz-gray">
      <Sidebar />
      <main className="flex-1 min-w-0 pb-20 md:pb-0">
        <div className="max-w-6xl mx-auto p-4 md:p-8">{children}</div>
      </main>
      <MobileNav />
    </div>
  )
}
