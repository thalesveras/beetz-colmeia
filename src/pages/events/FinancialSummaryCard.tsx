import { useEffect, useState } from 'react'
import { Save, ShieldCheck } from 'lucide-react'
import { getEventFinancialSummary, updateEvent } from '../../lib/dataService'
import type { EventFinancialSummary, EventItem } from '../../lib/types'

const inputClass = 'w-full border border-beetz-dark/15 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-beetz-yellow'

function currency(v: number) {
  return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

interface Props {
  event: EventItem
  onEventUpdated: (updated: EventItem) => void
}

export default function FinancialSummaryCard({ event, onEventUpdated }: Props) {
  const [summary, setSummary] = useState<EventFinancialSummary | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  const [salesAmount, setSalesAmount] = useState(event.sales_amount)
  const [percentage, setPercentage] = useState(event.commission_percentage)
  const [creditsBonus, setCreditsBonus] = useState(event.credits_bonus)
  const [repasses, setRepasses] = useState(event.repasses)

  async function load() {
    setLoading(true)
    setSummary(await getEventFinancialSummary(event.id))
    setLoading(false)
  }

  useEffect(() => { load() }, [event.id])
  useEffect(() => {
    setSalesAmount(event.sales_amount)
    setPercentage(event.commission_percentage)
    setCreditsBonus(event.credits_bonus)
    setRepasses(event.repasses)
  }, [event])

  async function handleSave() {
    setSaving(true)
    const updated = await updateEvent(event.id, {
      sales_amount: salesAmount, commission_percentage: percentage,
      credits_bonus: creditsBonus, repasses
    })
    onEventUpdated(updated)
    await load()
    setSaving(false)
  }

  return (
    <div className="bg-beetz-dark text-white rounded-2xl p-6 shadow-soft border border-beetz-dark/5">
      <div className="flex items-center gap-2 mb-1">
        <ShieldCheck size={18} className="text-beetz-yellow" />
        <h2 className="font-bold">Fechamento — visão diretoria</h2>
      </div>
      <p className="text-sm text-white/50 mb-5">
        Vendas, percentual, créditos e repasses são entradas manuais. Os demais valores são calculados
        a partir das despesas, produtos e consumo da produção lançados neste evento.
      </p>

      <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-5">
        <div>
          <label className="text-xs text-white/60 block mb-1">Vendas (R$)</label>
          <input type="number" min={0} step="0.01" className={`${inputClass} bg-white/10 border-white/15 text-white`} value={salesAmount} onChange={(e) => setSalesAmount(Number(e.target.value))} />
        </div>
        <div>
          <label className="text-xs text-white/60 block mb-1">Percentual (%)</label>
          <input type="number" min={0} max={100} step="0.1" className={`${inputClass} bg-white/10 border-white/15 text-white`} value={percentage} onChange={(e) => setPercentage(Number(e.target.value))} />
        </div>
        <div>
          <label className="text-xs text-white/60 block mb-1">Créditos ou bonificações (R$)</label>
          <input type="number" step="0.01" className={`${inputClass} bg-white/10 border-white/15 text-white`} value={creditsBonus} onChange={(e) => setCreditsBonus(Number(e.target.value))} />
        </div>
        <div>
          <label className="text-xs text-white/60 block mb-1">Repasses (R$)</label>
          <input type="number" step="0.01" className={`${inputClass} bg-white/10 border-white/15 text-white`} value={repasses} onChange={(e) => setRepasses(Number(e.target.value))} />
        </div>
      </div>

      <button
        onClick={handleSave}
        disabled={saving}
        className="flex items-center gap-1.5 honey-gradient text-beetz-dark font-bold px-4 py-2 rounded-xl text-sm disabled:opacity-60 mb-6"
      >
        <Save size={14} /> {saving ? 'Salvando...' : 'Salvar valores'}
      </button>

      {loading || !summary ? (
        <p className="text-sm text-white/50">Calculando fechamento...</p>
      ) : (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3 pt-5 border-t border-white/10">
          <SummaryTile label="Despesas do evento" value={summary.despesas} />
          <SummaryTile label="Custo de produtos" value={summary.custoProdutos} />
          <SummaryTile label="Consumo da produção" value={summary.consumoProducao} />
          <SummaryTile label="A receber" value={summary.aReceber} />
          <SummaryTile label="Saldo a receber da produtora" value={summary.saldoAReceberDaProdutora} />
          <SummaryTile
            label="Lucro ou perda"
            value={summary.lucroOuPerda}
            highlight={summary.lucroOuPerda >= 0 ? 'positive' : 'negative'}
          />
        </div>
      )}
    </div>
  )
}

function SummaryTile({ label, value, highlight }: { label: string; value: number; highlight?: 'positive' | 'negative' }) {
  const color = highlight === 'positive' ? 'text-green-400' : highlight === 'negative' ? 'text-red-400' : 'text-beetz-yellow'
  return (
    <div className="bg-white/5 rounded-xl p-4">
      <p className="text-xs text-white/50">{label}</p>
      <p className={`font-bold text-lg mt-1 ${color}`}>{currency(value)}</p>
    </div>
  )
}
