// Gráficos do dashboard financeiro.
//
// Feitos na mão com CSS/SVG em vez de puxar uma biblioteca: os conjuntos aqui
// são pequenos (7 eventos, 4 categorias, 8 fornecedores) e adicionar ~100kb de
// dependência pra desenhar 4 barras não se paga — além de evitar risco no
// build, que agora roda pelo GitHub. Barra é clicável pra cruzar filtro.

export interface ChartDatum {
  key: string
  label: string
  value: number
}

export function formatMoney(v: number) {
  return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 })
}

export function formatMoneyFull(v: number) {
  return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', minimumFractionDigits: 2 })
}

interface BarsProps {
  data: ChartDatum[]
  onSelect?: (key: string) => void
  selectedKey?: string | null
  emptyLabel?: string
}

// Barras horizontais: a melhor escolha quando o rótulo é texto ("0507 SANTO
// FOGO", "Sem fornecedor") — em barra vertical o nome não cabe e vira legenda.
export function HorizontalBars({ data, onSelect, selectedKey, emptyLabel = 'Sem dados para esses filtros.' }: BarsProps) {
  if (data.length === 0) return <p className="text-sm text-beetz-dark/40 py-6 text-center">{emptyLabel}</p>
  const max = Math.max(...data.map((d) => d.value), 1)
  const total = data.reduce((s, d) => s + d.value, 0)

  return (
    <div className="space-y-2.5">
      {data.map((d) => {
        const pct = (d.value / max) * 100
        const share = total > 0 ? (d.value / total) * 100 : 0
        const isSelected = selectedKey === d.key
        const dim = selectedKey != null && !isSelected
        return (
          <button
            key={d.key}
            onClick={() => onSelect?.(d.key)}
            disabled={!onSelect}
            className={`w-full text-left group ${onSelect ? 'cursor-pointer' : 'cursor-default'} ${dim ? 'opacity-40' : ''}`}
            title={onSelect ? 'Clique pra filtrar por isso' : undefined}
          >
            <div className="flex items-baseline justify-between gap-3 mb-1">
              <span className={`text-xs truncate ${isSelected ? 'font-bold' : 'font-medium text-beetz-dark/70'}`}>{d.label}</span>
              <span className="text-xs font-semibold text-beetz-dark shrink-0">
                {formatMoney(d.value)}
                <span className="text-beetz-dark/40 font-normal ml-1.5">{share.toFixed(0)}%</span>
              </span>
            </div>
            <div className="h-2.5 bg-beetz-gray rounded-full overflow-hidden">
              <div
                className={`h-full rounded-full transition-all ${isSelected ? 'bg-beetz-dark' : 'honey-gradient group-hover:brightness-95'}`}
                style={{ width: `${Math.max(pct, 1.5)}%` }}
              />
            </div>
          </button>
        )
      })}
    </div>
  )
}

const MONTH_SHORT = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez']

export function monthLabel(ym: string) {
  const [y, m] = ym.split('-')
  const idx = Number(m) - 1
  return `${MONTH_SHORT[idx] ?? m}/${(y ?? '').slice(2)}`
}

// Barras verticais pro tempo — mês é sequência, e ler da esquerda pra direita
// mostra tendência melhor que barra deitada.
export function MonthlyBars({ data, onSelect, selectedKey }: BarsProps) {
  if (data.length === 0) return <p className="text-sm text-beetz-dark/40 py-6 text-center">Sem dados para esses filtros.</p>
  const max = Math.max(...data.map((d) => d.value), 1)

  return (
    <div className="flex items-end gap-2 h-44 pt-4">
      {data.map((d) => {
        const pct = (d.value / max) * 100
        const isSelected = selectedKey === d.key
        const dim = selectedKey != null && !isSelected
        return (
          <button
            key={d.key}
            onClick={() => onSelect?.(d.key)}
            disabled={!onSelect}
            className={`flex-1 flex flex-col items-center justify-end h-full group ${onSelect ? 'cursor-pointer' : 'cursor-default'} ${dim ? 'opacity-40' : ''}`}
            title={onSelect ? 'Clique pra filtrar esse mês' : undefined}
          >
            <span className="text-[10px] font-semibold text-beetz-dark/60 mb-1 whitespace-nowrap">
              {d.value > 0 ? formatMoney(d.value) : ''}
            </span>
            <div
              className={`w-full rounded-t-lg transition-all ${isSelected ? 'bg-beetz-dark' : 'honey-gradient group-hover:brightness-95'}`}
              style={{ height: `${Math.max(pct, 2)}%` }}
            />
            <span className={`text-[11px] mt-1.5 ${isSelected ? 'font-bold' : 'text-beetz-dark/50'}`}>{d.label}</span>
          </button>
        )
      })}
    </div>
  )
}

// Rosca pra composição — só faz sentido com poucas fatias, então quem chama
// limita o top N e agrupa o resto.
const DONUT_COLORS = ['#fed417', '#050505', '#f59e0b', '#94a3b8', '#d4d4d8', '#fbbf24']

export function Donut({ data, onSelect, selectedKey }: BarsProps) {
  if (data.length === 0) return <p className="text-sm text-beetz-dark/40 py-6 text-center">Sem dados para esses filtros.</p>
  const total = data.reduce((s, d) => s + d.value, 0)
  if (total <= 0) return <p className="text-sm text-beetz-dark/40 py-6 text-center">Sem valores para esses filtros.</p>

  const R = 60
  const C = 2 * Math.PI * R
  let acc = 0

  return (
    <div className="flex flex-col sm:flex-row items-center gap-5">
      <svg viewBox="0 0 160 160" className="w-40 h-40 shrink-0 -rotate-90">
        {data.map((d, i) => {
          const frac = d.value / total
          const len = frac * C
          const dash = `${len} ${C - len}`
          const offset = -acc * C
          acc += frac
          const dim = selectedKey != null && selectedKey !== d.key
          return (
            <circle
              key={d.key}
              cx="80" cy="80" r={R}
              fill="none"
              stroke={DONUT_COLORS[i % DONUT_COLORS.length]}
              strokeWidth="26"
              strokeDasharray={dash}
              strokeDashoffset={offset}
              opacity={dim ? 0.35 : 1}
            />
          )
        })}
      </svg>
      <div className="flex-1 w-full space-y-1.5">
        {data.map((d, i) => {
          const share = (d.value / total) * 100
          const isSelected = selectedKey === d.key
          return (
            <button
              key={d.key}
              onClick={() => onSelect?.(d.key)}
              disabled={!onSelect}
              className={`w-full flex items-center gap-2 text-left ${onSelect ? 'cursor-pointer hover:bg-beetz-gray' : ''} rounded-lg px-2 py-1 ${
                selectedKey != null && !isSelected ? 'opacity-40' : ''
              }`}
            >
              <span className="w-2.5 h-2.5 rounded-sm shrink-0" style={{ background: DONUT_COLORS[i % DONUT_COLORS.length] }} />
              <span className={`text-xs flex-1 truncate ${isSelected ? 'font-bold' : 'text-beetz-dark/70'}`}>{d.label}</span>
              <span className="text-xs font-semibold shrink-0">{formatMoney(d.value)}</span>
              <span className="text-[11px] text-beetz-dark/40 w-9 text-right shrink-0">{share.toFixed(0)}%</span>
            </button>
          )
        })}
      </div>
    </div>
  )
}
