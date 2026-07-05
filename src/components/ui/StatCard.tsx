import type { ReactNode } from 'react'

export default function StatCard({ icon, label, value }: { icon: ReactNode; label: string; value: string | number }) {
  return (
    <div className="bg-white rounded-2xl p-5 shadow-soft border border-beetz-dark/5 flex items-center gap-4">
      <div className="w-12 h-12 rounded-xl honey-gradient flex items-center justify-center text-2xl shrink-0">{icon}</div>
      <div>
        <p className="text-2xl font-extrabold leading-none">{value}</p>
        <p className="text-sm text-beetz-dark/60 mt-1">{label}</p>
      </div>
    </div>
  )
}
