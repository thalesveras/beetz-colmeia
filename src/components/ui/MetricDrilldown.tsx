import { Link } from 'react-router-dom'
import { ArrowRight, X } from 'lucide-react'
import type { ReactNode } from 'react'

export interface DrilldownBreakdown {
  label: string
  value: string | number
  /** Destaca a linha (ex: pendências, números que exigem ação). */
  highlight?: boolean
}

interface Props {
  title: string
  subtitle?: string
  /** O número grande, repetido aqui pra âncora visual com o cartão clicado. */
  value?: string | number
  breakdown?: DrilldownBreakdown[]
  /** Explica COMO o número é calculado. Sem isso, drill-down vira só uma lista. */
  howItsMade?: string
  children?: ReactNode
  action?: { to: string; label: string }
  onClose: () => void
}

// Painel de detalhe de uma métrica do dashboard. A regra que vale pra todos:
// mostrar a composição do número e explicar de onde ele vem. Número sem
// procedência é número que ninguém confia na hora da decisão.
export default function MetricDrilldown({
  title, subtitle, value, breakdown, howItsMade, children, action, onClose
}: Props) {
  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-end sm:items-center justify-center p-0 sm:p-4" onClick={onClose}>
      <div
        className="bg-white rounded-t-3xl sm:rounded-3xl w-full max-w-lg max-h-[85vh] overflow-y-auto p-6"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3 mb-4">
          <div className="min-w-0">
            <h3 className="text-lg font-extrabold">{title}</h3>
            {subtitle && <p className="text-sm text-beetz-dark/50 mt-0.5">{subtitle}</p>}
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-beetz-gray shrink-0" aria-label="Fechar">
            <X size={18} />
          </button>
        </div>

        {value !== undefined && (
          <p className="text-4xl font-extrabold mb-5">{value}</p>
        )}

        {breakdown && breakdown.length > 0 && (
          <div className="space-y-1 mb-5">
            {breakdown.map((b) => (
              <div
                key={b.label}
                className={`flex items-center justify-between gap-3 rounded-xl px-3 py-2.5 ${
                  b.highlight ? 'bg-beetz-yellow/20 border border-beetz-yellow/40' : 'bg-beetz-gray/60'
                }`}
              >
                <span className="text-sm text-beetz-dark/70 min-w-0 truncate">{b.label}</span>
                <span className="text-sm font-bold shrink-0">{b.value}</span>
              </div>
            ))}
          </div>
        )}

        {children}

        {howItsMade && (
          <div className="border-t border-beetz-dark/5 pt-4 mt-5">
            <p className="text-[11px] font-bold uppercase tracking-wide text-beetz-dark/35 mb-1">Como esse número é calculado</p>
            <p className="text-xs text-beetz-dark/50 leading-relaxed">{howItsMade}</p>
          </div>
        )}

        {action && (
          <Link
            to={action.to}
            className="flex items-center justify-center gap-2 honey-gradient text-beetz-dark font-bold py-2.5 rounded-xl text-sm mt-5"
          >
            {action.label} <ArrowRight size={15} />
          </Link>
        )}
      </div>
    </div>
  )
}
