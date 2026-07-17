import type { ReactNode } from 'react'
import { ChevronRight } from 'lucide-react'

interface Props {
  icon: ReactNode
  label: string
  value: string | number
  /** Quando existe, o cartão vira botão e abre o detalhe da métrica. */
  onClick?: () => void
  /** Linha curta abaixo do rótulo — o "por quê" do número. */
  hint?: string
}

// Cartão de número. Vira botão só quando alguém passa onClick: cartão que
// parece clicável e não faz nada é pior que cartão morto.
export default function StatCard({ icon, label, value, onClick, hint }: Props) {
  const inner = (
    <>
      <div className="w-12 h-12 rounded-xl honey-gradient flex items-center justify-center text-2xl shrink-0">{icon}</div>
      <div className="min-w-0 flex-1 text-left">
        <p className="text-2xl font-extrabold leading-none truncate">{value}</p>
        <p className="text-sm text-beetz-dark/60 mt-1">{label}</p>
        {hint && <p className="text-[11px] text-beetz-dark/35 mt-0.5 truncate">{hint}</p>}
      </div>
      {onClick && <ChevronRight size={16} className="text-beetz-dark/20 shrink-0" />}
    </>
  )

  if (!onClick) {
    return (
      <div className="bg-white rounded-2xl p-5 shadow-soft border border-beetz-dark/5 flex items-center gap-4">
        {inner}
      </div>
    )
  }

  return (
    <button
      onClick={onClick}
      className="bg-white rounded-2xl p-5 shadow-soft border border-beetz-dark/5 flex items-center gap-4 w-full
                 hover:border-beetz-yellow hover:shadow-md transition-all text-left"
    >
      {inner}
    </button>
  )
}
